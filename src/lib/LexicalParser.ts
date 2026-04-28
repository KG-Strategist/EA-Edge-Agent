import { DeepParsedQuery } from './StructuralVectoriser';

export class LexicalStateMachine {
  private prepositions = new Set(['under', 'over', 'before', 'after', 'through', 'between', 'into', 'during', 'without', 'with', 'about', 'against', 'by']);
  private stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'am', 'to', 'of', 'in', 'on', 'that', 'this', 'it', 'how', 'do', 'i', 'not', 'as', 'what', 'who', 'where', 'why', 'when', 'which', 'does', 'did', 'can', 'could', 'would', 'should']);
  private sentiments = new Set(['critical', 'warning', 'error', 'urgent', 'fatal', 'success', 'alas', 'danger']);
  private intentRoots = ['review', 'map', 'breach', 'delete', 'bypass', 'secure', 'block', 'penalize', 'authenticate', 'allow', 'manage', 'govern', 'represent', 'state', 'trigger', 'provide', 'define', 'enforce', 'explain', 'help'];

  private lexicon: Map<string, string> = new Map();

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
          const res = await fetch('/lexicon.json');
          if (res.ok) {
            data = await res.json();
          }
        }
      }
      this.lexicon = new Map(Object.entries(data));
    } catch (e) {
      console.warn('Failed to load lexicon', e);
    }
  }

  public parse(sentence: string): DeepParsedQuery {
    const words = sentence.replace(/[^\w\s]/gi, '').split(/\s+/).filter(w => w.length > 0);
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

    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase();

      if (this.sentiments.has(w)) {
        if (w === 'critical' || w === 'warning') {
            query.Sentiment = w.charAt(0).toUpperCase() + w.slice(1) as 'Critical' | 'Warning';
        }
        continue;
      }

      if (this.prepositions.has(w)) {
        if (w === 'by') {
          hasBy = true;
        } else {
          query.Prepositions.push(w);
        }
        continue;
      }

      if (w === 'was' || w === 'were') {
        hasWasWere = true;
        query.Tense = 'Past';
        continue;
      }

      if (w === 'will' || w === 'shall') {
        query.Tense = 'Future';
        continue;
      }

      if (this.stopWords.has(w)) continue;

      const lexiconRole = this.lexicon.get(w);

      if (lexiconRole === 'EntityDescriber') {
        query.Adjectives.push(w);
        continue;
      }

      if (lexiconRole === 'IntentAccel') {
        query.Adverbs.push(w);
        continue;
      }

      if (!lexiconRole && w.endsWith('ly') && w.length > 4) {
        query.Adverbs.push(w);
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
        if (w.endsWith('ed')) query.Tense = 'Past';
      } else {
        if (!intentFound) {
          query.Subject = query.Subject ? `${query.Subject} ${w}` : w;
        } else {
          query.Target = query.Target ? `${query.Target} ${w}` : w;
        }
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
}
