# Plan: agentchat-refactor — AgentChat component split

> Goal: split 640-line AgentChat.tsx per the 300-line rule | Branch: `feat/agentchat-refactor`
> Roadmap: Stage 1.3 Config-Driven Intelligence

## Spec & contract ingestion
- `src/components/ui/AgentChat.tsx` (640 lines — map state, effects, handlers)
- e2e `chat.spec.ts` + headed UCV chat cases (behavioral contract)
- a11y gate (form-control accessible names must be preserved exactly)

## Blast-radius analysis
- Layer 1 only. Presentational split: `MessageList.tsx` + `ChatInput.tsx`
  (+ keep container). Props drilling, no logic changes, no hook moves
  across layers. DOM output and every data-testid identical.
- Risk control: diff rendered output before/after via existing e2e specs;
  any behavioral delta aborts the cycle (revert branch, record lesson).

## Harness-first TDD
- No new unit tests required if the split is purely presentational; the
  proof is: tsc + lint + a11y + e2e smoke/chat specs green with zero
  selector changes.

## Atomic implementation (sketch)
- Extract message-list rendering → MessageList (props: messages, flags).
- Extract composer → ChatInput (props: value, callbacks, disabled).
- Container keeps all state/effects/subscriptions untouched.

## Regression proof
- Full 8 gates + chat e2e. Update ROADMAP + BUG_BACKLOG.
