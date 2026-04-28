export class FactArena {
  public subjects: Uint16Array;
  public actions: Uint16Array;
  public targets: Uint16Array;
  public contexts: Uint16Array;

  constructor(maxFacts: number) {
    this.subjects = new Uint16Array(maxFacts);
    this.actions = new Uint16Array(maxFacts);
    this.targets = new Uint16Array(maxFacts);
    this.contexts = new Uint16Array(maxFacts);
  }
}