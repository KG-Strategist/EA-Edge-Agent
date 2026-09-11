use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::accept_async;

type WsSink = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    tokio_tungstenite::tungstenite::Message,
>;

#[derive(Debug, Deserialize)]
struct Incoming {
    id: Option<String>,
    r#type: String,
    messages: Option<Vec<Value>>,
    max_tokens: Option<usize>,
}

enum Relay {
    Ws(tokio_tungstenite::tungstenite::Message),
    Abort(String),
    Done,
}

async fn handle_connection(stream: tokio::net::TcpStream) {
    let ws = match accept_async(stream).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[daemon] ws accept error: {e}");
            return;
        }
    };

    let (mut ws_tx, mut ws_rx) = ws.split();
    let (relay_tx, mut relay_rx) = mpsc::channel::<Relay>(64);

    let mut active_id: Option<String> = None;
    let mut abort_tx: Option<mpsc::Sender<()>> = None;

    // Writer task — serializes sink access
    let mut write_handle = tokio::spawn(async move {
        while let Some(relay) = relay_rx.recv().await {
            match relay {
                Relay::Ws(msg) => {
                    if ws_tx.send(msg).await.is_err() {
                        break;
                    }
                }
                Relay::Done => break,
                Relay::Abort(_) => {}
            }
        }
    });

    loop {
        tokio::select! {
            msg = ws_rx.next() => {
                let msg = match msg {
                    Some(Ok(m)) => m,
                    _ => break,
                };

                let text = match msg.to_text() {
                    Ok(t) => t.to_string(),
                    Err(_) => continue,
                };

                let incoming: Incoming = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(e) => {
                        let _ = relay_tx.send(Relay::Ws(tokio_tungstenite::tungstenite::Message::Text(
                            serde_json::to_string(&json!({"type":"ERROR","message":format!("bad json: {e}")})).unwrap().into(),
                        ))).await;
                        continue;
                    }
                };

                match incoming.r#type.as_str() {
                    "GENERATE" => {
                        // Abort any in-flight generation first
                        if let Some(prev) = abort_tx.take() {
                            let _ = prev.send(()).await;
                        }

                        let id = incoming.id.unwrap_or_else(|| format!("gen-{}", rand_id()));
                        let max_tokens = incoming.max_tokens.unwrap_or(2048);
                        let messages = incoming.messages.unwrap_or_default();

                        let prompt = messages
                            .iter()
                            .rev()
                            .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
                            .and_then(|m| m.get("content").and_then(|c| c.as_str()))
                            .unwrap_or("")
                            .to_string();

                        let (a_tx, mut a_rx) = mpsc::channel::<()>(1);
                        abort_tx = Some(a_tx);
                        active_id = Some(id.clone());

                        let relay = relay_tx.clone();
                        let id_c = id.clone();

                        tokio::spawn(async move {
                            let tokens = mock_tokenize(&prompt);
                            let count = tokens.len().min(max_tokens);
                            let mut full = String::new();

                            for (i, tok) in tokens.into_iter().take(count).enumerate() {
                                if a_rx.try_recv().is_ok() {
                                    let _ = relay.send(Relay::Ws(tokio_tungstenite::tungstenite::Message::Text(
                                        serde_json::to_string(&json!({"type":"ERROR","id":id_c,"message":"Generation aborted"})).unwrap().into(),
                                    ))).await;
                                    return;
                                }
                                full.push_str(&tok);
                                let _ = relay.send(Relay::Ws(tokio_tungstenite::tungstenite::Message::Text(
                                    serde_json::to_string(&json!({"type":"INFERENCE_CHUNK","id":id_c,"token":tok,"pos":i})).unwrap().into(),
                                ))).await;
                                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                            }

                            let _ = relay.send(Relay::Ws(tokio_tungstenite::tungstenite::Message::Text(
                                serde_json::to_string(&json!({"type":"INFERENCE_COMPLETE","id":id_c,"fullText":full,"tokenCount":count})).unwrap().into(),
                            ))).await;
                        });
                    }
                    "ABORT" => {
                        if let Some(prev) = abort_tx.take() {
                            let _ = prev.send(()).await;
                        }
                        if let Some(id) = active_id.take() {
                            let _ = relay_tx.send(Relay::Ws(tokio_tungstenite::tungstenite::Message::Text(
                                serde_json::to_string(&json!({"type":"ABORTED","id":id})).unwrap().into(),
                            ))).await;
                        }
                    }
                    "RESET_SESSION" => {
                        if let Some(prev) = abort_tx.take() {
                            let _ = prev.send(()).await;
                        }
                        active_id = None;
                    }
                    other => {
                        let _ = relay_tx.send(Relay::Ws(tokio_tungstenite::tungstenite::Message::Text(
                            serde_json::to_string(&json!({"type":"ERROR","message":format!("unknown type: {other}")})).unwrap().into(),
                        ))).await;
                    }
                }
            }
        }
    }

    // Cleanup
    if let Some(prev) = abort_tx.take() {
        let _ = prev.send(()).await;
    }
    let _ = relay_tx.send(Relay::Done).await;
    let _ = write_handle.await;
}

fn mock_tokenize(prompt: &str) -> Vec<String> {
    if prompt.is_empty() {
        return vec!["[no input]".into()];
    }
    prompt
        .split_whitespace()
        .map(|w| format!("{w} "))
        .chain(std::iter::once("\n".into()))
        .collect()
}

fn rand_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("{t:x}")
}

#[tokio::main]
async fn main() {
    let addr = "127.0.0.1:8080";
    let listener = TcpListener::bind(addr).await.expect("Failed to bind 127.0.0.1:8080");
    println!("[eaniti-daemon] listening on ws://{addr}");

    while let Ok((stream, peer)) = listener.accept().await {
        println!("[daemon] connection from {peer}");
        tokio::spawn(handle_connection(stream));
    }
}
