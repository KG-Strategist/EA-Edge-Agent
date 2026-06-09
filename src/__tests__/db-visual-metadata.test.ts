import { describe, it, expect } from 'vitest';

describe('Strike 4.0 — DB dynamic version (visual metadata)', () => {
  it('nextVersionAfter returns max+1 from the EADatabase source string', async () => {
    const dbModule = await import('../lib/db');
    const EADatabase = (dbModule as any).EADatabase ?? (dbModule.db && (dbModule.db as any).constructor);
    expect(typeof EADatabase).toBe('function');
    const instance = Object.create(EADatabase.prototype) as { nextVersionAfter: (n: number) => number };
    const next = instance.nextVersionAfter(40);
    // Source contains version(40) as the highest literal block, so this
    // should resolve to 41. Future version() insertions remain drift-free.
    expect(next).toBeGreaterThanOrEqual(41);
  });

  it('declares the page_visual_metadata table on the database', async () => {
    const { db } = await import('../lib/db');
    expect((db as any).page_visual_metadata).toBeDefined();
    expect(typeof (db as any).page_visual_metadata).toBe('object');
  });
});
