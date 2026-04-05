import { CreateWebWorkerMLCEngine, InitProgressCallback, WebWorkerMLCEngine, hasModelInCache, AppConfig } from '@mlc-ai/web-llm';
import { db } from './db';
import { findSimilarReviews, findRelevantEnterpriseContext } from './ragEngine';

export const DEFAULT_PRIMARY_MODEL_ID = 'EA-NITI-Core';
export const DEFAULT_TINY_MODEL_ID = 'EA-NITI-Alt';

// Removed static CUSTOM_APP_CONFIG. We now build this dynamically via getDynamicAppConfig()


export async function getActiveModelId(type: 'Core' | 'Tiny'): Promise<string> {
  try {
    const settings = await db.app_settings.toArray();
    if (type === 'Core') {
      const custom = settings.find(s => s.key === 'customCoreModelId')?.value;
      return custom || DEFAULT_PRIMARY_MODEL_ID;
    } else {
      const custom = settings.find(s => s.key === 'customTinyModelId')?.value;
      return custom || DEFAULT_TINY_MODEL_ID;
    }
  } catch (e) {
    return type === 'Core' ? DEFAULT_PRIMARY_MODEL_ID : DEFAULT_TINY_MODEL_ID;
  }
}

export async function getDynamicAppConfig(): Promise<AppConfig> {
  const settings = await db.app_settings.toArray();
  const cId = settings.find(s => s.key === 'customCoreModelId')?.value || DEFAULT_PRIMARY_MODEL_ID;
  const cUrl = settings.find(s => s.key === 'customCoreModelUrl')?.value || "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-MLC";
  const cLib = settings.find(s => s.key === 'customCoreModelLibUrl')?.value || "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm";
  
  const tId = settings.find(s => s.key === 'customTinyModelId')?.value || DEFAULT_TINY_MODEL_ID;
  const tUrl = settings.find(s => s.key === 'customTinyModelUrl')?.value || "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f16_1-MLC";
  const tLib = settings.find(s => s.key === 'customTinyModelLibUrl')?.value || "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm";

  return {
    model_list: [
      { model_id: cId, model_lib: cLib, model: cUrl },
      { model_id: tId, model_lib: tLib, model: tUrl }
    ]
  };
}

export async function getActiveModelUrl(modelId: string): Promise<string> {
  const config = await getDynamicAppConfig();
  const custom = config.model_list.find(m => m.model_id === modelId);
  if (custom && custom.model) return custom.model;
  return `https://huggingface.co/mlc-ai/${modelId}-GGUF`;
}


let engine: WebWorkerMLCEngine | null = null;
let currentActiveModelId: string | null = null;

export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const config = await getDynamicAppConfig();
    return await hasModelInCache(modelId, config);
  } catch (e) {
    console.warn(`Could not check cache for ${modelId}:`, e);
    return false;
  }
}

export async function unloadAIEngine(): Promise<void> {
  if (engine) {
    console.log(`Unloading active AI Engine (${currentActiveModelId}) from VRAM...`);
    await engine.unload();
    engine = null;
    currentActiveModelId = null;
  }
}

export async function initAIEngine(
  progressCallback: InitProgressCallback,
  forceDownload: boolean = false,
  requestedTarget: 'EA Core Model' | 'Domain SME Model' | 'Auto-Route Hybrid' = 'Domain SME Model'
): Promise<WebWorkerMLCEngine> {
  let targetModelId = requestedTarget === 'EA Core Model' ? 
      await getActiveModelId('Tiny') : 
      await getActiveModelId('Core');

  // If engine is already loaded with the requested model, return it
  if (engine && currentActiveModelId === targetModelId) {
    return engine;
  }

  // If a different model is loaded, we heavily prioritize VRAM by unloading it first
  if (engine && currentActiveModelId !== targetModelId) {
    await unloadAIEngine();
  }

  const isModelAvailable = await isModelCached(targetModelId);
  const needsDownload = !isModelAvailable;

  // Consent and security blocking
  if (needsDownload && !forceDownload) {
    const settings = await db.app_settings.toArray();
    const networkEnabled = settings.find(s => s.key === 'enableNetworkIntegrations')?.value;
    
    // Trigger global UI modal
    window.dispatchEvent(new CustomEvent('EA_AI_CONSENT_REQUIRED', {
      detail: { networkEnabled, targetModelId, executionTarget: requestedTarget }
    }));
    
    if (!networkEnabled) {
      throw new Error(`CONSENT_REQUIRED_OFFLINE: ${targetModelId} is missing. Please enable explicit Internet Access in Network & Privacy to download it.`);
    } else {
      throw new Error(`CONSENT_REQUIRED: Action requires downloading ${targetModelId} weights. Do you consent?`);
    }
  }

  const worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
  
  currentActiveModelId = targetModelId;
  const interceptProgress: InitProgressCallback = (progress) => {
    // Bubble to any global listeners (e.g. EngineDiagnostics UI)
    window.dispatchEvent(new CustomEvent('EA_AI_PROGRESS', { 
      detail: { text: progress.text, progress: progress.progress }
    }));
    // Call the original caller's callback (e.g. ModelConsentModal)
    progressCallback(progress);
  };

  const config = await getDynamicAppConfig();
  
  engine = await CreateWebWorkerMLCEngine(
    worker,
    targetModelId,
    { 
      initProgressCallback: interceptProgress,
      appConfig: config
    }
  );
  
  return engine;
}


