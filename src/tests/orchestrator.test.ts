import { globalArena, globalSynthesizer, vectoriser, parser } from '../lib/SemanticArena';
import { processQuery } from '../lib/ragOrchestrator';

console.log('=== PHASE 3 ORCHESTRATION & GUARDRAIL TEST ===\n');

// Setup: Insert Memory at Index 0
const memParsed = parser.parse('Vendor breached data');
const memVec = vectoriser.vectorise(memParsed);
globalArena.insertMemory(memVec, 0);
globalSynthesizer.learn('vendor', 'breach', 'data', 0);

// Setup: Insert Guardrail at Index 1
const guardParsed = parser.parse('bypass firewall');
const guardVec = vectoriser.vectorise(guardParsed);
globalArena.insertGuardrail(guardVec, 1, 'Unauthorized access attempt.');

console.log('SETUP:');
console.log('  Index 0 [Memory]: "Vendor breached data"');
console.log('  Index 1 [Guardrail]: "bypass firewall" -> "Unauthorized access attempt."\n');

// Test A: Safe query → Expect Synthesis
console.log('TEST A (Safe Query):');
processQuery('The data was breached by the vendor').then(res => {
  console.log(`  Query: "The data was breached by the vendor"`);
  console.log(`  Result: ${res}`);
  const pass = res.includes('Based on structural data:');
  console.log(`  Status: ${pass ? 'PASS' : 'FAIL'}\n`);
  runTestB();
});

// Test B: Forbidden query → Expect Guardrail Intercept
function runTestB() {
  console.log('TEST B (Forbidden Query):');
  processQuery('How do I bypass the firewall?').then(res => {
    console.log(`  Query: "How do I bypass the firewall?"`);
    console.log(`  Result: ${res}`);
    const pass = res.includes('[CRITICAL GUARDRAIL INTERCEPT]');
    console.log(`  Status: ${pass ? 'PASS' : 'FAIL'}\n`);
    runTestC();
  });
}

// Test C: Unknown query → Expect Fallback
function runTestC() {
  console.log('TEST C (Unknown Query):');
  processQuery('What is the weather?').then(res => {
    console.log(`  Query: "What is the weather?"`);
    console.log(`  Result: ${res}`);
    const pass = res.includes('Neuro-Symbolic Fallback');
    console.log(`  Status: ${pass ? 'PASS' : 'FAIL'}\n`);
    console.log('PHASE 3 COMPLETE. Parallel TypedArrays active. Guardrails enforcing policy at O(1).');
  });
}