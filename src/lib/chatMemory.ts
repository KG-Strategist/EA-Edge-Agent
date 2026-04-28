import { db, ChatThread, ChatMessage, DistillationTask } from './db';

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
  engine?: 'webllm'|'neuro-symbolic'|'pending'
): Promise<number> {
  const newMessage: ChatMessage = {
    threadId,
    role,
    content,
    inferenceEngine: engine || 'pending',
    timestamp: Date.now()
  };
  
  await db.chat_threads.update(threadId, { updatedAt: Date.now() });
  return (await db.chat_messages.add(newMessage)) as number;
}

export async function getMessages(threadId: number): Promise<ChatMessage[]> {
  return await db.chat_messages.where('threadId').equals(threadId).sortBy('timestamp');
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
