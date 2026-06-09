import { beforeEach, describe, expect, it, vi } from 'vitest';

const telemetryRows: any[] = [];

vi.mock('../lib/db', () => ({
  db: {
    local_telemetry_vault: {
      add: vi.fn(async (row) => {
        telemetryRows.push({ ...row, id: telemetryRows.length + 1 });
        return telemetryRows.length;
      }),
      bulkAdd: vi.fn(async (rows) => {
        for (const row of rows) {
          telemetryRows.push({ ...row, id: telemetryRows.length + 1 });
        }
      }),
      clear: vi.fn(async () => {
        telemetryRows.length = 0;
      }),
      toArray: vi.fn(async () => [...telemetryRows]),
      orderBy: vi.fn(() => ({
        toArray: async () => [...telemetryRows].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)),
        last: async () => telemetryRows[telemetryRows.length - 1],
      })),
    },
  },
}));

const { db } = await import('../lib/db');
const { TelemetryClient } = await import('../lib/telemetry');

describe('TelemetryClient', () => {
  beforeEach(async () => {
    await db.local_telemetry_vault.clear();
  });

  it('persists routing, metric, and trace telemetry locally', async () => {
    await TelemetryClient.recordRouting({
      routingScore: 42,
      engineUsed: 'sovereign-wasm',
      executionTimeMs: 123,
      distillationTriggered: false,
    });
    await TelemetryClient.recordMetric({
      metricName: 'tokens_per_second',
      value: 18,
      engineUsed: 'sovereign-wasm',
    });
    await TelemetryClient.recordTrace({
      traceName: 'worker_boot',
      durationMs: 12,
      status: 'ok',
    });

    const rows = await db.local_telemetry_vault.orderBy('timestamp').toArray();

    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.kind)).toEqual(['routing', 'metric', 'trace']);
    expect(rows[0].engineUsed).toBe('sovereign-wasm');
  });

  it('drops prompt, vector, and content fields from telemetry attributes', async () => {
    await TelemetryClient.recordMetric({
      metricName: 'latency_ms',
      value: 25,
      attributes: {
        route: 'local',
        prompt: 'sensitive prompt',
        vector: [1, 2, 3],
        content: 'document body',
        tokenCount: 12,
      },
    });

    const row = await db.local_telemetry_vault.orderBy('timestamp').last();

    expect(row?.attributes).toEqual({
      route: 'local',
      tokenCount: 12,
    });
  });

  it('persists sanitized worker flush batches', async () => {
    const handled = await TelemetryClient.handleWorkerMessage({
      data: {
        type: 'TELEMETRY_FLUSH',
        payload: [
          {
            kind: 'metric',
            metricName: 'worker_queue_depth',
            value: 2,
            attributes: { queue: 'inference', message: 'blocked' },
          },
        ],
      },
    } as MessageEvent);

    const rows = await db.local_telemetry_vault.toArray();

    expect(handled).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].metricName).toBe('worker_queue_depth');
    expect(rows[0].attributes).toEqual({ queue: 'inference' });
  });
});
