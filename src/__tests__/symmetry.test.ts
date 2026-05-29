import { expect, test } from 'vitest';
import { LexicalStateMachine } from '../lib/LexicalParser';
import { MoatVectoriser } from '../lib/StructuralVectoriser';

test('Zoned Orthogonal Hashing Symmetry', () => {
  const parser = new LexicalStateMachine();
  const vectoriser = new MoatVectoriser();

  const queryA = parser.parse("Vendor breached data");
  const queryB = parser.parse("The data was breached by the vendor");

  const vectorA = vectoriser.vectorise(queryA);
  const vectorB = vectoriser.vectorise(queryB);

  console.log("Vector A (Active):", vectorA);
  console.log("Vector B (Passive):", vectorB);

  // CoreTriplet bits (Integers 0-3) MUST be mathematically identical
  for (let i = 0; i < 4; i++) {
    expect(vectorA[i]).toBe(vectorB[i]);
  }

  // Check that the only differences are in StateVoice (integers 6-7)
  let diffsOutsideVoice = false;
  for (let i = 0; i < 32; i++) {
    if (vectorA[i] !== vectorB[i]) {
      if (i < 6 || i > 7) {
        diffsOutsideVoice = true;
      }
    }
  }
  
  expect(diffsOutsideVoice).toBe(false);

  console.log("PHASE 1 COMPLETE. Zoned Orthogonal Hashing active. Symmetry Test passed.");
});