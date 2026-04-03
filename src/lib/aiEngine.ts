import { CreateWebWorkerMLCEngine, InitProgressCallback, WebWorkerMLCEngine } from '@mlc-ai/web-llm';

let engine: WebWorkerMLCEngine | null = null;

export async function initAIEngine(
  progressCallback: InitProgressCallback
): Promise<WebWorkerMLCEngine> {
  if (engine) return engine;
  
  const worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
  
  engine = await CreateWebWorkerMLCEngine(
    worker,
    'Phi-3-mini-4k-instruct-q4f16_1-MLC',
    { initProgressCallback: progressCallback }
  );
  
  return engine;
}

export async function generateReview(
  prompt: string,
  onUpdate: (text: string) => void
): Promise<string> {
  if (!engine) throw new Error('AI Engine not initialized');
  
  const chunks = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    stream: true,
  });
  
  let reply = "";
  for await (const chunk of chunks) {
    const content = chunk.choices[0]?.delta?.content || "";
    reply += content;
    onUpdate(reply);
  }
  
  return reply;
}

export async function analyzeWebTrends(
  webData: string,
  onUpdate: (text: string) => void
): Promise<string> {
  if (!engine) throw new Error('AI Engine not initialized');

  const prompt = `Analyze these recent internet search results regarding Enterprise Architecture. Extract 3 new, critical principles. Output as JSON matching our architecture_principles schema.

Search Results:
${webData}

Output format must be a raw JSON array of objects with the following keys:
- name (string)
- statement (string)
- rationale (string)
- implications (string)
- layerId (number, use 1 as default)
- status (string, use "Needs Review")

Do not include any markdown formatting or explanation, just the raw JSON array.`;

  const chunks = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    stream: true,
  });

  let reply = "";
  for await (const chunk of chunks) {
    const content = chunk.choices[0]?.delta?.content || "";
    reply += content;
    onUpdate(reply);
  }

  return reply;
}

export async function analyzeWithHybridProvider(
  webData: string,
  providerType: 'WebSearchAPI' | 'CloudLLMAPI' | 'CustomEnterprise',
  onUpdate: (text: string) => void
): Promise<string> {
  try {
    if (providerType === 'WebSearchAPI' || providerType === 'CustomEnterprise') {
      return await analyzeWebTrends(webData, onUpdate);
    }

    if (providerType === 'CloudLLMAPI') {
      onUpdate('Parsing Cloud LLM response...');
      try {
        const parsed = JSON.parse(webData);

        if (Array.isArray(parsed)) {
          return JSON.stringify(parsed);
        }

        if (parsed.choices && Array.isArray(parsed.choices)) {
          const content = parsed.choices[0]?.message?.content || parsed.choices[0]?.delta?.content || '';
          return content;
        }

        return JSON.stringify(parsed);
      } catch (e) {
        // Treat as text response
        return webData;
      }
    }

    throw new Error(`Unknown provider type: ${providerType}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onUpdate(`Error in hybrid analysis: ${message}`);
    throw new Error(message);
  }
}
