# EA-NITI Release Notes

## v1.1.1 (Production Release)
*March 2024*

### 🚀 Sovereign Engine Upgrade
- **Zoned Orthogonal Hashing (ZOH):** Replaced legacy semantic search with a bespoke 1024-bit bitwise projection engine.
- **Deterministic 7-Zone Grammar:** Queries are now mapped into discrete zones (Core, Tense, Voice, Intent, Entity, Relation, Sentiment).
- **Core-First Short-Circuiting:** Optimized search throughput to <1ms for 600k+ records using 128-bit core intersection checks.

### 🛡️ Pre-Flight Security
- **Deterministic Guardrails:** Implemented a bitwise policy interceptor that executes before retrieval, eliminating LLM-level policy bypasses.
- **Parallel TypedArrays:** Isolated guardrail logic into contiguous memory to prevent V8 Garbage Collection pauses.

### 🏗️ Build-Time Intelligence
- **Sovereign Compiler:** Introduced `compileCorpus.ts` to pre-calculate semantic vectors for 460k+ dictionary words and 120k+ architectural patterns.
- **Binary Reflex Hydration:** The engine now loads optimized `.bin` files via direct binary blitting, reducing boot time by 90%.

### 🐛 Bug Fixes & Hardening
- **Fixed Genesis Freeze:** Resolved an issue where first-time installation would freeze the browser due to massive main-thread JSON parsing.
- **Vocabulary Expansion:** Upgraded the structural synthesizer from `Uint16` to `Uint32`, expanding capacity from 65k to 4B+ tokens.
- **Memory Safety:** Added dynamic arena resizing to handle arbitrary corpus sizes without `RangeError`.
- **Compiler Reliability:** Fixed stack-overflow issues in the Node.js compiler using buffered concatenation.
