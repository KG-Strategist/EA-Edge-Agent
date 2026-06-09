/* tslint:disable */
/* eslint-disable */

export function __wbg_ocrengine_free(handle: number): void;

export function main_js(): void;

export function ocrengine_allocate_image_buffer(handle: number, len: number): number;

export function ocrengine_free_image_buffer(handle: number, ptr: number): void;

export function ocrengine_free_result(handle: number, ptr: number): void;

export function ocrengine_get_memory(_handle: number): number;

export function ocrengine_get_result_length(handle: number): number;

export function ocrengine_get_result_pointer(handle: number): number;

export function ocrengine_is_loaded(handle: number): number;

export function ocrengine_load_model_bundle(handle: number, buffer_ptr: number, buffer_len: number, role_ptr: number, role_len: number): number;

export function ocrengine_new(): number;

export function ocrengine_process_image(handle: number, image_ptr: number, image_len: number, width: number, height: number, channels: number, options_ptr: number, options_len: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_ocrengine_free: (a: number) => void;
    readonly ocrengine_allocate_image_buffer: (a: number, b: number) => number;
    readonly ocrengine_free_image_buffer: (a: number, b: number) => void;
    readonly ocrengine_free_result: (a: number, b: number) => void;
    readonly ocrengine_get_memory: (a: number) => number;
    readonly ocrengine_get_result_length: (a: number) => number;
    readonly ocrengine_get_result_pointer: (a: number) => number;
    readonly ocrengine_is_loaded: (a: number) => number;
    readonly ocrengine_load_model_bundle: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly ocrengine_new: () => number;
    readonly ocrengine_process_image: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly main_js: () => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

/**
 * High-level OcrEngine class — wraps the raw wasm-bindgen exports
 * (ocrengine_new, ocrengine_process_image, etc.) and exposes a
 * single-engine-per-instance interface that the TypeScript pipeline
 * in `src/lib/ocr/wasmRuntime.ts` already understands.
 */
export class OcrEngine {
  free(): void;
  isLoaded(): boolean;
  getMemory(): WebAssembly.Memory;
  allocateImageBuffer(len: number): number;
  freeImageBuffer(ptr: number, len: number): void;
  processImage(
    imagePtr: number,
    imageLen: number,
    width: number,
    height: number,
    channels: number,
    optionsJson: string,
  ): number;
  getResultPointer(): number;
  getResultLength(): number;
  freeResult(ptr: number, len: number): void;
  loadModelBundle(bufferPtr: number, bufferLen: number, role: string): number;
  constructor(init: InitOutput);
}

/**
 * Convenience async loader — calls `__wbg_init` (which fetches
 * the `.wasm` binary) and returns a ready `OcrEngine` instance.
 * Mirrors the legacy `loadOcrEngine()` shape that the TypeScript
 * runtime checks for first.
 */
export function loadOcrEngine(): Promise<OcrEngine>;

/**
 * Schema of the JSON payload the Rust engine returns via
 * `getResultPointer` / `getResultLength`. The TypeScript pipeline
 * parses this and maps it onto the public `OcrResult` shape.
 */
export interface OcrRawResult {
  text: string;
  confidence: number;
  blocks: OcrRawBlock[];
  pageIndex: number;
  orientation: number;
  engineFlags: string[];
}

export interface OcrRawBlock {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  page: number;
  polygon?: Array<{ x: number; y: number }>;
  candidates?: string[];
}
