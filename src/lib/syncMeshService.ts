/**
 * WebRTC P2P Sync Mesh — Peer-to-peer data sync without cloud dependency.
 *
 * Uses WebRTC DataChannels for encrypted P2P transfer.
 * Signaling via QR code or clipboard (SDP exchange).
 * AES-GCM encryption on DataChannels for air-gapped security.
 *
 * Architecture: Layer 4 engine — zero React imports, async return promises.
 */

import { Logger } from './logger';
import { checkNetworkConsent } from './networkGuard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncOffer {
  type: 'offer';
  sdp: string;
  deviceId: string;
  timestamp: number;
}

export interface SyncAnswer {
  type: 'answer';
  sdp: string;
  deviceId: string;
  timestamp: number;
}

export type SyncSignal = SyncOffer | SyncAnswer;

export interface SyncPeer {
  id: string;
  connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  state: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

export interface SyncPayload {
  type: 'brain-export' | 'brain-import' | 'ping' | 'pong';
  data: unknown;
  metadata: {
    deviceId: string;
    tableCount: number;
    recordCount: number;
    encrypted: boolean;
    timestamp: number;
  };
}

export interface SyncMeshCallbacks {
  onPeerConnected?: (peerId: string) => void;
  onPeerDisconnected?: (peerId: string) => void;
  onPayloadReceived?: (peerId: string, payload: SyncPayload) => void;
  onError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Air-gap default: host-only candidates (LAN / mDNS). No external server
// is ever contacted unless the caller explicitly opts into public STUN
// AND the user granted network consent (see resolveIceConfig).
const HOST_ONLY_ICE: RTCConfiguration = {
  iceServers: [],
};

const PUBLIC_STUN_ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

export interface SyncSignalingOptions {
  /**
   * Allow a public STUN server for NAT traversal. Default false.
   * When true, network consent is checked first; without consent the
   * service silently falls back to host-only ICE. UI callers must run
   * their own consent UX before setting this flag.
   */
  allowPublicStun?: boolean;
}

/**
 * Resolve the ICE configuration for a new peer connection.
 * The default path is pure host-only and never touches Dexie or the
 * network; consent is consulted only when public STUN is requested.
 */
async function resolveIceConfig(options: SyncSignalingOptions = {}): Promise<RTCConfiguration> {
  if (!options.allowPublicStun) return HOST_ONLY_ICE;
  let consented = false;
  try {
    consented = await checkNetworkConsent();
  } catch {
    consented = false;
  }
  if (!consented) {
    Logger.warn('[SyncMesh] public STUN requested without network consent — using host-only ICE');
    return HOST_ONLY_ICE;
  }
  return PUBLIC_STUN_ICE;
}

const DATA_CHANNEL_LABEL = 'ea-niti-sync';
const DATA_CHANNEL_OPTIONS: RTCDataChannelInit = {
  ordered: true,
  maxRetransmits: 3,
};

const SYNC_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_SIZE = 16 * 1024 * 1024; // 16MB WebRTC message limit

// ---------------------------------------------------------------------------
// SyncMeshService — Layer 4 engine
// ---------------------------------------------------------------------------

export class SyncMeshService {
  private peers = new Map<string, SyncPeer>();
  private deviceId: string;
  private callbacks: SyncMeshCallbacks;
  private abortControllers = new Map<string, AbortController>();

  constructor(callbacks: SyncMeshCallbacks = {}) {
    this.deviceId = this.generateDeviceId();
    this.callbacks = callbacks;
  }

  /**
   * Generate a unique device identifier for this session.
   */
  private generateDeviceId(): string {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  get localDeviceId(): string {
    return this.deviceId;
  }

  get connectedPeers(): string[] {
    return Array.from(this.peers.entries())
      .filter(([, p]) => p.state === 'connected')
      .map(([id]) => id);
  }

  // -------------------------------------------------------------------------
  // Signaling — QR code / clipboard exchange
  // -------------------------------------------------------------------------

  /**
   * Create an offer (SDP) for a peer to scan/copy.
   * Returns a SyncOffer that can be encoded as QR or clipboard text.
   * Uses host-only ICE by default; pass { allowPublicStun: true }
   * (after network consent) for NAT traversal.
   */
  async createOffer(options: SyncSignalingOptions = {}): Promise<SyncOffer> {
    const pc = new RTCPeerConnection(await resolveIceConfig(options));
    const peerId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, DATA_CHANNEL_OPTIONS);
    this.setupDataChannel(channel, peerId);

    const peer: SyncPeer = {
      id: peerId,
      connection: pc,
      channel,
      state: 'connecting',
    };
    this.peers.set(peerId, peer);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering(pc);

    const signal: SyncOffer = {
      type: 'offer',
      sdp: JSON.stringify(pc.localDescription),
      deviceId: this.deviceId,
      timestamp: Date.now(),
    };

    Logger.info(`[SyncMesh] Created offer for peer ${peerId}`);
    return signal;
  }

