import { db, ChatThread, ChatMessage, DistillationTask } from './db';
import { secureAddChatMessage, secureGetChatMessages } from './secureDb';

export async function createThread(title?: string): Promise<number> {
  const newThread: ChatThread = {
    title: title || 'New Chat',
    updatedAt: Date.now()
  };
  return (await db.chat_threads.add(newThread)) as number;
}

export async function getThreads(): Promise<ChatThread[]> {
  return await db.chat_threads.orderBy('updatedAt').reverse().toArray();
}

export async function addMessage(
  threadId: number, 
  role: 'user'|'assistant'|'system', 
  content: string, 
  engine?: 'sovereign'|'neuro-symbolic'|'pending'
): Promise<number> {
  await db.chat_threads.update(threadId, { updatedAt: Date.now() });
  return await secureAddChatMessage(threadId, role, content, engine);
}

export async function getMessages(threadId: number): Promise<ChatMessage[]> {
  return await secureGetChatMessages(threadId);
}

export async function queueForDistillation(query: string, context?: string): Promise<number> {
  const task: DistillationTask = {
    query,
    contextContext: context,
    status: 'pending',
    createdAt: Date.now()
  };
  return (await db.distillation_queue.add(task)) as number;
}
