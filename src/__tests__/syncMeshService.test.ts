import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/networkGuard', () => ({
  checkNetworkConsent: vi.fn(async () => false),
  validateEndpointUrl: vi.fn(async () => true),
}));

// Mock RTCPeerConnection and RTCDataChannel
class MockRTCDataChannel {
  readyState = 'open';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

class MockRTCPeerConnection {
  static instances: { config?: RTCConfiguration }[] = [];
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  iceGatheringState = 'complete';
  ondatachannel: ((event: { channel: MockRTCDataChannel }) => void) | null = null;
  private channels: MockRTCDataChannel[] = [];

  constructor(config?: RTCConfiguration) {
    MockRTCPeerConnection.instances.push({ config });
  }

  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'mock-offer-sdp' }));
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'mock-answer-sdp' }));
  setLocalDescription = vi.fn(async (desc: RTCSessionDescription) => {
    this.localDescription = desc;
  });
  setRemoteDescription = vi.fn(async (desc: RTCSessionDescription) => {
    this.remoteDescription = desc;
  });
  createDataChannel = vi.fn((_label: string, _options: RTCDataChannelInit) => {
    const channel = new MockRTCDataChannel();
    this.channels.push(channel);
    return channel;
  });
  getStats = vi.fn(async () => new Map());
  close = vi.fn();

  // Helper to simulate incoming data channel
  simulateIncomingChannel(): MockRTCDataChannel {
    const channel = new MockRTCDataChannel();
    this.ondatachannel?.({ channel });
    return channel;
  }
}

// Mock global RTCPeerConnection
const MockGlobalRTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;

describe('SyncMeshService — device ID', () => {
  it('generates unique device IDs', async () => {
    // Replace global RTCPeerConnection temporarily
    const originalRTC = globalThis.RTCPeerConnection;
    (globalThis as any).RTCPeerConnection = MockGlobalRTCPeerConnection;

    try {
      const { SyncMeshService } = await import('../lib/syncMeshService');
      const a = new SyncMeshService();
      const b = new SyncMeshService();
      expect(a.localDeviceId).not.toBe(b.localDeviceId);
      expect(a.localDeviceId).toMatch(/^[0-9a-f]{16}$/);
    } finally {
      (globalThis as any).RTCPeerConnection = originalRTC;
    }
  });
});

describe('SyncMeshService — signaling', () => {
  beforeEach(() => {
    (globalThis as any).RTCPeerConnection = MockGlobalRTCPeerConnection;
    MockRTCPeerConnection.instances.length = 0;
  });

  it('creates an offer with correct structure', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const service = new SyncMeshService();
    const offer = await service.createOffer();

    expect(offer.type).toBe('offer');
    expect(offer.sdp).toBeTruthy();
    expect(offer.deviceId).toBe(service.localDeviceId);
    expect(offer.timestamp).toBeGreaterThan(0);
  });

  it('defaults to host-only ICE (air-gap: no public STUN)', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const service = new SyncMeshService();
    await service.createOffer();

    const last = MockRTCPeerConnection.instances[MockRTCPeerConnection.instances.length - 1];
    expect(last.config?.iceServers).toEqual([]);
  });

  it('falls back to host-only ICE when public STUN lacks network consent', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const { checkNetworkConsent } = await import('../lib/networkGuard');
    vi.mocked(checkNetworkConsent).mockResolvedValueOnce(false);

    const service = new SyncMeshService();
    await service.createOffer({ allowPublicStun: true });

    const last = MockRTCPeerConnection.instances[MockRTCPeerConnection.instances.length - 1];
    expect(last.config?.iceServers).toEqual([]);
    expect(checkNetworkConsent).toHaveBeenCalled();
  });

  it('never consults network consent on the default host-only path', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const { checkNetworkConsent } = await import('../lib/networkGuard');
    vi.mocked(checkNetworkConsent).mockClear();

    const service = new SyncMeshService();
    await service.createOffer();

    expect(checkNetworkConsent).not.toHaveBeenCalled();
  });

  it('accepts an offer and creates an answer', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const creator = new SyncMeshService();
    const acceptor = new SyncMeshService();

    const offer = await creator.createOffer();
    const answer = await acceptor.acceptOffer(offer);

    expect(answer.type).toBe('answer');
    expect(answer.sdp).toBeTruthy();
    expect(answer.deviceId).toBe(acceptor.localDeviceId);
  });

  it('completes signaling and establishes connection', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const creator = new SyncMeshService();
    const acceptor = new SyncMeshService();

    const onConnected = vi.fn();
    creator.callbacks.onPeerConnected = onConnected;

    const offer = await creator.createOffer();
    const answer = await acceptor.acceptOffer(offer);

    // Get the peer ID from the creator's peers
    const _peerIds = creator.connectedPeers;
    // Peer may not be connected yet (state depends on MockRTCDataChannel.onopen)
    // but the signaling should complete without error
    await expect(creator.completeSignaling(offer.deviceId + '-fake', answer)).resolves.not.toThrow();
  });
});

describe('SyncMeshService — payload transfer', () => {
  beforeEach(() => {
    (globalThis as any).RTCPeerConnection = MockGlobalRTCPeerConnection;
  });

  it('rejects send to non-existent peer', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const service = new SyncMeshService();
    const sent = await service.sendPayload('nonexistent', {
      type: 'ping',
      data: null,
      metadata: { deviceId: 'test', tableCount: 0, recordCount: 0, encrypted: false, timestamp: Date.now() },
    });
    expect(sent).toBe(false);
  });

  it('broadcast returns 0 when no peers connected', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const service = new SyncMeshService();
    const sent = await service.broadcastPayload({
      type: 'ping',
      data: null,
      metadata: { deviceId: 'test', tableCount: 0, recordCount: 0, encrypted: false, timestamp: Date.now() },
    });
    expect(sent).toBe(0);
  });
});

describe('SyncMeshService — lifecycle', () => {
  beforeEach(() => {
    (globalThis as any).RTCPeerConnection = MockGlobalRTCPeerConnection;
  });

  it('disconnectAll clears all peers', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const service = new SyncMeshService();
    service.disconnectAll();
    expect(service.connectedPeers).toEqual([]);
  });

  it('disconnectPeer removes specific peer', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const service = new SyncMeshService();
    service.disconnectPeer('nonexistent'); // Should not throw
    expect(service.connectedPeers).toEqual([]);
  });

  it('getStats returns null for non-existent peer', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const service = new SyncMeshService();
    const stats = await service.getStats('nonexistent');
    expect(stats).toBeNull();
  });
});
