import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestRole = 'user' | 'assistant' | 'system';

interface TestChatRow {
  id?: number;
  threadId: number;
  role: TestRole;
  content?: string;
  encryptedContent?: string;
  inferenceEngine: 'sovereign' | 'neuro-symbolic' | 'pending';
  timestamp: number;
}

const chatRows: TestChatRow[] = [];
let nextId = 1;

function compoundTimestampFilter(
  rows: TestChatRow[],
  lower: [number, TestRole, unknown],
  upper: [number, TestRole, unknown],
  includeUpper: boolean
) {
  const [threadId, role] = lower;
  const upperTimestamp = typeof upper[2] === 'number' ? upper[2] : Number.POSITIVE_INFINITY;
  return rows.filter(row => {
    if (row.threadId !== threadId || row.role !== role) return false;
    return includeUpper ? row.timestamp <= upperTimestamp : row.timestamp < upperTimestamp;
  });
}

function queryChain(rows: TestChatRow[]) {
  let result = [...rows];
  return {
    reverse() {
      result = [...result].reverse();
      return this;
    },
    limit(count: number) {
      result = result.slice(0, count);
      return this;
    },
    toArray: async () => [...result],
  };
}

vi.mock('../lib/db', () => ({
  db: {
    chat_threads: {
      add: vi.fn(async (row) => {
        return row.id || 1;
      }),
      clear: vi.fn(async () => {}),
    },
    chat_messages: {
      add: vi.fn(async (row: TestChatRow) => {
        const id = nextId++;
        chatRows.push({ ...row, id });
        return id;
      }),
      clear: vi.fn(async () => {
        chatRows.length = 0;
        nextId = 1;
      }),
      where: vi.fn((index: string) => ({
        equals: (value: number) => ({
          sortBy: async (field: keyof TestChatRow) => chatRows
            .filter(row => row.threadId === value)
            .sort((a, b) => Number(a[field]) - Number(b[field])),
        }),
        between: (
          lower: [number, TestRole, unknown],
          upper: [number, TestRole, unknown],
          _includeLower: boolean,
          includeUpper: boolean
        ) => {
          if (index !== '[threadId+role+timestamp]') {
            return queryChain([]);
          }
          const filtered = compoundTimestampFilter(chatRows, lower, upper, includeUpper)
            .sort((a, b) => {
              if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
              return (a.id ?? 0) - (b.id ?? 0);
            });
          return queryChain(filtered);
        },
      })),
    },
  },
}));

vi.mock('../lib/cryptoVault', () => ({
  encryptString: vi.fn(async (text: string) => `enc:${text}`),
  decryptString: vi.fn(async (ciphertext: string) => {
    if (!ciphertext.startsWith('enc:')) throw new Error('Failed to decrypt string');
    return ciphertext.slice(4);
  }),
  VaultLockedError: class VaultLockedError extends Error {},
}));

const { db } = await import('../lib/db');
const { encryptString } = await import('../lib/cryptoVault');
const { getOlderMessages, getRecentMessages, getSystemMessages } = await import('../lib/chatMemory');

async function addEncryptedMessage(
  threadId: number,
  role: TestRole,
  content: string,
  timestamp: number
) {
  await db.chat_messages.add({
    threadId,
    role,
    encryptedContent: await encryptString(content),
    inferenceEngine: role === 'assistant' ? 'sovereign' : 'pending',
    timestamp,
  } as never);
}

describe('chat memory pagination', () => {
  let threadId: number;
  const baseTimestamp = 1_800_000_000_000;

  beforeEach(async () => {
    chatRows.length = 0;
    nextId = 1;
    threadId = 1;
  });

  it('loads only the latest visible window by default', async () => {
    await addEncryptedMessage(threadId, 'system', 'system prompt', baseTimestamp);
    for (let i = 1; i <= 120; i += 1) {
      await addEncryptedMessage(
        threadId,
        i % 2 === 0 ? 'assistant' : 'user',
        `message-${i}`,
        baseTimestamp + i
      );
    }

    const page = await getRecentMessages(threadId, 80);

    expect(page.messages).toHaveLength(80);
    expect(page.messages[0].content).toBe('message-41');
    expect(page.messages[79].content).toBe('message-120');
    expect(page.hasMoreBefore).toBe(true);
    expect(page.oldestCursor).toBe(baseTimestamp + 41);
  });

  it('loads older messages before the current cursor', async () => {
    for (let i = 1; i <= 120; i += 1) {
      await addEncryptedMessage(threadId, 'user', `message-${i}`, baseTimestamp + i);
    }

    const recent = await getRecentMessages(threadId, 80);
    const older = await getOlderMessages(threadId, recent.oldestCursor!, 40);

    expect(older.messages).toHaveLength(40);
    expect(older.messages[0].content).toBe('message-1');
    expect(older.messages[39].content).toBe('message-40');
    expect(older.hasMoreBefore).toBe(false);
  });

  it('keeps system messages available outside the visible window', async () => {
    await addEncryptedMessage(threadId, 'system', 'system prompt', baseTimestamp);
    for (let i = 1; i <= 100; i += 1) {
      await addEncryptedMessage(threadId, 'user', `message-${i}`, baseTimestamp + i);
    }

    const recent = await getRecentMessages(threadId, 10);
    const system = await getSystemMessages(threadId);

    expect(recent.messages.some(message => message.role === 'system')).toBe(false);
    expect(system).toHaveLength(1);
    expect(system[0].content).toBe('system prompt');
  });

  it('does not decrypt corrupted rows outside the requested page', async () => {
    await db.chat_messages.add({
      threadId,
      role: 'user',
      encryptedContent: 'corrupted-ciphertext',
      inferenceEngine: 'pending',
      timestamp: baseTimestamp,
    } as never);

    for (let i = 1; i <= 10; i += 1) {
      await addEncryptedMessage(threadId, 'assistant', `valid-${i}`, baseTimestamp + i);
    }

    const recent = await getRecentMessages(threadId, 5);

    expect(recent.messages).toHaveLength(5);
    expect(recent.messages.map(message => message.content)).toEqual([
      'valid-6',
      'valid-7',
      'valid-8',
      'valid-9',
      'valid-10',
    ]);
  });
});
