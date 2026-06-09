import { db, LocalTelemetry } from './db';

type TelemetryAttribute = string | number | boolean | null;

const BLOCKED_ATTRIBUTE_KEY = /(prompt|message|content|text|vector|embedding|email|document|payload|pii|secret|api[_-]?key|auth[_-]?token|bearer)/i;

interface RoutingTelemetryInput {
  routingScore: number;
  engineUsed: string;
  executionTimeMs: number;
  distillationTriggered: boolean;
}

interface MetricTelemetryInput {
  metricName: string;
  value: number;
  engineUsed?: string;
  attributes?: Record<string, unknown>;
}

interface TraceTelemetryInput {
  traceName: string;
  durationMs: number;
  status?: 'ok' | 'error' | 'warn';
  engineUsed?: string;
  attributes?: Record<string, unknown>;
}

export type TelemetryBatchInput =
  | ({ kind: 'routing' } & RoutingTelemetryInput)
  | ({ kind: 'metric' } & MetricTelemetryInput)
  | ({ kind: 'trace' } & TraceTelemetryInput);

function sanitizeAttributes(attributes?: Record<string, unknown>): Record<string, TelemetryAttribute> | undefined {
  if (!attributes) return undefined;

  const sanitized: Record<string, TelemetryAttribute> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (BLOCKED_ATTRIBUTE_KEY.test(key)) continue;
    if (
      typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || value === null
    ) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export class TelemetryClient {
  static async recordRouting(data: RoutingTelemetryInput): Promise<number> {
    return (await db.local_telemetry_vault.add({
      kind: 'routing',
      timestamp: new Date(),
      routingScore: data.routingScore,
      engineUsed: data.engineUsed,
      executionTimeMs: data.executionTimeMs,
      distillationTriggered: data.distillationTriggered,
    })) as number;
  }

  static async recordMetric(data: MetricTelemetryInput): Promise<number> {
    return (await db.local_telemetry_vault.add({
      kind: 'metric',
      timestamp: new Date(),
      metricName: data.metricName,
      value: data.value,
      engineUsed: data.engineUsed,
      attributes: sanitizeAttributes(data.attributes),
    })) as number;
  }

  static async recordTrace(data: TraceTelemetryInput): Promise<number> {
    return (await db.local_telemetry_vault.add({
      kind: 'trace',
      timestamp: new Date(),
      traceName: data.traceName,
      durationMs: data.durationMs,
      status: data.status || 'ok',
      engineUsed: data.engineUsed,
      attributes: sanitizeAttributes(data.attributes),
    })) as number;
  }

  static async recordBatch(batch: TelemetryBatchInput[]): Promise<void> {
    const rows: LocalTelemetry[] = batch.map((item) => {
      if (item.kind === 'routing') {
        return {
          kind: 'routing',
          timestamp: new Date(),
          routingScore: item.routingScore,
          engineUsed: item.engineUsed,
          executionTimeMs: item.executionTimeMs,
          distillationTriggered: item.distillationTriggered,
        };
      }

      if (item.kind === 'metric') {
        return {
          kind: 'metric',
          timestamp: new Date(),
          metricName: item.metricName,
          value: item.value,
          engineUsed: item.engineUsed,
          attributes: sanitizeAttributes(item.attributes),
        };
      }

      return {
        kind: 'trace',
        timestamp: new Date(),
        traceName: item.traceName,
        durationMs: item.durationMs,
        status: item.status || 'ok',
        engineUsed: item.engineUsed,
        attributes: sanitizeAttributes(item.attributes),
      };
    });

    if (rows.length > 0) {
      await db.local_telemetry_vault.bulkAdd(rows);
    }
  }

  static async handleWorkerMessage(event: MessageEvent): Promise<boolean> {
    const data = event.data;
    if (data?.type !== 'TELEMETRY_FLUSH' || !Array.isArray(data.payload)) {
      return false;
    }
    await TelemetryClient.recordBatch(data.payload);
    return true;
  }
}
