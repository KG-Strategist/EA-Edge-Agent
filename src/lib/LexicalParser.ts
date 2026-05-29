import { DeepParsedQuery } from './StructuralVectoriser';
import { Logger } from './logger';
import { fetchJsonAsset } from './compressedAssets';

interface ParseOptions {
  enableAutoCorrect?: boolean;
}

export class LexicalStateMachine {
  private prepositions = new Set(['under', 'over', 'before', 'after', 'through', 'between', 'into', 'during', 'without', 'with', 'about', 'against', 'by']);
  private stopWords = new Set(['the', 'is', 'are', 'am', 'to', 'of', 'in', 'on', 'that', 'this', 'it', 'how', 'do', 'not', 'as', 'what', 'who', 'where', 'why', 'when', 'which', 'does', 'did', 'can', 'could', 'would', 'should']);
  private sentiments = new Set(['critical', 'warning', 'error', 'urgent', 'fatal', 'success', 'alas', 'danger']);
  private intentRoots = [
    'review', 'map', 'breach', 'delete', 'bypass', 'secure', 'block', 'penalize',
    'authenticate', 'allow', 'manage', 'govern', 'represent', 'state', 'trigger',
    'provide', 'define', 'mean', 'enforce', 'explain', 'help', 'tell', 'list', 'compare',
    'summarize', 'analyze', 'describe', 'show'
  ];

  private lexicon: Map<string, string> = new Map();

  private v0 = new Uint8Array(128);
  private v1 = new Uint8Array(128);

  private normalizeNoun(n: string): string {
    if (!n) return n;
    if (n.endsWith('s') && !n.endsWith('ss') && !n.endsWith('is') && !n.endsWith('us') && n.length > 3) {
      return n.slice(0, -1);
    }
    return n;
  }

