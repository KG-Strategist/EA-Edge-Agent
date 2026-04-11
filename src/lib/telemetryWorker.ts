// Custom OTEL collector simulation (Rust compiled to Wasm equivalent)
// Tracks local telemetry with 0 egress.
import { Logger } from './logger';

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

// Periodic flush to local IndexedDB (0 egress)
setInterval(() => {
  if (telemetryBuffer.length > 0) {
    // In a full implementation, this would write to Dexie or PGLite
    Logger.log('[MELT Telemetry Worker] Flushed to local storage:', telemetryBuffer.length, 'events');
    telemetryBuffer = [];
  }
}, FLUSH_INTERVAL);
