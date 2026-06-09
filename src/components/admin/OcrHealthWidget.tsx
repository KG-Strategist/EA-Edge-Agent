import React, { useEffect, useState } from 'react';
import { Eye, ShieldCheck, AlertTriangle, Loader2, ScanLine, RefreshCcw } from 'lucide-react';
import { runOcrDetailed } from '../../lib/ocrEngine';
import { getOcrWasmRuntime } from '../../lib/ocr/wasmRuntime';
import { Logger } from '../../lib/logger';
import ocrWasmUrl from '../../lib/wasm/ocr/pkg/ocr_engine_bg.wasm?url';

interface OcrHealthSnapshot {
  engineLoaded: boolean;
  pkgPresent: boolean;
  bytesLoaded: number;
  memoryPages: number | null;
  modelVersion: string | null;
  lockfileVersion: string | null;
  hydratedAssetCount: number;
  requiredAssetCount: number;
  lastSample: {
    textLength: number;
    mode: string;
    confidence: number;
    durationMs: number;
    flags: string[];
    errorReason?: string;
  } | null;
}

async function gatherSnapshot(): Promise<OcrHealthSnapshot> {
  const runtime = getOcrWasmRuntime();
  const isLoaded = runtime.isLoaded();
  const description = runtime.describe();
  let pkgPresent = false;
  let bytesLoaded = 0;
  let memoryPages: number | null = null;
  try {
    if (isLoaded) {
      const engine = (runtime as any).engine;
      pkgPresent = Boolean(engine);
      const memory = engine?.getMemory?.();
      if (memory) {
        bytesLoaded = memory.buffer.byteLength;
        memoryPages = bytesLoaded / (64 * 1024);
      }
    } else {
      const response = await fetch(ocrWasmUrl, { method: 'HEAD' });
      pkgPresent = response.ok;
    }
  } catch (err) {
    Logger.warn('[OcrHealth] probe failed:', err);
  }
  // Read the OCR lockfile for its declared `ocrVersion`. This is a
  // best-effort fetch — it never throws to the caller.
  let lockfileVersion: string | null = null;
  try {
    const lockResponse = await fetch(new URL('../../../ocr/ocr.lock.json', import.meta.url).toString());
    if (lockResponse.ok) {
      const lock = await lockResponse.json();
      if (lock && typeof lock.ocrVersion === 'string') {
        lockfileVersion = lock.ocrVersion;
      }
    }
  } catch {
    lockfileVersion = null;
  }
  return {
    engineLoaded: isLoaded,
    pkgPresent,
    bytesLoaded,
    memoryPages,
    modelVersion: lockfileVersion,
    lockfileVersion,
    hydratedAssetCount: description.hydratedAssetCount,
    requiredAssetCount: description.requiredAssetCount,
    lastSample: null,
  };
}

function makeSampleImage(): Promise<Blob> {
  return new Promise<Blob>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])], { type: 'image/jpeg' }));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])], { type: 'image/jpeg' }));
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '20px monospace';
    ctx.fillText('EA-NITI OCR probe 1234', 6, 36);
    canvas.toBlob((blob) => resolve(blob ?? new Blob()), 'image/png');
  });
}

const OcrHealthWidget: React.FC = () => {
  const [snapshot, setSnapshot] = useState<OcrHealthSnapshot | null>(null);
  const [isSampling, setIsSampling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    gatherSnapshot().then((snap) => {
      if (!cancelled) setSnapshot(snap);
    }).catch((err) => Logger.warn('[OcrHealth] initial snapshot failed:', err));
    return () => { cancelled = true; };
  }, []);

  const handleSample = async () => {
    setIsSampling(true);
    try {
      const blob = await makeSampleImage();
      const started = performance.now();
      const result = await runOcrDetailed(blob, { enableReranker: false });
      const durationMs = performance.now() - started;
      setSnapshot((prev) => ({
        engineLoaded: prev?.engineLoaded ?? false,
        pkgPresent: prev?.pkgPresent ?? false,
        bytesLoaded: prev?.bytesLoaded ?? 0,
        memoryPages: prev?.memoryPages ?? null,
        modelVersion: prev?.modelVersion ?? null,
        lockfileVersion: prev?.lockfileVersion ?? null,
        hydratedAssetCount: prev?.hydratedAssetCount ?? 0,
        requiredAssetCount: prev?.requiredAssetCount ?? 0,
        lastSample: {
          textLength: result.text.length,
          mode: result.mode,
          confidence: result.confidence,
          durationMs,
          flags: result.internalFlags,
        },
      }));
    } catch (err) {
      Logger.warn('[OcrHealth] sample failed:', err);
    } finally {
      setIsSampling(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <ScanLine size={18} className="text-indigo-500" />
          Bespoke OCR Health
        </h3>
        <button
          onClick={handleSample}
          disabled={isSampling}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50"
        >
          {isSampling ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          Run probe
        </button>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
        WASM package status, model version, and last sampled OCR mode. Confidence and mode are admin-telemetry only.
      </p>
      {snapshot === null ? (
        <p className="text-xs text-gray-500 dark:text-gray-500">Probing OCR runtime…</p>
      ) : (
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2">
            {snapshot.engineLoaded ? (
              <ShieldCheck size={14} className="text-green-500" />
            ) : (
              <AlertTriangle size={14} className="text-amber-500" />
            )}
            <dt className="font-semibold">WASM engine:</dt>
            <dd>{snapshot.engineLoaded ? 'loaded' : 'not loaded'}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-gray-500" />
            <dt className="font-semibold">Package present:</dt>
            <dd>{snapshot.pkgPresent ? 'yes' : 'no (fallback only)'}</dd>
          </div>
          {snapshot.memoryPages !== null && (
            <div className="flex items-center gap-2">
              <dt className="font-semibold">Memory pages:</dt>
              <dd>{snapshot.memoryPages.toFixed(1)} ({snapshot.bytesLoaded.toLocaleString()} bytes)</dd>
            </div>
          )}
          {snapshot.lockfileVersion && (
            <div className="flex items-center gap-2">
              <dt className="font-semibold">Lockfile:</dt>
              <dd className="font-mono">{snapshot.lockfileVersion}</dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <dt className="font-semibold">Hydrated assets:</dt>
            <dd className={snapshot.hydratedAssetCount >= snapshot.requiredAssetCount ? 'text-green-500' : 'text-amber-500'}>
              {snapshot.hydratedAssetCount} / {snapshot.requiredAssetCount} required
            </dd>
          </div>
          {snapshot.lastSample && (
            <div className="md:col-span-2 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-md p-2">
              <p className="font-mono">
                last sample: mode=<span className="text-indigo-500">{snapshot.lastSample.mode}</span>,
                conf=<span className="text-indigo-500">{snapshot.lastSample.confidence.toFixed(2)}</span>,
                chars=<span className="text-indigo-500">{snapshot.lastSample.textLength}</span>,
                dur=<span className="text-indigo-500">{snapshot.lastSample.durationMs.toFixed(0)}ms</span>
              </p>
              {snapshot.lastSample.flags.length > 0 && (
                <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                  flags: {snapshot.lastSample.flags.join(', ')}
                </p>
              )}
            </div>
          )}
        </dl>
      )}
    </div>
  );
};

export default OcrHealthWidget;
