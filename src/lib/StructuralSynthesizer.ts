import { VocabularyDictionary } from './VocabularyDictionary';
import { DeepParsedQuery } from './StructuralVectoriser';

export class StructuralSynthesizer {
  private vocab: VocabularyDictionary;
  private subjects: Uint32Array;
  private actions: Uint32Array;
  private targets: Uint32Array;
  private sourceSentences: string[];
  private orthogonalComponents: (DeepParsedQuery | null)[];

  constructor(maxRecords: number, vocab: VocabularyDictionary) {
    this.vocab = vocab;
    this.subjects = new Uint32Array(maxRecords);
    this.actions = new Uint32Array(maxRecords);
    this.targets = new Uint32Array(maxRecords);
    this.sourceSentences = new Array(maxRecords).fill('');
    this.orthogonalComponents = new Array(maxRecords).fill(null);
  }

  public learn(orthogonal: DeepParsedQuery, index: number, sourceSentence: string = ''): void {
    this.subjects[index] = this.vocab.getId(orthogonal.Subject || '');
    this.actions[index] = this.vocab.getId(orthogonal.Intent || '');
    this.targets[index] = this.vocab.getId(orthogonal.Target || '');
    this.sourceSentences[index] = sourceSentence;
    this.orthogonalComponents[index] = orthogonal;
  }

  public resize(newMax: number): void {
    const newSubjects = new Uint32Array(newMax);
    const newActions = new Uint32Array(newMax);
    const newTargets = new Uint32Array(newMax);
    const newSourceSentences = new Array(newMax).fill('');
    const newOrthogonalComponents = new Array(newMax).fill(null);
    
    const elementsToCopy = Math.min(this.subjects.length, newMax);
    newSubjects.set(this.subjects.subarray(0, elementsToCopy));
    newActions.set(this.actions.subarray(0, elementsToCopy));
    newTargets.set(this.targets.subarray(0, elementsToCopy));
    for (let i = 0; i < elementsToCopy; i++) {
        newSourceSentences[i] = this.sourceSentences[i];
        newOrthogonalComponents[i] = this.orthogonalComponents[i];
    }
    
    this.subjects = newSubjects;
    this.actions = newActions;
    this.targets = newTargets;
    this.sourceSentences = newSourceSentences;
    this.orthogonalComponents = newOrthogonalComponents;
  }

  public getRawComponents(index: number): { s: string, i: string, t: string, sourceSentence: string, orthogonal: DeepParsedQuery | null } {
    return {
        s: this.vocab.getWord(this.subjects[index]) || '',
        i: this.vocab.getWord(this.actions[index]) || '',
        t: this.vocab.getWord(this.targets[index]) || '',
        sourceSentence: this.sourceSentences[index] || '',
        orthogonal: this.orthogonalComponents[index] || null
    };
  }

  public generate(index: number, queryTopology: DeepParsedQuery): string {
    const { s, i, t } = this.getRawComponents(index);
    if (!s && !i && !t) return "I have no structural memory of this.";

    let verb = i;
    if (queryTopology.Tense === 'Past') verb = i.endsWith('e') ? `${i}d` : `${i}ed`;
    else if (queryTopology.Tense === 'Future') verb = `will ${i}`;
    else {
      if (i.endsWith('y') && !/[aeiou]y$/i.test(i)) verb = i.slice(0, -1) + 'ies';
      else verb = i.endsWith('s') ? i : `${i}s`;
    }

    if (queryTopology.Voice === 'Passive') {
        return `Structurally, ${t} was ${verb} by ${s}.`;
    } else {
        const adverbs = queryTopology.Adverbs?.join(' ') || '';
        return `Structurally, ${s} ${adverbs} ${verb} ${t}`.replace(/\s+/g, ' ').trim() + '.';
    }
  }

  public ask(index: number): string | null {
    if (index === -1) {
      return "⚡ **Neuro-Symbolic Fallback** No structural data found.";
    }

    const sWord = this.vocab.getWord(this.subjects[index]);
    const aWord = this.vocab.getWord(this.actions[index]);
    const tWord = this.vocab.getWord(this.targets[index]);

    const parts = [sWord, aWord, tWord].filter(Boolean);
    if (parts.length === 0) {
      return "⚡ **Neuro-Symbolic Fallback** No structural data found.";
    }

    return "Based on structural data: " + parts.join(' ') + ".";
  }
}