/**
 * Generates valid multi-architecture GGUF v3 mock files for testing.
 * Produces complete mocks with all tensors required for initialize_tensor_graph()
 * to pass (12 tensors: 3 global + 9 layer tensors for n_layer=1).
 *
 * Usage:
 *   node generate_mock_gguf.cjs                          # default llama
 *   node generate_mock_gguf.cjs --arch qwen2             # qwen2 naming
 *   node generate_mock_gguf.cjs --arch gemma2           # gemma2 naming
 *
 * Output files: mock_{arch}.gguf in the fixtures directory.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let arch = 'llama';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--arch' && i + 1 < args.length) {
    arch = args[i + 1];
  }
}

const N_EMBD = 32;
const N_FF = 64;
const N_HEAD = 4;
const N_HEAD_KV = 4;
const N_LAYER = 1;
const N_VOCAB = 32;

const outPath = path.join(__dirname, `mock_${arch}.gguf`);
const buf = [];

function writeU32(v) {
  buf.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF);
}

function writeU64(v) {
  writeU32(v & 0xFFFFFFFF);
  writeU32(Math.floor(v / 0x100000000));
}

function writeF32(v) {
  const ab = new ArrayBuffer(4);
  new DataView(ab).setFloat32(0, v, true);
  for (let i = 0; i < 4; i++) buf.push(ab[i]);
}

function writeString(s) {
  const bytes = Buffer.from(s, 'utf8');
  writeU64(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf.push(bytes[i]);
}

function writeStringArray(arr) {
  writeU64(arr.length);
  for (const s of arr) writeString(s);
}

function q4BlockCount(nElements) {
  return Math.ceil(nElements / 32);
}

function writeQ4_0Block() {
  buf.push(0x00, 0x3C);
  for (let j = 0; j < 16; j++) buf.push(0x00);
}

function writeTensorData(shape) {
  const nElements = shape.reduce((a, b) => a * b, 1);
  const nBlocks = q4BlockCount(nElements);
  for (let b = 0; b < nBlocks; b++) {
    writeQ4_0Block();
  }
}

const archKvpairs = [
  ['embedding_length', N_EMBD],
  ['block_count', N_LAYER],
  ['attention.head_count', N_HEAD],
  ['attention.head_count_kv', N_HEAD_KV],
  ['feed_forward_length', N_FF],
  ['context_length', 128],
  ['vocab_size', N_VOCAB],
  ['attention.layer_norm_rms_epsilon', 1e-5],
];

let tensorNames;
if (arch === 'qwen2') {
  tensorNames = {
    token_embd: 'token_embd.weight',
    output_norm: 'output_norm.weight',
    output: 'output.weight',
    attn_norm: 'blk.0.input_layernorm.weight',
    wq: 'blk.0.q_proj.weight',
    wk: 'blk.0.k_proj.weight',
    wv: 'blk.0.v_proj.weight',
    wo: 'blk.0.o_proj.weight',
    ffn_norm: 'blk.0.post_attention_layernorm.weight',
    ffn_gate: 'blk.0.gate_proj.weight',
    ffn_down: 'blk.0.down_proj.weight',
    ffn_up: 'blk.0.up_proj.weight',
  };
} else if (arch === 'gemma2') {
  tensorNames = {
    token_embd: 'token_embd.weight',
    output_norm: 'model.norm.weight',
    output: 'output.weight',
    attn_norm: 'blk.0.input_layernorm.weight',
    wq: 'blk.0.q_proj.weight',
    wk: 'blk.0.k_proj.weight',
    wv: 'blk.0.v_proj.weight',
    wo: 'blk.0.o_proj.weight',
    ffn_norm: 'blk.0.post_attention_layernorm.weight',
    ffn_gate: 'blk.0.gate_proj.weight',
    ffn_down: 'blk.0.down_proj.weight',
    ffn_up: 'blk.0.up_proj.weight',
  };
} else {
  tensorNames = {
    token_embd: 'token_embd.weight',
    output_norm: 'output_norm.weight',
    output: 'output.weight',
    attn_norm: 'blk.0.attn_norm.weight',
    wq: 'blk.0.attn_q.weight',
    wk: 'blk.0.attn_k.weight',
    wv: 'blk.0.attn_v.weight',
    wo: 'blk.0.attn_output.weight',
    ffn_norm: 'blk.0.ffn_norm.weight',
    ffn_gate: 'blk.0.ffn_gate.weight',
    ffn_down: 'blk.0.ffn_down.weight',
    ffn_up: 'blk.0.ffn_up.weight',
  };
}

const globalTensors = [
  { name: tensorNames.token_embd, shape: [N_EMBD, N_VOCAB] },
  { name: tensorNames.output_norm, shape: [N_EMBD] },
  { name: tensorNames.output, shape: [N_VOCAB, N_EMBD] },
];

const layerTensors = [
  { name: tensorNames.attn_norm, shape: [N_EMBD] },
  { name: tensorNames.wq, shape: [N_EMBD, N_EMBD] },
  { name: tensorNames.wk, shape: [N_EMBD, N_EMBD] },
  { name: tensorNames.wv, shape: [N_EMBD, N_EMBD] },
  { name: tensorNames.wo, shape: [N_EMBD, N_EMBD] },
  { name: tensorNames.ffn_norm, shape: [N_EMBD] },
  { name: tensorNames.ffn_gate, shape: [N_FF, N_EMBD] },
  { name: tensorNames.ffn_down, shape: [N_EMBD, N_FF] },
  { name: tensorNames.ffn_up, shape: [N_FF, N_EMBD] },
];

const allTensors = [...globalTensors, ...layerTensors];
const TENSOR_COUNT = allTensors.length;

const METADATA_KV_COUNT = archKvpairs.length + 6;

buf.push(0x47, 0x47, 0x55, 0x46);
writeU32(3);
writeU64(TENSOR_COUNT);
writeU64(METADATA_KV_COUNT);

writeString('general.architecture');
writeU32(8);
writeString(arch);

writeString('tokenizer.ggml.tokens');
writeU32(9);
const tokens = [];
for (let i = 0; i < N_VOCAB; i++) tokens.push(`<tok${i}>`);
writeStringArray(tokens);

writeString('tokenizer.ggml.bos_token_id');
writeU32(4);
writeU32(1);

writeString('tokenizer.ggml.eos_token_id');
writeU32(4);
writeU32(2);

writeString('general.alignment');
writeU32(4);
writeU32(32);

for (const [key, val] of archKvpairs) {
  const fullKey = `${arch}.${key}`;
  writeString(fullKey);
  if (typeof val === 'number' && Number.isInteger(val)) {
    writeU32(4);
    writeU32(val);
  } else {
    writeU32(6);
    writeF32(val);
  }
}

const tensorDirectoryStart = buf.length;
let currentOffset = 0;

for (const tensor of allTensors) {
  writeString(tensor.name);
  writeU32(tensor.shape.length);
  for (const dim of tensor.shape) {
    writeU64(dim);
  }
  writeU32(2);
  writeU64(currentOffset);
  const nElements = tensor.shape.reduce((a, b) => a * b, 1);
  currentOffset += q4BlockCount(nElements) * 18;
}

const tensorDataStart = buf.length;
const padding = (32 - (tensorDataStart % 32)) % 32;
for (let i = 0; i < padding; i++) buf.push(0);

for (const tensor of allTensors) {
  writeTensorData(tensor.shape);
}

const buffer = Buffer.from(buf);
fs.writeFileSync(outPath, buffer);

console.log(`Mock GGUF (${arch}) written to ${outPath}`);
console.log(`Size: ${buffer.length} bytes`);
console.log(`Tensors: ${TENSOR_COUNT}`);
console.log(`Magic: ${buffer.slice(0, 4).toString('ascii')}`);