  private getEditDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length > b.length) { const temp = a; a = b; b = temp; }
    const aLen = a.length;
    const bLen = b.length;
    if (aLen === 0) return bLen;
    if (bLen >= 127) return 99;

    for (let i = 0; i <= aLen; i++) this.v0[i] = i;

    for (let i = 0; i < bLen; i++) {
      this.v1[0] = i + 1;
      for (let j = 0; j < aLen; j++) {
        const cost = a[j] === b[i] ? 0 : 1;
        this.v1[j + 1] = Math.min(this.v1[j] + 1, Math.min(this.v0[j + 1] + 1, this.v0[j] + cost));
      }
      for (let j = 0; j <= aLen; j++) this.v0[j] = this.v1[j];
    }
    return this.v1[aLen];
  }

  public async loadLexicon(isNodeEnv = false, basePath = '') {
    try {
      let data: Record<string, string> = {};
      if (isNodeEnv) {
        if (typeof window === 'undefined') {
          const fs = await import('fs');
          const path = await import('path');
          const filePath = path.join(basePath, 'public', 'lexicon.json');
          if (fs.existsSync(filePath)) {
            data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          }
        }
      } else {
        if (typeof window !== 'undefined') {
          data = await fetchJsonAsset<Record<string, string>>('/lexicon.json.gz', '/lexicon.json');
        }
      }
      this.lexicon = new Map(Object.entries(data));
    } catch (e) {
      Logger.warn('Failed to load lexicon', e);
    }
  }

  public parse(sentence: string, options: ParseOptions = {}): DeepParsedQuery {
    const enableAutoCorrect = options.enableAutoCorrect ?? true;
    const normalizedSentence = this.normalizeQuestion(sentence);
    const words = normalizedSentence.replace(/[^\w\s]/gi, '').split(/\s+/).filter(w => w.length > 0);
    const query: DeepParsedQuery = {
      Subject: null,
      Intent: null,
      Target: null,
      Tense: 'Present',
      Voice: 'Active',
      Adverbs: [],
      Adjectives: [],
      Prepositions: [],
      Sentiment: 'Neutral',
      Unknowns: []
    };

    let intentFound = false;
    let hasWasWere = false;
    let hasBy = false;
    let prevRole: 'Entity' | 'Intent' | null = null;

    for (let i = 0; i < words.length; i++) {
      let w = words[i].toLowerCase();

      if (w === 'a' || w === 'an') {
        if (prevRole === 'Entity') {
          if (!intentFound) {
            query.Subject = query.Subject ? `${query.Subject} ${w}` : w;
          } else {
            query.Target = query.Target ? `${query.Target} ${w}` : w;
          }
          prevRole = 'Entity';
        }
        continue;
      }

      if (this.sentiments.has(w)) {
        if (w === 'critical' || w === 'warning') {
            query.Sentiment = w.charAt(0).toUpperCase() + w.slice(1) as 'Critical' | 'Warning';
        }
        prevRole = null;
        continue;
      }

      if (this.prepositions.has(w)) {
        if (w === 'by') {
          hasBy = true;
        } else {
          query.Prepositions.push(w);
        }
        prevRole = null;
        continue;
      }

      if (w === 'was' || w === 'were') {
        hasWasWere = true;
        query.Tense = 'Past';
        prevRole = null;
        continue;
      }

      if (w === 'will' || w === 'shall') {
        query.Tense = 'Future';
        prevRole = null;
        continue;
      }

      if (this.stopWords.has(w)) {
        prevRole = null;
        continue;
      }

      let lexiconRole = this.lexicon.get(w);

      // True GC-Free Sovereign Auto-Corrector
      // Runtime shield: fixes typos in user queries using Levenshtein distance
      if (enableAutoCorrect && !lexiconRole && w.length > 3 && this.lexicon.size > 0) {
        let bestMatch: string | null = null;
        let bestDistance = 99;

        for (const key of this.lexicon.keys()) {
          if (Math.abs(key.length - w.length) > 2) continue;
          const dist = this.getEditDistance(w, key);
          if (dist === 1) {
            bestMatch = key;
            bestDistance = 1;
            break;
          }
          if (dist < bestDistance) {
            const maxAllowed = w.length > 7 ? 2 : 1;
            if (dist <= maxAllowed) {
              bestMatch = key;
              bestDistance = dist;
            }
          }
        }

        if (bestMatch) {
          Logger.warn(`[Auto-Correct] ${w} -> ${bestMatch}`);
          w = bestMatch;
          lexiconRole = this.lexicon.get(w);
        }
      }

      if (lexiconRole === 'EntityDescriber') {
        query.Adjectives.push(w);
        prevRole = null;
        continue;
      }

      if (lexiconRole === 'IntentAccel') {
        query.Adverbs.push(w);
        prevRole = null;
        continue;
      }

      if (!lexiconRole && w.endsWith('ly') && w.length > 4) {
        query.Adverbs.push(w);
        prevRole = null;
        continue;
      }

      let rootCandidate = w;
      if (w.endsWith('ing')) {
          rootCandidate = w.slice(0, -3);
      } else if (w.endsWith('ed')) {
          rootCandidate = w.slice(0, -2);
      } else if (w.endsWith('ies') && w.length > 4) {
          rootCandidate = w.slice(0, -3) + 'y';
      } else if (w.endsWith('es') && w.length > 3) {
          rootCandidate = w.slice(0, -2);
      } else if (w.endsWith('s') && w.length > 3) {
          rootCandidate = w.slice(0, -1);
      }

      const foundRoot = this.intentRoots.find(root => w.startsWith(root));

      let isIntent = false;
      if (lexiconRole === 'Intent') {
        isIntent = true;
      } else if (!lexiconRole) {
        isIntent = foundRoot !== undefined || w.endsWith('ed') || w.endsWith('ing');
      }

      if (!lexiconRole && !isIntent && !query.Adverbs.includes(w) && !query.Adjectives.includes(w) && !this.stopWords.has(w) && !this.sentiments.has(w) && !this.prepositions.has(w) && w !== 'was' && w !== 'were' && w !== 'will' && w !== 'shall') {
        query.Unknowns?.push(w);
      }

      if (!intentFound && isIntent) {
        query.Intent = foundRoot || rootCandidate;
        intentFound = true;
        prevRole = 'Intent';
        if (w.endsWith('ed')) query.Tense = 'Past';
      } else {
        const normalizedWord = this.normalizeNoun(rootCandidate);
        if (!intentFound) {
          query.Subject = query.Subject ? `${query.Subject} ${normalizedWord}` : normalizedWord;
        } else {
          query.Target = query.Target ? `${query.Target} ${normalizedWord}` : normalizedWord;
        }
        prevRole = 'Entity';
      }
    }

    if (hasWasWere && hasBy && query.Tense === 'Past' && query.Subject && query.Target) {
      query.Voice = 'Passive';
      const temp = query.Subject;
      query.Subject = query.Target;
      query.Target = temp;
    }

    return query;
  }

  private normalizeQuestion(sentence: string): string {
    const trimmed = sentence.trim();
    const lower = trimmed.toLowerCase();
    const naturalQuestion = lower.match(/^(what|who|where|why|when|which)\s+(is|are|was|were|does|do|did|can|could|should)\s+(.+)/);
    if (naturalQuestion?.[3]) {
      return `${naturalQuestion[3]} means concept`;
    }

    const imperative = lower.match(/^(explain|describe|tell me about|list|summarize|analyse|analyze|compare)\s+(.+)/);
    if (imperative?.[2]) {
      const intent = imperative[1] === 'tell me about' ? 'explain' : imperative[1] === 'analyse' ? 'analyze' : imperative[1];
      return `${imperative[2]} ${intent} concept`;
    }

    return sentence;
  }

  /**
   * Parses multi-line text into an array of DeepParsedQuery orthogonal grammar layers.
   * Splits raw text by newlines, pipes each line through the proprietary parser.
   * Extracts complete orthogonal layers: Subject, Intent, Target, Tense, Voice,
   * Adverbs, Adjectives, Prepositions, Sentiment — not just S-I-O triplets.
   */
  public parseOrthogonalLayersFromText(rawText: string): DeepParsedQuery[] {
    const layers: DeepParsedQuery[] = [];
    const lines = rawText
      .replace(/```[\s\S]*?```/g, '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && /[a-zA-Z]/.test(l));

    for (const line of lines) {
      try {
        const parsed = this.parse(line);
        if (parsed.Subject && parsed.Intent && parsed.Target) {
          layers.push(parsed);
        }
      } catch {
        // Best-effort: skip unparseable lines
      }
    }

    return layers;
  }
}
