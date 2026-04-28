import { LexicalStateMachine } from '../lib/LexicalParser';
import { MoatVectoriser } from '../lib/StructuralVectoriser';

const parser = new LexicalStateMachine();
const vectoriser = new MoatVectoriser();

const sentenceA = 'Vendor breached data';
const sentenceB = 'The data was breached by the vendor';

console.log('=== SYMMETRY VERIFICATION TEST ===\n');
console.log(`Sentence A: "${sentenceA}"`);
console.log(`Sentence B: "${sentenceB}"\n`);

const parsedA = parser.parse(sentenceA);
const parsedB = parser.parse(sentenceB);

console.log('Parsed A:', JSON.stringify(parsedA, null, 2));
console.log('\nParsed B:', JSON.stringify(parsedB, null, 2));

const vecA = vectoriser.vectorise(parsedA);
const vecB = vectoriser.vectorise(parsedB);

console.log('\n--- Vector A (Uint32Array) ---');
console.log(Array.from(vecA).join(', '));

console.log('\n--- Vector B (Uint32Array) ---');
console.log(Array.from(vecB).join(', '));

let coreTripletMatch = true;
let voiceZoneMatch = false;
let onlyVoiceDifferent = true;

for (let j = 0; j < 4; j++) {
  if (vecA[j] !== vecB[j]) {
    coreTripletMatch = false;
  }
}

for (let j = 6; j <= 7; j++) {
  if (vecA[j] !== vecB[j]) {
    voiceZoneMatch = true;
  }
}

for (let j = 0; j < 32; j++) {
  if (j >= 6 && j <= 7) continue;
  if (vecA[j] !== vecB[j]) {
    onlyVoiceDifferent = false;
  }
}

console.log('\n=== RESULTS ===');
console.log(`CoreTriplet bits (ints 0-3) identical: ${coreTripletMatch ? 'PASS' : 'FAIL'}`);
console.log(`Voice zone (ints 6-7) different: ${voiceZoneMatch ? 'PASS' : 'FAIL'}`);
console.log(`Only voice zone differs: ${onlyVoiceDifferent ? 'PASS' : 'FAIL'}`);

const allPass = coreTripletMatch && voiceZoneMatch && onlyVoiceDifferent;
console.log(`\nPHASE 1 COMPLETE. Zoned Orthogonal Hashing active. Symmetry Test ${allPass ? 'PASSED' : 'FAILED'}.`);

if (!allPass) {
  console.log('\nDifference details:');
  for (let j = 0; j < 32; j++) {
    if (vecA[j] !== vecB[j]) {
      console.log(`  Int ${j}: A=0x${vecA[j].toString(16).padStart(8,'0')} B=0x${vecB[j].toString(16).padStart(8,'0')}`);
    }
  }
}