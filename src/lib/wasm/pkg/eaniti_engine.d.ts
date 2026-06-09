/* tslint:disable */
/* eslint-disable */
export function main_js(): void;
export class SovereignTensorCore {
  free(): void;
  init_webgpu(): Promise<boolean>;
  upload_to_vram(): Promise<void>;
  begin_prefill_async(prompt: string): Promise<number>;
  prefill_prompt_async(prompt: string, _random_seed: number): Promise<number>;
  decode_next_token_async(_token: number, _pos: number, _random_seed: number): Promise<number>;
  prefill_next_chunk_async(max_steps: number): Promise<number>;
  generate_next_token_async(): Promise<number>;
  /**
   * Returns the model's EOS token ID for model-agnostic halting.
   */
  get_eos_id(): number;
  begin_prefill(prompt: string): number;
  clear_kv_cache(): void;
  get_vocab_size(): number;
  prefill_prompt(prompt: string): void;
  get_architecture(): string;
  is_hybrid_active(): boolean;
  is_vram_uploaded(): boolean;
  get_chat_template(): string;
  prefill_next_chunk(max_steps: number): number;
  decode_single_token(token_id: number): string;
  free_weights_buffer(): void;
  generate_next_token(): number;
  get_tokenizer_model(): string;
  is_prefill_complete(): boolean;
  get_vram_shard_count(): number;
  get_vram_upload_status(): string;
  reset_generation_state(): void;
  allocate_weights_buffer(size: number): number;
  /**
   * Returns [Current Entropy, Entropy Velocity, Adaptive Temperature]
   * Reads logits directly from internal RunState — ZERO cross-boundary allocation.
   */
  compute_epistemic_state(base_t: number, lambda: number): Float32Array;
  get_vram_uploaded_bytes(): number;
  initialize_tensor_graph(): boolean;
  get_vram_max_shard_bytes(): number;
  get_hardware_block_reason(): string;
  constructor();
  is_loaded(): boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_sovereigntensorcore_free: (a: number, b: number) => void;
  readonly main_js: () => void;
  readonly sovereigntensorcore_allocate_weights_buffer: (a: number, b: number) => [number, number, number];
  readonly sovereigntensorcore_begin_prefill: (a: number, b: number, c: number) => [number, number, number];
  readonly sovereigntensorcore_begin_prefill_async: (a: number, b: number, c: number) => any;
  readonly sovereigntensorcore_clear_kv_cache: (a: number) => void;
  readonly sovereigntensorcore_compute_epistemic_state: (a: number, b: number, c: number) => [number, number, number, number];
  readonly sovereigntensorcore_decode_next_token_async: (a: number, b: number, c: number, d: number) => any;
  readonly sovereigntensorcore_decode_single_token: (a: number, b: number) => [number, number];
  readonly sovereigntensorcore_free_weights_buffer: (a: number) => void;
  readonly sovereigntensorcore_generate_next_token: (a: number) => [number, number, number];
  readonly sovereigntensorcore_generate_next_token_async: (a: number) => any;
  readonly sovereigntensorcore_get_architecture: (a: number) => [number, number];
  readonly sovereigntensorcore_get_chat_template: (a: number) => [number, number];
  readonly sovereigntensorcore_get_eos_id: (a: number) => number;
  readonly sovereigntensorcore_get_hardware_block_reason: (a: number) => [number, number];
  readonly sovereigntensorcore_get_tokenizer_model: (a: number) => [number, number];
  readonly sovereigntensorcore_get_vocab_size: (a: number) => number;
  readonly sovereigntensorcore_get_vram_max_shard_bytes: (a: number) => number;
  readonly sovereigntensorcore_get_vram_shard_count: (a: number) => number;
  readonly sovereigntensorcore_get_vram_upload_status: (a: number) => [number, number];
  readonly sovereigntensorcore_get_vram_uploaded_bytes: (a: number) => number;
  readonly sovereigntensorcore_init_webgpu: (a: number) => any;
  readonly sovereigntensorcore_initialize_tensor_graph: (a: number) => [number, number, number];
  readonly sovereigntensorcore_is_hybrid_active: (a: number) => number;
  readonly sovereigntensorcore_is_loaded: (a: number) => number;
  readonly sovereigntensorcore_is_prefill_complete: (a: number) => number;
  readonly sovereigntensorcore_is_vram_uploaded: (a: number) => number;
  readonly sovereigntensorcore_new: () => number;
  readonly sovereigntensorcore_prefill_next_chunk: (a: number, b: number) => [number, number, number];
  readonly sovereigntensorcore_prefill_next_chunk_async: (a: number, b: number) => any;
  readonly sovereigntensorcore_prefill_prompt: (a: number, b: number, c: number) => [number, number];
  readonly sovereigntensorcore_prefill_prompt_async: (a: number, b: number, c: number, d: number) => any;
  readonly sovereigntensorcore_reset_generation_state: (a: number) => void;
  readonly sovereigntensorcore_upload_to_vram: (a: number) => any;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_5: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly closure32_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure27_externref_shim: (a: number, b: number, c: any, d: any) => void;
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
