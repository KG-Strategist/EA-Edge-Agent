import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { LexicalStateMachine } from '../lib/LexicalParser';

describe('Inference routing regressions', () => {
  it('normalizes natural questions into searchable epistemic triplets', () => {
    const parser = new LexicalStateMachine();
    const parsed = parser.parse('What is BIAN?');

    expect(parsed.Subject).toBe('bian');
    expect(parsed.Intent).toBe('mean');
    expect(parsed.Target).toBe('concept');
  });

  it('re-resolves lexicon role after autocorrect', () => {
    const parser = new LexicalStateMachine();
    (parser as unknown as { lexicon: Map<string, string> }).lexicon = new Map([
      ['secure', 'Intent'],
      ['firewall', 'Entity'],
    ]);

    const parsed = parser.parse('gateway secur firewall');

    expect(parsed.Subject).toBe('gateway');
    expect(parsed.Intent).toBe('secure');
    expect(parsed.Target).toBe('firewall');
  });

  it('can disable autocorrect for trusted corpus compilation while preserving grammar layers', () => {
    const parser = new LexicalStateMachine();
    (parser as unknown as { lexicon: Map<string, string> }).lexicon = new Map([
      ['secure', 'Intent'],
      ['firewall', 'Entity'],
      ['rapidly', 'IntentAccel'],
    ]);

    const parsed = parser.parse('gateway secur rapidly firewall', { enableAutoCorrect: false });

    expect(parsed.Subject).toBe('gateway secur firewall');
    expect(parsed.Intent).toBeNull();
    expect(parsed.Adverbs).toContain('rapidly');
  });

  it('ships canonical BIAN answer in the deterministic orchestrator', () => {
    const orchestratorPath = path.join(process.cwd(), 'src/lib/ragOrchestrator.ts');
    const content = fs.readFileSync(orchestratorPath, 'utf-8');

    expect(content).toContain('Banking Industry Architecture Network');
    expect(content).toContain('canonicalAnswerFromPrompt');
    expect(content).toContain("source: 'canonical'");
  });

  it('keeps fallback/error text out of background epistemic learning', () => {
    const shadowPath = path.join(process.cwd(), 'src/lib/EpistemicShadow.ts');
    const content = fs.readFileSync(shadowPath, 'utf-8');

    expect(content).toContain('isDistillableExchange');
    expect(content).toContain('structurally,');
    expect(content).toContain('unsupported_tensor_type');
    expect(content).toContain('cached gguf');
  });
});
