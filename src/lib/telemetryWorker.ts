// Custom OTEL collector simulation. Tracks local telemetry with 0 egress.

let telemetryBuffer: any[] = [];
const FLUSH_INTERVAL = 5000;

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'LOG_METRIC') {
      telemetryBuffer.push({
        type: 'metric',
        timestamp: Date.now(),
        ...payload
      });
      self.postMessage({ id, status: 'success' });
    } 
    else if (type === 'LOG_TRACE') {
      telemetryBuffer.push({
        type: 'trace',
        timestamp: Date.now(),
        ...payload
      });
      self.postMessage({ id, status: 'success' });
    }
  } catch (error: any) {
    self.postMessage({ id, status: 'error', error: error.message });
  }
};

// Periodic flush to the main thread for IndexedDB persistence (0 egress).
setInterval(() => {
  if (telemetryBuffer.length > 0) {
    const batch = telemetryBuffer.map((event) => ({
      kind: event.type,
      metricName: event.type === 'metric' ? event.name || 'worker.metric' : undefined,
      traceName: event.type === 'trace' ? event.name || 'worker.trace' : undefined,
      value: event.type === 'metric' ? Number(event.value ?? 0) : undefined,
      durationMs: event.type === 'trace' ? Number(event.durationMs ?? event.duration ?? 0) : undefined,
      status: event.status || 'ok',
      engineUsed: event.engineUsed,
      attributes: event.attributes,
    }));
    self.postMessage({ type: 'TELEMETRY_FLUSH', status: 'success', payload: batch });
    telemetryBuffer = [];
  }
}, FLUSH_INTERVAL);
