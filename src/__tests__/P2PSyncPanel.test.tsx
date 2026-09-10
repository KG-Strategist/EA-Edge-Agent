import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationProvider } from '../context/NotificationContext';

vi.mock('../lib/syncMeshService', () => {
  class FakeSyncMeshService {
    callbacks: Record<string, unknown>;
    constructor(callbacks: Record<string, unknown> = {}) {
      this.callbacks = callbacks;
    }
    get localDeviceId() {
      return 'dev-test-01';
    }
    get connectedPeers(): string[] {
      return [];
    }
    async createOffer() {
      return { type: 'offer', sdp: '{"mock":"offer"}', deviceId: 'dev-test-01', timestamp: 1 };
    }
    async acceptOffer() {
      return { type: 'answer', sdp: '{"mock":"answer"}', deviceId: 'dev-test-01', timestamp: 2 };
    }
    async completeSignaling() {
      return undefined;
    }
    async sendPayload() {
      return true;
    }
    async broadcastPayload() {
      return 1;
    }
    disconnectAll() {
      return undefined;
    }
  }
  return { SyncMeshService: FakeSyncMeshService, syncMeshService: new FakeSyncMeshService() };
});

import P2PSyncPanel from '../components/admin/P2PSyncPanel';

function renderPanel() {
  return render(
    <NotificationProvider>
      <P2PSyncPanel />
    </NotificationProvider>
  );
}

describe('P2PSyncPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the peer-sync section with offer actions', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: /peer-to-peer sync/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /create offer/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /create answer/i })).toBeTruthy();
  });

  it('creates an offer and shows shareable text', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /create offer/i }));
    const offerBox = await screen.findByLabelText(/p2p offer/i);
    expect((offerBox as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /copy offer/i })).toBeTruthy();
  });

  it('creates an answer from a pasted offer', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const acceptSpy = vi.spyOn(SyncMeshService.prototype, 'acceptOffer');
    renderPanel();

    const pasteBox = screen.getByLabelText(/paste remote offer/i);
    fireEvent.change(pasteBox, { target: { value: btoa(JSON.stringify({ type: 'offer', sdp: '{}', deviceId: 'x', timestamp: 1 })) } });
    fireEvent.click(screen.getByRole('button', { name: /create answer/i }));

    await screen.findByLabelText(/p2p answer/i);
    expect(acceptSpy).toHaveBeenCalled();
  });

  it('rejects malformed pasted offers without calling the engine', async () => {
    const { SyncMeshService } = await import('../lib/syncMeshService');
    const acceptSpy = vi.spyOn(SyncMeshService.prototype, 'acceptOffer');
    renderPanel();

    fireEvent.change(screen.getByLabelText(/paste remote offer/i), { target: { value: 'not-base64!!!' } });
    fireEvent.click(screen.getByRole('button', { name: /create answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid offer/i)).toBeTruthy();
    });
    expect(acceptSpy).not.toHaveBeenCalled();
  });

  it('shows connected-peer state', () => {
    renderPanel();
    expect(screen.getByText(/no peers connected/i)).toBeTruthy();
  });
});
