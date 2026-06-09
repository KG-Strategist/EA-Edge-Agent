/* @ts-self-types="./ea_niti_ocr_engine.d.ts" */

/**
 * @param {number} handle
 */
export function __wbg_ocrengine_free(handle) {
    wasm.__wbg_ocrengine_free(handle);
}

export function main_js() {
    wasm.main_js();
}

/**
 * @param {number} handle
 * @param {number} len
 * @returns {number}
 */
export function ocrengine_allocate_image_buffer(handle, len) {
    const ret = wasm.ocrengine_allocate_image_buffer(handle, len);
    return ret >>> 0;
}

/**
 * @param {number} handle
 * @param {number} ptr
 */
export function ocrengine_free_image_buffer(handle, ptr) {
    wasm.ocrengine_free_image_buffer(handle, ptr);
}

/**
 * @param {number} handle
 * @param {number} ptr
 */
export function ocrengine_free_result(handle, ptr) {
    wasm.ocrengine_free_result(handle, ptr);
}

/**
 * @param {number} _handle
 * @returns {number}
 */
export function ocrengine_get_memory(_handle) {
    const ret = wasm.ocrengine_get_memory(_handle);
    return ret >>> 0;
}

/**
 * @param {number} handle
 * @returns {number}
 */
export function ocrengine_get_result_length(handle) {
    const ret = wasm.ocrengine_get_result_length(handle);
    return ret >>> 0;
}

/**
 * @param {number} handle
 * @returns {number}
 */
export function ocrengine_get_result_pointer(handle) {
    const ret = wasm.ocrengine_get_result_pointer(handle);
    return ret >>> 0;
}

/**
 * @param {number} handle
 * @returns {number}
 */
export function ocrengine_is_loaded(handle) {
    const ret = wasm.ocrengine_is_loaded(handle);
    return ret >>> 0;
}

/**
 * @param {number} handle
 * @param {number} buffer_ptr
 * @param {number} buffer_len
 * @param {number} role_ptr
 * @param {number} role_len
 * @returns {number}
 */
export function ocrengine_load_model_bundle(handle, buffer_ptr, buffer_len, role_ptr, role_len) {
    const ret = wasm.ocrengine_load_model_bundle(handle, buffer_ptr, buffer_len, role_ptr, role_len);
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function ocrengine_new() {
    const ret = wasm.ocrengine_new();
    return ret >>> 0;
}

/**
 * @param {number} handle
 * @param {number} image_ptr
 * @param {number} image_len
 * @param {number} width
 * @param {number} height
 * @param {number} channels
 * @param {number} options_ptr
 * @param {number} options_len
 * @returns {number}
 */
export function ocrengine_process_image(handle, image_ptr, image_len, width, height, channels, options_ptr, options_len) {
    const ret = wasm.ocrengine_process_image(handle, image_ptr, image_len, width, height, channels, options_ptr, options_len);
    return ret >>> 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./ea_niti_ocr_engine_bg.js": import0,
    };
}

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ocr_engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

/**
 * High-level OcrEngine class — wraps the raw wasm-bindgen exports
 * (ocrengine_new, ocrengine_process_image, etc.) and exposes a
 * single-engine-per-instance interface that the TypeScript pipeline
 * in `src/lib/ocr/wasmRuntime.ts` already understands.
 *
 * Memory contract (matches `ocr_engine.d.ts`):
 *   1. JS calls `allocateImageBuffer(len)` → u32 handle.
 *   2. JS blits pixel bytes into the engine memory using
 *      `new Uint8Array(getMemory().buffer, handle, len)`.
 *   3. JS calls `processImage(handle, len, w, h, c, optionsJson)`.
 *   4. JS reads the result JSON via
 *      `new TextDecoder().decode(new Uint8Array(getMemory().buffer, ptr, len))`
 *      using `getResultPointer()` / `getResultLength()`.
 *   5. JS calls `freeResult(ptr, len)` and `freeImageBuffer(handle, len)`.
 *   6. JS calls `free()` when done.
 */
export class OcrEngine {
  constructor(init) {
    this.init = init;
    this.handle = init.ocrengine_new();
    this.disposed = false;
  }

  isLoaded() {
    if (this.disposed) return false;
    return this.init.ocrengine_is_loaded(this.handle) === 1;
  }

  getMemory() {
    return this.init.memory;
  }

  allocateImageBuffer(len) {
    if (this.disposed) return 0;
    return this.init.ocrengine_allocate_image_buffer(this.handle, len);
  }

  freeImageBuffer(ptr, _len) {
    if (this.disposed) return;
    this.init.ocrengine_free_image_buffer(this.handle, ptr);
  }

  processImage(imagePtr, imageLen, width, height, channels, optionsJson) {
    if (this.disposed) return 1;
    // We need to write the options JSON into WASM memory so the
    // Rust side can read it. Re-use allocate_image_buffer for
    // a transient buffer.
    const optionsBytes = new TextEncoder().encode(optionsJson || '{}');
    let optionsPtr = 0;
    try {
      optionsPtr = this.init.ocrengine_allocate_image_buffer(this.handle, optionsBytes.length);
      const mem = this.init.memory;
      const view = new Uint8Array(mem.buffer, optionsPtr, optionsBytes.length);
      view.set(optionsBytes);
      return this.init.ocrengine_process_image(
        this.handle, imagePtr, imageLen, width, height, channels,
        optionsPtr, optionsBytes.length,
      );
    } finally {
      if (optionsPtr) this.init.ocrengine_free_image_buffer(this.handle, optionsPtr);
    }
  }

  getResultPointer() {
    if (this.disposed) return 0;
    return this.init.ocrengine_get_result_pointer(this.handle);
  }

  getResultLength() {
    if (this.disposed) return 0;
    return this.init.ocrengine_get_result_length(this.handle);
  }

  freeResult(ptr, _len) {
    if (this.disposed) return;
    this.init.ocrengine_free_result(this.handle, ptr);
  }

  /**
   * `loadModelBundle` was originally documented to take
   * (bufferPtr, bufferLen, roleString). To preserve the
   * older API used by `wasmRuntime.ts`, we accept a JS string
   * and convert it to a UTF-8 buffer in WASM memory.
   */
  loadModelBundle(bufferPtr, bufferLen, role) {
    if (this.disposed) return 1;
    const roleBytes = new TextEncoder().encode(String(role || ''));
    let rolePtr = 0;
    try {
      rolePtr = this.init.ocrengine_allocate_image_buffer(this.handle, roleBytes.length);
      const mem = this.init.memory;
      new Uint8Array(mem.buffer, rolePtr, roleBytes.length).set(roleBytes);
      return this.init.ocrengine_load_model_bundle(
        this.handle, bufferPtr, bufferLen, rolePtr, roleBytes.length,
      );
    } finally {
      if (rolePtr) this.init.ocrengine_free_image_buffer(this.handle, rolePtr);
    }
  }

  free() {
    if (this.disposed) return;
    this.disposed = true;
    this.init.__wbg_ocrengine_free(this.handle);
  }
}

/**
 * Convenience async loader — calls `__wbg_init` (which fetches
 * the `.wasm` binary) and returns a ready `OcrEngine` instance.
 * Mirrors the legacy `loadOcrEngine()` shape that the TypeScript
 * runtime checks for first.
 */
export async function loadOcrEngine() {
  const init = await __wbg_init();
  return new OcrEngine(init);
}

export { initSync, __wbg_init as default };
