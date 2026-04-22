/**
 * Zod Validation Schemas for Admin Forms
 *
 * Strict input validation for core admin entities to prevent:
 * - Invalid enum values in database
 * - Corrupted type coercions
 * - Silent logic bypasses
 */

import { z } from 'zod';

// Common enums
const StatusEnum = z.enum(['Draft', 'Active', 'Needs Review', 'Deprecated']);
const ProviderTypeEnum = z.enum(['WebSearchAPI', 'CloudLLMAPI', 'CustomEnterprise']);

/**
 * ServiceDomain schema for BIAN (Business, Information, Architecture, Network) tab.
 * Validates all required fields for architecture domain entities.
 */
export const ServiceDomainSchema = z.object({
  id: z.number().optional(),
  name: z
    .string()
    .min(1, 'Domain name is required')
    .max(255, 'Domain name must be under 255 characters')
    .trim(),
  businessArea: z
    .string()
    .min(1, 'Business area is required')
    .max(255, 'Business area must be under 255 characters')
    .trim(),
  businessDomain: z
    .string()
    .min(1, 'Business domain is required')
    .max(255, 'Business domain must be under 255 characters')
    .trim(),
  controlRecord: z
    .string()
    .min(1, 'Control record is required')
    .max(500, 'Control record must be under 500 characters')
    .trim(),
  functionalPattern: z
    .string()
    .min(1, 'Functional pattern is required')
    .max(500, 'Functional pattern must be under 500 characters')
    .trim(),
  description: z
    .string()
    .max(2000, 'Description must be under 2000 characters')
    .trim()
    .or(z.literal('')),
  frameworkTag: z
    .string()
    .min(1, 'Framework tag is required')
    .max(50, 'Framework tag must be under 50 characters')
    .trim(),
  status: StatusEnum,
});

export type ServiceDomainInput = z.infer<typeof ServiceDomainSchema>;

/**
 * ArchitectureLayer schema for Layers tab.
 * Validates layer definitions within the enterprise architecture.
 */
export const ArchitectureLayerSchema = z.object({
  id: z.number().optional(),
  name: z
    .string()
    .min(1, 'Layer name is required')
    .max(255, 'Layer name must be under 255 characters')
    .trim(),
  coreLayer: z
    .string()
    .min(1, 'Core layer is required')
    .max(255, 'Core layer must be under 255 characters')
    .trim(),
  contextLayer: z
    .string()
    .max(255, 'Context layer must be under 255 characters')
    .trim()
    .or(z.literal('')),
  description: z
    .string()
    .max(2000, 'Description must be under 2000 characters')
    .trim()
    .or(z.literal('')),
  abstractionLevels: z
    .string()
    .max(500, 'Abstraction levels must be under 500 characters')
    .trim()
    .or(z.literal('')),
  categoryId: z.number().optional(),
  category: z.string().optional(),
  status: StatusEnum,
});

export type ArchitectureLayerInput = z.infer<typeof ArchitectureLayerSchema>;

/**
 * MasterCategory schema for Categories tab.
 * Validates custom taxonomy and reference categories.
 */
export const MasterCategorySchema = z.object({
  id: z.number().optional(),
  type: z
    .string()
    .min(1, 'Category type is required')
    .max(100, 'Category type must be under 100 characters')
    .trim(),
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(255, 'Category name must be under 255 characters')
    .trim(),
  description: z
    .string()
    .max(2000, 'Description must be under 2000 characters')
    .trim()
    .optional()
    .or(z.literal('')),
  status: StatusEnum,
});

export type MasterCategoryInput = z.infer<typeof MasterCategorySchema>;

/**
 * BespokeTag schema for custom tagging system.
 * Validates user-defined tags with color coding.
 */
export const BespokeTagSchema = z.object({
  id: z.number().optional(),
  name: z
    .string()
    .min(1, 'Tag name is required')
    .max(50, 'Tag name must be under 50 characters')
    .trim(),
  category: z
    .string()
    .min(1, 'Tag category is required')
    .max(50, 'Tag category must be under 50 characters')
    .trim(),
  colorCode: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, 'Color code must be a valid hex color (e.g., #FF5733)')
    .optional()
    .or(z.literal('')),
  status: StatusEnum,
});

export type BespokeTagInput = z.infer<typeof BespokeTagSchema>;

/**
 * NetworkIntegration schema for API provider configuration.
 * Validates external endpoint configurations.
 */
export const NetworkIntegrationSchema = z.object({
  id: z.number().optional(),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(255, 'Display name must be under 255 characters')
    .trim(),
  endpointUrl: z
    .string()
    .min(1, 'Endpoint URL is required')
    .url('Endpoint URL must be a valid URL'),
  apiKey: z.string().optional(),
  providerType: ProviderTypeEnum,
  isDefault: z.boolean().optional(),
  modelName: z
    .string()
    .max(255, 'Model name must be under 255 characters')
    .trim()
    .optional()
    .or(z.literal('')),
});

export type NetworkIntegrationInput = z.infer<typeof NetworkIntegrationSchema>;

/**
 * Validation utility: Safe parse with error mapping.
 * Returns { success: boolean, data?: T, errors?: string[] }
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: boolean; data?: T; errors?: string[] } {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}
