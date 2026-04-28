import { VocabularyDictionary } from '../lib/VocabularyDictionary';
import { StructuralSynthesizer } from '../lib/StructuralSynthesizer';
import { SemanticArena } from '../lib/SemanticArena';
import { MoatVectoriser } from '../lib/StructuralVectoriser';
import { LexicalStateMachine } from '../lib/LexicalParser';

const vocab = new VocabularyDictionary();
const synthesizer = new StructuralSynthesizer(100, vocab);
const arena = new SemanticArena(100);
const vectoriser = new MoatVectoriser();
const parser = new LexicalStateMachine();

console.log('=== PHASE 2 INTEGRATION TEST ===\n');

synthesizer.learn('Vendor', 'breach', 'Data', 0);
const parsed0 = parser.parse('Vendor breached data');
const vec0 = vectoriser.vectorise(parsed0);
arena.insertMemory(vec0, 0);
arena.setActiveRecords(1);

console.log('INGESTED: "Vendor breached data"');
console.log('  Subject: Vendor | Intent: breach | Target: Data\n');

const parsed1 = parser.parse('The data was breached by the vendor');
const vec1 = vectoriser.vectorise(parsed1);
console.log('QUERY: "The data was breached by the vendor"');
console.log(`  Parsed -> Subject: ${parsed1.Subject} | Intent: ${parsed1.Intent} | Target: ${parsed1.Target} | Voice: ${parsed1.Voice}\n`);

const matchIndex = arena.search(vec1, 0.5);
console.log(`SEARCH returned index: ${matchIndex}`);

const result = synthesizer.ask(matchIndex);
console.log(`\nASK(${matchIndex}): ${result}`);

const expected = 'Based on structural data: vendor breach data.';
const pass = result === expected;
console.log(`\nExpected: "${expected}"`);
console.log(`Match: ${pass ? 'PASS' : 'FAIL'}`);

console.log(`\nPHASE 2 COMPLETE. Semantic Arena allocated. Triplet Synthesizer active.`);