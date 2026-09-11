import { useState, useMemo, useEffect, useCallback } from 'react';
import { Radio, Copy, Link2, Send, Download, Upload } from 'lucide-react';
import { SyncMeshService, SyncOffer, SyncAnswer, SyncPayload } from '../../lib/syncMeshService';
import { useNotification } from '../../context/NotificationContext';
import { buildEncryptedEnvelope } from '../../lib/brainPayload';
import { Logger } from '../../lib/logger';

interface ReceivedNote {
  peerId: string;
  kind: string;
  at: string;
}

function encodeSignal(value: unknown): string {
  const json = JSON.stringify(value);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSignal<T>(raw: string): T {
  return JSON.parse(decodeURIComponent(escape(atob(raw.trim())))) as T;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * P2PSyncPanel — Layer 1 caller for the SyncMesh engine (Stage 2 early slice).
 * Offer/answer signaling travels via QR code or clipboard paste; media never
 * leaves the LAN (host-only ICE unless the user opts into STUN after consent).
 * Full brain-payload transfer rides this channel in the v2 epic; this panel
 * ships signaling + presence + ping plus received-payload visibility.
 */
export default function P2PSyncPanel() {
  const { addNotification } = useNotification();
  const [offerText, setOfferText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [remoteOffer, setRemoteOffer] = useState('');
  const [remoteAnswer, setRemoteAnswer] = useState('');
  const [offerError, setOfferError] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [received, setReceived] = useState<ReceivedNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [brainBusy, setBrainBusy] = useState(false);
  const [receivedBrain, setReceivedBrain] = useState<{ peerId: string; envelope: unknown } | null>(null);

  const service = useMemo(
    () =>
      new SyncMeshService({
        onPeerConnected: (peerId) => {
          addNotification(`P2P peer connected: ${peerId}`, 'success', 4000);
        },
        onPeerDisconnected: () => {
          addNotification('P2P peer disconnected.', 'info', 4000);
        },
        onPayloadReceived: (peerId, payload) => {
          setReceived((prev) =>
            [{ peerId, kind: payload.type, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 5)
          );
          if (payload.type === 'brain-export' && payload.data) {
            setReceivedBrain({ peerId, envelope: payload.data });
          }
        },
        onError: (error) => {
          addNotification(error.message || 'P2P sync error.', 'error', 5000);
        },
      }),
    [addNotification]
  );

  useEffect(() => {
    setPeers(service.connectedPeers);
    return () => {
      service.disconnectAll();
    };
  }, [service]);

  const refreshPeers = useCallback(() => {
    setPeers([...service.connectedPeers]);
  }, [service]);

  const handleCreateOffer = useCallback(async () => {
    setBusy(true);
    setOfferError(null);
    try {
      const offer = await service.createOffer();
      setOfferText(encodeSignal(offer));
      refreshPeers();
    } catch (e) {
      Logger.warn('[P2PSyncPanel] createOffer failed', e);
      addNotification('Could not create a P2P offer on this device.', 'error', 5000);
    } finally {
      setBusy(false);
    }
  }, [service, addNotification, refreshPeers]);

  const handleCreateAnswer = useCallback(async () => {
    setBusy(true);
    setOfferError(null);
    try {
      const offer = decodeSignal<SyncOffer>(remoteOffer);
      const answer = await service.acceptOffer(offer);
      setAnswerText(encodeSignal(answer));
      refreshPeers();
    } catch (e) {
      Logger.warn('[P2PSyncPanel] acceptOffer failed', e);
      setOfferError('Invalid offer — paste the exact text from the other device.');
    } finally {
      setBusy(false);
    }
  }, [service, remoteOffer, refreshPeers]);

  const handleComplete = useCallback(async () => {
    setBusy(true);
    setOfferError(null);
    try {
      const answer = decodeSignal<SyncAnswer>(remoteAnswer);
      // Complete against our most recent pending peer (single-peer flow).
      const pending = service.connectedPeers;
      const peerId = pending[0];
      if (!peerId) {
        setOfferError('Create an offer first, then paste the answer here.');
        return;
      }
      await service.completeSignaling(peerId, answer);
      addNotification('P2P handshake complete.', 'success', 4000);
      refreshPeers();
    } catch (e) {
      Logger.warn('[P2PSyncPanel] completeSignaling failed', e);
      setOfferError('Invalid answer — paste the exact text from the other device.');
    } finally {
      setBusy(false);
    }
  }, [service, remoteAnswer, addNotification, refreshPeers]);

  const handleCopy = useCallback(
    async (value: string, label: string) => {
      const ok = await copyText(value);
      addNotification(ok ? `${label} copied to clipboard.` : 'Clipboard unavailable — select and copy manually.', ok ? 'success' : 'warning', 4000);
    },
    [addNotification]
  );

  const handlePing = useCallback(async () => {
    const payload: SyncPayload = {
      type: 'ping',
      data: null,
      metadata: {
        deviceId: service.localDeviceId,
        tableCount: 0,
        recordCount: 0,
        encrypted: false,
        timestamp: Date.now(),
      },
    };
    const sent = await service.broadcastPayload(payload);
    addNotification(sent > 0 ? `Ping sent to ${sent} peer(s).` : 'No peers connected.', sent > 0 ? 'success' : 'info', 4000);
    refreshPeers();
  }, [service, addNotification, refreshPeers]);

  const handleSendBrain = useCallback(async () => {
    if (peers.length === 0) {
      addNotification('Connect to a peer first.', 'info', 4000);
      return;
    }
    setBrainBusy(true);
    try {
      const { db } = await import('../../lib/db');
      const tables = db.tables.filter(t => {
        const name = t.name;
        return !/vector|embedding|session|history|cache|audit|logs/i.test(name);
      });
      const dump: Record<string, unknown[]> = {};
      let totalRecords = 0;
      for (const table of tables) {
        const rows = await table.toArray();
        dump[table.name] = rows;
        totalRecords += rows.length;
      }
      const dumpJson = JSON.stringify(dump);
      let envelope: unknown;
      try {
        envelope = await buildEncryptedEnvelope(dumpJson, Object.keys(dump));
      } catch {
        envelope = { format: 'niti-brain-plain', version: 1, exportedAt: new Date().toISOString(), tables: Object.keys(dump), payload: dumpJson };
      }
      const sent = await service.broadcastBrainPayload(envelope);
      addNotification(
        sent > 0 ? `Brain sent to ${sent} peer(s) (${totalRecords} records).` : 'No peers connected.',
        sent > 0 ? 'success' : 'info',
        5000
      );
    } catch (e) {
      Logger.warn('[P2PSyncPanel] sendBrain failed', e);
      addNotification('Failed to build brain payload.', 'error', 5000);
    } finally {
      setBrainBusy(false);
    }
  }, [peers, service, addNotification]);

  const handleImportBrain = useCallback(async () => {
    if (!receivedBrain) return;
    setBrainBusy(true);
    try {
      const { parseBrainPayload } = await import('../../lib/brainPayload');
      const { db } = await import('../../lib/db');
      const parsed = await parseBrainPayload(JSON.stringify(receivedBrain.envelope));
      const data = parsed.dump as Record<string, unknown[]>;
      const tableNames = Object.keys(data);
      await db.transaction('rw', db.tables, async () => {
        for (const name of tableNames) {
          const table = db.table(name);
          if (table && Array.isArray(data[name]) && data[name].length > 0) {
            await table.bulkPut(data[name]);
          }
        }
      });
      addNotification(`Brain imported from ${receivedBrain.peerId} (${tableNames.length} tables).`, 'success', 5000);
      setReceivedBrain(null);
    } catch (e) {
      Logger.warn('[P2PSyncPanel] importBrain failed', e);
      addNotification('Failed to import brain payload.', 'error', 5000);
    } finally {
      setBrainBusy(false);
    }
  }, [receivedBrain, addNotification]);

  return (
    <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Radio size={16} className="text-gray-500" />
          Peer-to-Peer Sync (LAN, no cloud)
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Exchange offers and answers via QR code or clipboard. Connections stay on the local network — no cloud relay, no account.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreateOffer}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Link2 size={16} />
            Create offer
          </button>
          <button
            onClick={handleCreateAnswer}
            disabled={busy || !remoteOffer.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border-2 border-indigo-200 dark:border-indigo-700 hover:border-indigo-500 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Create answer
          </button>
          <button
            onClick={handlePing}
            disabled={busy || peers.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm border border-gray-200 dark:border-transparent transition-colors disabled:opacity-50"
          >
            <Send size={16} />
            Ping peers
          </button>
          <button
            onClick={handleSendBrain}
            disabled={brainBusy || peers.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Upload size={16} />
            Send Brain
          </button>
          {receivedBrain && (
            <button
              onClick={handleImportBrain}
              disabled={brainBusy}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Download size={16} />
              Import Brain from {receivedBrain.peerId.slice(0, 8)}
            </button>
          )}
        </div>

        {offerText && (
          <div>
            <label htmlFor="p2p-offer" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              P2P offer — share via QR or clipboard
            </label>
            <textarea
              id="p2p-offer"
              aria-label="P2P offer"
              readOnly
              rows={3}
              value={offerText}
              className="w-full font-mono text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            />
            <button
              onClick={() => handleCopy(offerText, 'Offer')}
              className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Copy size={14} />
              Copy offer
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="p2p-remote-offer" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Paste remote offer
            </label>
            <textarea
              id="p2p-remote-offer"
              aria-label="Paste remote offer"
              rows={3}
              value={remoteOffer}
              onChange={(e) => setRemoteOffer(e.target.value)}
              placeholder="Paste the offer text from the other device…"
              className="w-full font-mono text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            />
          </div>
          <div>
            <label htmlFor="p2p-remote-answer" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Paste remote answer
            </label>
            <textarea
              id="p2p-remote-answer"
              aria-label="Paste remote answer"
              rows={3}
              value={remoteAnswer}
              onChange={(e) => setRemoteAnswer(e.target.value)}
              placeholder="Paste the answer text from the other device…"
              className="w-full font-mono text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleComplete}
            disabled={busy || !remoteAnswer.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Connect with answer
          </button>
        </div>

        {answerText && (
          <div>
            <label htmlFor="p2p-answer" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              P2P answer — share back to the offer creator
            </label>
            <textarea
              id="p2p-answer"
              aria-label="P2P answer"
              readOnly
              rows={3}
              value={answerText}
              className="w-full font-mono text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            />
            <button
              onClick={() => handleCopy(answerText, 'Answer')}
              className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Copy size={14} />
              Copy answer
            </button>
          </div>
        )}

        {offerError && (
          <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
            <p className="text-xs text-red-600 dark:text-red-300">{offerError}</p>
          </div>
        )}

        <div className="text-xs text-gray-600 dark:text-gray-300">
          {peers.length === 0 ? (
            <p>No peers connected.</p>
          ) : (
            <ul className="space-y-1">
              {peers.map((peerId) => (
                <li key={peerId} className="font-mono">
                  ● {peerId}
                </li>
              ))}
            </ul>
          )}
          {received.length > 0 && (
            <ul className="mt-2 space-y-1">
              {received.map((note, i) => (
                <li key={`${note.peerId}-${i}`}>
                  ⇐ {note.kind} from <span className="font-mono">{note.peerId}</span> at {note.at}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
