import { VocabularyDictionary } from './VocabularyDictionary';
import { DeepParsedQuery } from './StructuralVectoriser';

export class StructuralSynthesizer {
  private vocab: VocabularyDictionary;
  private subjects: Uint32Array;
  private actions: Uint32Array;
  private targets: Uint32Array;

  constructor(maxRecords: number, vocab: VocabularyDictionary) {
    this.vocab = vocab;
    this.subjects = new Uint32Array(maxRecords);
    this.actions = new Uint32Array(maxRecords);
    this.targets = new Uint32Array(maxRecords);
  }

  public learn(subject: string, action: string, target: string, index: number): void {
    this.subjects[index] = this.vocab.getId(subject);
    this.actions[index] = this.vocab.getId(action);
    this.targets[index] = this.vocab.getId(target);
  }

  public resize(newMax: number): void {
    const newSubjects = new Uint32Array(newMax);
    const newActions = new Uint32Array(newMax);
    const newTargets = new Uint32Array(newMax);
    
    const elementsToCopy = Math.min(this.subjects.length, newMax);
    newSubjects.set(this.subjects.subarray(0, elementsToCopy));
    newActions.set(this.actions.subarray(0, elementsToCopy));
    newTargets.set(this.targets.subarray(0, elementsToCopy));
    
    this.subjects = newSubjects;
    this.actions = newActions;
    this.targets = newTargets;
  }

  public getRawComponents(index: number): { s: string, i: string, t: string } {
    return {
        s: this.vocab.getWord(this.subjects[index]) || '',
        i: this.vocab.getWord(this.actions[index]) || '',
        t: this.vocab.getWord(this.targets[index]) || ''
    };
  }

  public generate(index: number, queryTopology: DeepParsedQuery): string {
    const { s, i, t } = this.getRawComponents(index);
    if (!s && !i && !t) return "I have no structural memory of this.";

    let verb = i;
    if (queryTopology.Tense === 'Past') verb = i.endsWith('e') ? `${i}d` : `${i}ed`;
    else if (queryTopology.Tense === 'Future') verb = `will ${i}`;
    else verb = i.endsWith('s') ? i : `${i}s`;

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