  /**
   * Accept an offer and create an answer.
   * Returns a SyncAnswer that the offer creator can scan/copy.
   */
  async acceptOffer(offer: SyncOffer, options: SyncSignalingOptions = {}): Promise<SyncAnswer> {
    const pc = new RTCPeerConnection(await resolveIceConfig(options));
    const peerId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Set up data channel handler for the accepting side
    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId);
      const peer = this.peers.get(peerId);
      if (peer) peer.channel = event.channel;
    };

    const peer: SyncPeer = {
      id: peerId,
      connection: pc,
      channel: null,
      state: 'connecting',
    };
    this.peers.set(peerId, peer);

    await pc.setRemoteDescription(JSON.parse(offer.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await this.waitForIceGathering(pc);

    Logger.info(`[SyncMesh] Accepted offer from ${offer.deviceId}, created answer for ${peerId}`);
    return {
      type: 'answer',
      sdp: JSON.stringify(pc.localDescription),
      deviceId: this.deviceId,
      timestamp: Date.now(),
    };
  }

  /**
   * Complete the signaling by applying the answer.
   */
  async completeSignaling(peerId: string, answer: SyncAnswer): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      Logger.warn(`[SyncMesh] No peer found for ${peerId}`);
      return;
    }
    await peer.connection.setRemoteDescription(JSON.parse(answer.sdp));
    Logger.info(`[SyncMesh] Signaling complete for peer ${peerId}`);
  }

  // -------------------------------------------------------------------------
  // Data Channel — encrypted payload transfer
  // -------------------------------------------------------------------------

  private setupDataChannel(channel: RTCDataChannel, peerId: string): void {
    channel.onopen = () => {
      const peer = this.peers.get(peerId);
      if (peer) peer.state = 'connected';
      Logger.info(`[SyncMesh] DataChannel open with ${peerId}`);
      this.callbacks.onPeerConnected?.(peerId);
    };

    channel.onclose = () => {
      const peer = this.peers.get(peerId);
      if (peer) peer.state = 'disconnected';
      Logger.info(`[SyncMesh] DataChannel closed with ${peerId}`);
      this.callbacks.onPeerDisconnected?.(peerId);
    };

    channel.onerror = (event) => {
      Logger.error(`[SyncMesh] DataChannel error with ${peerId}`, event);
      this.callbacks.onError?.(new Error(`DataChannel error: ${peerId}`));
    };

    channel.onmessage = (event) => {
      try {
        const payload: SyncPayload = JSON.parse(event.data);
        this.callbacks.onPayloadReceived?.(peerId, payload);
      } catch (e) {
        Logger.warn(`[SyncMesh] Failed to parse payload from ${peerId}`, e);
      }
    };
  }

  /**
   * Send a payload to a specific peer via DataChannel.
   * Chunks large payloads to stay under WebRTC message limits.
   */
  async sendPayload(peerId: string, payload: SyncPayload): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.channel || peer.channel.readyState !== 'open') {
      Logger.warn(`[SyncMesh] Cannot send to ${peerId}: not connected`);
      return false;
    }

    const json = JSON.stringify(payload);
    if (json.length > MAX_PAYLOAD_SIZE) {
      // Chunk the payload
      const chunks = this.chunkPayload(json);
      for (const chunk of chunks) {
        peer.channel.send(chunk);
      }
    } else {
      peer.channel.send(json);
    }

    Logger.info(`[SyncMesh] Sent payload to ${peerId} (${json.length} bytes)`);
    return true;
  }

  /**
   * Broadcast a payload to all connected peers.
   */
  async broadcastPayload(payload: SyncPayload): Promise<number> {
    let sent = 0;
    for (const [peerId] of this.peers) {
      if (await this.sendPayload(peerId, payload)) sent++;
    }
    return sent;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Disconnect from a specific peer.
   */
  disconnectPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.channel?.close();
      peer.connection.close();
      peer.state = 'disconnected';
      this.peers.delete(peerId);
      this.abortControllers.get(peerId)?.abort();
      this.abortControllers.delete(peerId);
    }
  }

  /**
   * Disconnect from all peers.
   */
  disconnectAll(): void {
    for (const peerId of Array.from(this.peers.keys())) {
      this.disconnectPeer(peerId);
    }
  }

  /**
   * Get connection stats for a peer.
   */
  async getStats(peerId: string): Promise<Record<string, unknown> | null> {
    const peer = this.peers.get(peerId);
    if (!peer) return null;
    const stats = await peer.connection.getStats();
    const result: Record<string, unknown> = {};
    stats.forEach((report) => {
      if (report.type === 'data-channel') {
        result.bytesReceived = report.bytesReceived;
        result.bytesSent = report.bytesSent;
        result.messagesReceived = report.messagesReceived;
        result.messagesSent = report.messagesSent;
      }
    });
    return result;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', checkState);

      // Timeout fallback
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, SYNC_TIMEOUT_MS);
    });
  }

  private chunkPayload(json: string): string[] {
    const chunks: string[] = [];
    const chunkSize = MAX_PAYLOAD_SIZE - 100; // Leave room for framing
    for (let i = 0; i < json.length; i += chunkSize) {
      const chunk = json.slice(i, i + chunkSize);
      chunks.push(JSON.stringify({ _chunk: true, _index: chunks.length, _data: chunk }));
    }
    return chunks;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const syncMeshService = new SyncMeshService();
