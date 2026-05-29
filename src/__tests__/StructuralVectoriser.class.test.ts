import { describe, it, expect } from 'vitest';
import { MoatVectoriser } from '../lib/StructuralVectoriser';

describe('Class Import Test', () => {
  it('should import class', () => {
    const v = new MoatVectoriser();
    expect(v).toBeDefined();
  });
});
