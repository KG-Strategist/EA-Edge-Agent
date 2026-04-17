import { db } from '../lib/db';
import { chatWithAgent } from '../lib/aiEngine';

export class EdgeRouter {
  /**
   * Evaluates the complexity of a prompt using a lightweight local heuristic.
   * Returns a score from 1-100.
   */
  static evaluateComplexity(prompt: string): number {
    let score = 0;
    
    // 1. Length factor (up to 30 points)
    const lengthScore = Math.min(30, Math.floor(prompt.length / 10));
    score += lengthScore;

    // 2. Keyword presence (up to 50 points)
    const keywords = [
      'framework', 'compliance', 'gdpr', 'integration', 'threat', 'architecture',
      'security', 'strategy', 'roadmap', 'governance', 'policy', 'standard',
      'pattern', 'design', 'system', 'data', 'privacy', 'risk', 'model', 'ddq',
      'scorecard', 'stride'
    ];
    
    const lowerPrompt = prompt.toLowerCase();
    let keywordCount = 0;
    for (const kw of keywords) {
      if (lowerPrompt.includes(kw)) {
        keywordCount++;
      }
    }
    const keywordScore = Math.min(50, keywordCount * 10);
    score += keywordScore;

    // 3. Constraints or specific formatting requests (up to 20 points)
    const constraints = ['must', 'require', 'json', 'format', 'table', 'list', 'compare', 'analyze'];
    let constraintCount = 0;
    for (const c of constraints) {
      if (lowerPrompt.includes(c)) {
        constraintCount++;
      }
    }
    const constraintScore = Math.min(20, constraintCount * 10);
    score += constraintScore;

    return Math.min(100, Math.max(1, score));
  }

  /**
   * Routes the inference based on complexity score.
   */
  static async routeInference(
    prompt: string,
    messages: { role: 'user' | 'assistant' | 'system', content: string }[],
    onUpdate: (text: string) => void
  ): Promise<{ response: string, engineUsed: string, routingScore: number }> {
    const startTime = performance.now();
    
    // 1. Fetch threshold
    const thresholdSetting = await db.app_settings.get('routingThreshold');
    const threshold = thresholdSetting?.value || 50;

    // 2. Evaluate complexity
    const score = this.evaluateComplexity(prompt);

    // 3. Determine engine
    let engineUsed = 'Primary EA Agent';
    if (score >= threshold) {
      // Check if a secondary BYOM model is available
      const models = await db.model_registry.toArray();
      const secondary = models.find(m => m.type === 'SECONDARY' && m.isActive);
      if (secondary) {
        engineUsed = secondary.name;
      }
    }

    // 4. Execute inference
    const response = await chatWithAgent(messages, onUpdate, engineUsed);

    const executionTimeMs = performance.now() - startTime;

    // 5. Check distillation
    let distillationTriggered = false;
    if (engineUsed !== 'Primary EA Agent' && engineUsed !== 'Tiny Triage Agent') {
      const models = await db.model_registry.toArray();
      const usedModel = models.find(m => m.name === engineUsed);
      if (usedModel && usedModel.allowDistillation) {
        if ((window as any).distillationWorker) {
          (window as any).distillationWorker.postMessage({
            type: 'HARVEST',
            payload: {
              text: `Prompt: ${prompt}\n\nResponse: ${response}`,
              metadata: { source: engineUsed, score }
            }
          });
          distillationTriggered = true;
        }
      }
    }

    // 6. Log telemetry
    await this.logTelemetry({
      routingScore: score,
      engineUsed,
      executionTimeMs,
      distillationTriggered
    });

    return { response, engineUsed, routingScore: score };
  }

  static async logTelemetry(data: {
    routingScore: number,
    engineUsed: string,
    executionTimeMs: number,
    distillationTriggered: boolean
  }) {
    // Explicitly stripping prompt text, PII, and vector data by only saving the required schema
    await db.local_telemetry_vault.add({
      timestamp: new Date(),
      routingScore: data.routingScore,
      engineUsed: data.engineUsed,
      executionTimeMs: data.executionTimeMs,
      distillationTriggered: data.distillationTriggered
    });
  }
}
