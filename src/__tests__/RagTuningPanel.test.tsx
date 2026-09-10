import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationProvider } from '../context/NotificationContext';

vi.mock('../lib/ragSettings', () => ({
  getRagSetting: vi.fn(async (key: string) => (key === 'maxPromptChars' ? 8000 : 1000)),
  setRagSetting: vi.fn(async (_key: string, value: number) => value),
  RAG_SETTING_LIMITS: {
    maxPromptChars: { min: 512, max: 64000, default: 8000 },
    ragContextChars: { min: 128, max: 8000, default: 1000 },
  },
}));

import RagTuningPanel from '../components/admin/RagTuningPanel';
import { setRagSetting } from '../lib/ragSettings';

function renderPanel() {
  return render(
    <NotificationProvider>
      <RagTuningPanel />
    </NotificationProvider>
  );
}

describe('RagTuningPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders both tuning inputs with current values', async () => {
    renderPanel();
    expect(await screen.findByLabelText(/max prompt chars/i)).toBeTruthy();
    expect(screen.getByLabelText(/rag context chars/i)).toBeTruthy();
    expect((screen.getByLabelText(/max prompt chars/i) as HTMLInputElement).value).toBe('8000');
  });

  it('saves edited values through setRagSetting', async () => {
    renderPanel();
    const input = (await screen.findByLabelText(/rag context chars/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: /save tuning/i }));
    await waitFor(() => {
      expect(setRagSetting).toHaveBeenCalledWith('ragContextChars', 2500);
    });
  });

  it('rejects non-numeric input without calling the engine', async () => {
    renderPanel();
    const input = (await screen.findByLabelText(/max prompt chars/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByRole('button', { name: /save tuning/i }));
    await waitFor(() => {
      expect(screen.getByText(/enter a valid number/i)).toBeTruthy();
    });
    expect(setRagSetting).not.toHaveBeenCalled();
  });
});
