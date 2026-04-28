/**
 * Scorecard Engine — BDAT Weighted Vendor Comparison
 *
 * Pure function module. No React dependencies.
 * Consumes DDQScorecard objects from ddqRules.ts and applies
 * configurable Business/Data/Application/Technology axis weights
 * to produce a ranked vendor comparison.
 */

import { DDQScorecard } from './ddqRules';

// ─── Types ───────────────────────────────────────────────────

export interface BDATWeights {
  B: number; // Business
  D: number; // Data
  A: number; // Application
  T: number; // Technology
}

export interface BDATAxisScore {
  raw: number;      // Sum of principle scores on this axis
  max: number;      // Sum of max possible scores on this axis
  percentage: number;
  weighted: number;  // raw * (weight / 100)
}

export interface WeightedVendorResult {
  name: string;
  axes: { B: BDATAxisScore; D: BDATAxisScore; A: BDATAxisScore; T: BDATAxisScore };
  totalWeightedScore: number;
  totalRawScore: number;
  totalMaxScore: number;
  overallPercentage: number;
}

// ─── BDAT Principle Mapping ──────────────────────────────────
// Maps each DDQ design principle to a BDAT axis.
// B = Business value & alignment
// D = Data governance, compliance, portability
// A = Application architecture patterns
// T = Technology infrastructure & operations

export const BDAT_PRINCIPLE_MAP: Record<string, keyof BDATWeights> = {
  // Business Axis
  'Capability Dedupe':        'B',
  'Outsourcing':              'B',
  'Testing':                  'B',

  // Data Axis
  'Security':                 'D',
  'Compliance':               'D',
  'Data Models':              'D',
  'Portability':              'D',

  // Application Axis
  'Scalability':              'A',
  'Extensibility':            'A',
  'Interoperability':         'A',
  'API':                      'A',

  // Technology Axis
  'Reliability':              'T',
  'Performance Optimization': 'T',
  'Observability':            'T',
  'Build and Deployments':    'T',
  'Tech Obsolescence':        'T',
  'Migration':                'T',
  'VAPT / AppSec':            'T',
};

// ─── Weight Presets ──────────────────────────────────────────

export const BDAT_WEIGHT_PRESETS: Record<string, BDATWeights> = {
  NSI:          { B: 15, D: 35, A: 15, T: 35 },
  Enhancement:  { B: 30, D: 20, A: 30, T: 20 },
  Flat:         { B: 25, D: 25, A: 25, T: 25 },
};

/**
 * Returns the appropriate BDAT weight preset based on the review type string.
 * Falls back to Flat if no match is found.
 */
export function getDefaultWeightsForReviewType(reviewType: string): BDATWeights {
  const normalized = reviewType.toLowerCase();
  if (normalized.includes('nsi') || normalized.includes('new system')) {
    return { ...BDAT_WEIGHT_PRESETS.NSI };
  }
  if (normalized.includes('enhancement') || normalized.includes('er ')) {
    return { ...BDAT_WEIGHT_PRESETS.Enhancement };
  }
  return { ...BDAT_WEIGHT_PRESETS.Flat };
}

// ─── Core Computation ────────────────────────────────────────

/**
 * Computes a BDAT-weighted scorecard for multiple vendors.
 * Each vendor's DDQScorecard principleScores are mapped to BDAT axes,
 * weighted, and returned as a ranked array (highest weighted score first).
 */
export function computeWeightedScorecard(
  vendors: { name: string; scorecard: DDQScorecard }[],
  weights: BDATWeights
): WeightedVendorResult[] {
  // Normalize weights to ensure they sum to 100
  const totalWeight = weights.B + weights.D + weights.A + weights.T;
  const norm: BDATWeights = {
    B: (weights.B / totalWeight) * 100,
    D: (weights.D / totalWeight) * 100,
    A: (weights.A / totalWeight) * 100,
    T: (weights.T / totalWeight) * 100,
  };

  return vendors.map(vendor => {
    const axisAccum: Record<keyof BDATWeights, { raw: number; max: number }> = {
      B: { raw: 0, max: 0 },
      D: { raw: 0, max: 0 },
      A: { raw: 0, max: 0 },
      T: { raw: 0, max: 0 },
    };

    // Accumulate principle scores into BDAT axes
    for (const [principle, data] of Object.entries(vendor.scorecard.principleScores)) {
      const axis = BDAT_PRINCIPLE_MAP[principle];
      if (axis) {
        axisAccum[axis].raw += data.score;
        axisAccum[axis].max += data.maxScore;
      }
    }

    // Build axis scores with weighting
    const axes = {} as WeightedVendorResult['axes'];
    let totalWeightedScore = 0;
    let totalRawScore = 0;
    let totalMaxScore = 0;

    for (const key of ['B', 'D', 'A', 'T'] as (keyof BDATWeights)[]) {
      const { raw, max } = axisAccum[key];
      const percentage = max > 0 ? (raw / max) * 100 : 0;
      const weighted = percentage * (norm[key] / 100);

      axes[key] = {
        raw,
        max,
        percentage: Math.round(percentage),
        weighted: Math.round(weighted * 100) / 100,
      };

      totalWeightedScore += weighted;
      totalRawScore += raw;
      totalMaxScore += max;
    }

    return {
      name: vendor.name,
      axes,
      totalWeightedScore: Math.round(totalWeightedScore * 100) / 100,
      totalRawScore,
      totalMaxScore,
      overallPercentage: totalMaxScore > 0 ? Math.round((totalRawScore / totalMaxScore) * 100) : 0,
    };
  }).sort((a, b) => b.totalWeightedScore - a.totalWeightedScore);
}

/**
 * Returns the principle-level breakdown for a specific BDAT axis.
 * Useful for rendering expandable detail rows in the scorecard table.
 */
export function getPrinciplesByAxis(axis: keyof BDATWeights): string[] {
  return Object.entries(BDAT_PRINCIPLE_MAP)
    .filter(([, a]) => a === axis)
    .map(([principle]) => principle);
}
