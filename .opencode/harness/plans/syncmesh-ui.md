# Plan: syncmesh-ui — SyncMesh UI wiring

> Goal: connect the orphaned SyncMesh engine to a UI caller | Branch: `feat/syncmesh-ui`
> Roadmap: Stage 2 WebRTC P2P Sync (early slice)

## Spec & contract ingestion
- `src/lib/syncMeshService.ts` (offers/answers, DataChannels, host-only ICE)
- `src/components/admin/SystemTab.tsx` (portability export/import — the caller)
- `src/lib/brainPayload.ts` (encrypted envelope v1 — the payload format)
- Security: QR/clipboard signaling only; public STUN only after
  `checkNetworkConsent()`; AES-256-GCM payloads via existing envelope.

## Blast-radius analysis
- Layer 1 component (new `P2PSyncPanel.tsx` under components/admin or ui),
  mounted in SystemTab portability section. Layer 2 state via hooks only.
- Engine untouched except additive APIs if needed (no signature breaks —
  existing tests pin `createOffer()`/`acceptOffer(offer)` arities).
- DataChannel payloads reuse `brainPayload` envelope; no schema change.

## Harness-first TDD
- Component render test (happy-dom): panel renders offer/answer textareas,
  copy buttons, peer list; offer generation mocked.
- Engine tests already cover signaling/payload/lifecycle + ICE policy.

## Atomic implementation (sketch)
- `P2PSyncPanel`: create-offer → show base64 for QR/clipboard; paste-answer →
  complete; accept-offer → show answer; peer list + send-brain-export.
- Mount behind existing portability UI; all strings localized via existing
  notification plumbing.

## Regression proof
- New component tests + a11y gate (form-control names!) + full 8 gates.
- Update ROADMAP + BUG_BACKLOG + engineer-state.json.