export async function generateReview(
  prompt: string,
  onUpdate: (text: string) => void,
  executionTarget: 'EA Core Model' | 'Domain SME Model' | 'Auto-Route Hybrid' = 'Domain SME Model'
): Promise<string> {
  // If Auto-Route Hybrid is selected, we parse the prompt intent.
  // We identify "DDQ", "Architecture Layer", or "STRIDE" to route to the Tiny EA Core.
  let target = executionTarget;
  if (target === 'Auto-Route Hybrid') {
    const isCoreEA = /DDQ|scorecard|architecture layer|STRIDE/i.test(prompt);
    target = isCoreEA ? 'EA Core Model' : 'Domain SME Model';
    onUpdate(`[Auto-Router] Identified intent. Routing to ${target}...`);
  }

  let finalPrompt = prompt;
  if (target === 'EA Core Model' || target === 'Domain SME Model') {
    onUpdate(`[RAG Engine] Querying Long-Term Semantic Memory & Enterprise Context...`);
    try {
      const historicalContextsPromise = findSimilarReviews(prompt);
      const enterpriseContextsPromise = findRelevantEnterpriseContext(prompt);
      
      const [historicalContexts, enterpriseContexts] = await Promise.all([historicalContextsPromise, enterpriseContextsPromise]);
      
      let contextInjection = "";
      
      if (enterpriseContexts.length > 0) {
        onUpdate(`[RAG Engine] Found ${enterpriseContexts.length} relevant proprietary enterprise facts.`);
        contextInjection += `[PROPRIETARY ENTERPRISE CONTEXT]\nThe following are mandatory rules, constraints, and facts specific to this enterprise. You MUST abide by them:\n\n${enterpriseContexts.join("\n\n")}\n[END PROPRIETARY CONTEXT]\n\n`;
      }
      
      if (historicalContexts.length > 0) {
        onUpdate(`[RAG Engine] Found ${historicalContexts.length} relevant historical architectural decisions.`);
        contextInjection += `[ENTERPRISE HISTORICAL CONTEXT]\nThe following are historical architectural decisions previously made by this enterprise. Use them to ensure your current review does not blindly conflict with past approved architectures:\n\n${historicalContexts.join("\n\n")}\n[END HISTORICAL CONTEXT]\n\n`;
      }
      
      if (contextInjection) {
         finalPrompt = contextInjection + prompt;
      }
      
    } catch (e) {
      console.warn("RAG query failed, proceeding without extended context.", e);
    }
  }

  // Ensure the appropriate model is initialized, swapping VRAM if needed.
  await initAIEngine(() => {}, false, target);

  if (!engine) throw new Error('AI Engine failed to initialize');
  
  const chunks = await engine.chat.completions.create({
    messages: [{ role: 'user', content: finalPrompt }],
    temperature: target === 'EA Core Model' ? 0.2 : 0.7, // Lower temperature for EA Core to prevent hallucination
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

export async function chatWithAgent(
  messages: { role: 'user' | 'assistant' | 'system', content: string }[],
  onUpdate: (text: string) => void,
  executionTarget: 'EA Core Model' | 'Domain SME Model' | 'Auto-Route Hybrid' = 'Domain SME Model'
): Promise<string> {
  // Use the auto-routing logic if Hybrid is selected
  let target = executionTarget;
  if (target === 'Auto-Route Hybrid') {
    const prompt = messages[messages.length - 1]?.content || '';
    const isCoreEA = /DDQ|scorecard|architecture layer|STRIDE/i.test(prompt);
    target = isCoreEA ? 'EA Core Model' : 'Domain SME Model';
    onUpdate(`[Auto-Router] Routing to ${target}...\n\n`);
  }

  await initAIEngine(() => {}, false, target);

  if (!engine) throw new Error('AI Engine failed to initialize');
  
  const chunks = await engine.chat.completions.create({
    messages,
    temperature: executionTarget === 'EA Core Model' ? 0.3 : 0.7,
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
