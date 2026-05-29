import { expect, test } from 'vitest';
import { LexicalStateMachine } from '../lib/LexicalParser';
import { MoatVectoriser } from '../lib/StructuralVectoriser';
import { VocabularyDictionary } from '../lib/VocabularyDictionary';
import { StructuralSynthesizer } from '../lib/StructuralSynthesizer';
import { SemanticArena } from '../lib/SemanticArena';

test('Contiguous Arena & Synthesizer Integration', () => {
  // 1. Initialize Dictionary, Synthesizer, Arena, and Vectoriser
  const parser = new LexicalStateMachine();
  const vectoriser = new MoatVectoriser();
  const vocab = new VocabularyDictionary();
  const synthesizer = new StructuralSynthesizer(100, vocab);
  const arena = new SemanticArena(100);

  // 2. Ingest
  const queryIngest = parser.parse("Vendor breached data");
  const vectorIngest = vectoriser.vectorise(queryIngest);
  arena.insertMemory(vectorIngest, 0);
  arena.setActiveRecords(1);
  synthesizer.learn(queryIngest, 0);

  // 3. Query
  const querySearch = parser.parse("The data was breached by the vendor");
  const vectorSearch = vectoriser.vectorise(querySearch);
  const matchResults = arena.search(vectorSearch, 0.5);
  if (!matchResults.length) throw new Error('No match found');
  const foundIdx: number = matchResults[0]!;

  // 4. Retrieve
  const output = synthesizer.ask(foundIdx);
  console.log(output);

  // Success Condition
  expect(output).toBe("Based on structural data: vendor breach data.");

  console.log("PHASE 2 COMPLETE. Semantic Arena allocated. Triplet Synthesizer active.");
});