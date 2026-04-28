export class VocabularyDictionary {
  private wordToId = new Map<string, number>();
  private idToWord: string[] = ['']; // ID 0 is explicitly empty string (null sentinel)

  public getId(word: string): number {
    if (!word || word === 'null' || word.trim() === '') return 0; // Reserve 0 for null/empty/empty-string
    const normalized = word.toLowerCase().trim();
    const existing = this.wordToId.get(normalized);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.idToWord.length;
    this.idToWord.push(normalized);
    this.wordToId.set(normalized, id);
    return id;
  }

  public getWord(id: number): string | null {
    if (id === 0) return null; // Reserved null sentinel
    return this.idToWord[id] || null;
  }
}