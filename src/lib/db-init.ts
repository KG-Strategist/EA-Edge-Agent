/**
 * db-init.ts
 *
 * Production-grade database initialization with schema validation and migration support.
 */

import { db } from './db';
import { encryptString } from './cryptoVault';
import { Logger } from '../lib/logger';

// Current schema version (increment on any breaking schema changes)
const CURRENT_SCHEMA_VERSION = 36;

export async function initDatabase() {
  try {
    Logger.info('[DB] Initializing database (Schema v%d)...', CURRENT_SCHEMA_VERSION);
    
    // 1. Validate schema version from Dexie
    const actualVersion = db.verno;
    if (actualVersion === undefined || actualVersion === 0) {
      Logger.info('[DB] Fresh database detected; will auto-initialize on first seed');
      return Promise.resolve();
    }
    
    if (actualVersion > CURRENT_SCHEMA_VERSION) {
      Logger.info('[DB] WARNING: Database schema version (%d) is newer than code version (%d). Downgrade risk.', actualVersion, CURRENT_SCHEMA_VERSION);
      return Promise.resolve(); // Gracefully proceed; let app handle
    }
    
    if (actualVersion < CURRENT_SCHEMA_VERSION) {
      Logger.info('[DB] Detected schema version upgrade: %d → %d. Migrations would be applied here.', actualVersion, CURRENT_SCHEMA_VERSION);
      // ROADMAP (MVP 2.0): Implement schema migrations as needed
    }
    
    // 2. Validate table existence and indexes
    const validationResults = await validateDatabaseSchema();
    if (!validationResults.isValid) {
      Logger.info('[DB] Schema validation failed:', validationResults.errors);
      // In production, could trigger a reset or alert; for now, log and continue
    }

    // 3. Run data migrations
    await migratePBKDF2To600k();
    await migrateApiKeysToEncrypted();

    Logger.info('[DB] Database initialization complete. Ready for operation.');
    return Promise.resolve();
  } catch (error) {
    Logger.info('[DB] Fatal initialization error:', error);
    throw error;
  }
}

/**
 * Validate that all expected tables and indexes exist.
 * Returns validation status for debugging/monitoring.
 */
async function validateDatabaseSchema(): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  // List of critical tables that must exist
  const requiredTables = [
    'master_categories',
    'architecture_layers',
    'architecture_principles',
    'service_domains',
    'bespoke_tags',
    'review_sessions',
    'review_embeddings',
    'threat_models',
    'audit_logs',
    'model_registry'
  ];
  
  for (const tableName of requiredTables) {
    try {
      // Attempt to read count from each table
      const table = (db as any)[tableName];
      if (!table) {
        errors.push(`Table '${tableName}' not found in database`);
        continue;
      }
      
      const count = await table.count();
      Logger.info(`  [TABLE] ${tableName}: ${count} records`);
    } catch (err) {
      errors.push(`Failed to validate table '${tableName}': ${String(err)}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get architecture principles.
 * Async wrapper for queries (replaces empty placeholder).
 */
export async function getArchitecturePrinciples() {
  try {
    return await db.architecture_principles.where('status').equals('Active').toArray();
  } catch (err) {
    Logger.info('[DB] Error fetching architecture principles:', err);
    return [];
  }
}

/**
 * Get Service domains.
 * Async wrapper for queries.
 */
export async function getServiceDomains() {
  try {
    return await db.service_domains.where('status').equals('Active').toArray();
  } catch (err) {
    Logger.info('[DB] Error fetching Service domains:', err);
    return [];
  }
}

/**
 * Get bespoke tags.
 * Async wrapper for queries.
 */
export async function getTags() {
  try {
    return await db.bespoke_tags.where('status').equals('Active').toArray();
  } catch (err) {
    Logger.info('[DB] Error fetching tags:', err);
    return [];
  }
}

/**
 * Database health check.
 * Used by SystemHealth monitoring.
 */
export async function getDatabaseHealth() {
  try {
    const tableStats = await validateDatabaseSchema();
    const isHealthy = tableStats.isValid;
    
    // Count total records
    const masters = await db.master_categories.count();
    const sessions = await db.review_sessions.count();
    const threats = await db.threat_models.count();
    
    return {
      healthy: isHealthy,
      recordCount: { masters, sessions, threats },
      schemaVersion: db.verno || CURRENT_SCHEMA_VERSION
    };
  } catch (err) {
    Logger.info('[DB] Health check failed:', err);
    return {
      healthy: false,
      recordCount: { masters: 0, sessions: 0, threats: 0 },
      error: String(err)
    };
  }
}

/**
 * TASK 3: PBKDF2 Upgrade Migration (600k iterations)
 * When PBKDF2 iterations change from 100k to 600k, all existing password hashes become invalid.
 * CRITICAL LOCKOUT PREVENTION: Force users to re-register by clearing the users table.
 */
export async function migratePBKDF2To600k() {
  try {
    const users = await db.users.toArray();
    
    // If users exist, they were hashed with the old 100k iterations.
    // Their hashes are no longer valid with 600k iterations.
    // Purge them to force re-registration with new cryptography.
    if (users.length > 0) {
      await db.users.clear();
      Logger.info('[DB] PBKDF2 upgraded to 600k iterations. Users table cleared. Users must re-register.');
    }
  } catch (err) {
    Logger.info('[DB] PBKDF2 migration failed:', err);
    // Do not throw - continue gracefully
  }
}

/**
 * Migrate plaintext API keys to encrypted format.
 * Finds existing network_integrations with plaintext apiKey and migrates them to encryptedApiKey.
 * This ensures backward compatibility while securing sensitive credentials.
 */
export async function migrateApiKeysToEncrypted() {
  try {
    const providers = await db.network_integrations.toArray();
    let migratedCount = 0;

    for (const provider of providers) {
      // If plaintext apiKey exists but no encryptedApiKey, migrate it
      // Note: apiKey field removed from interface but may still exist in legacy DB records
      const legacyKey = (provider as any).apiKey;
      if (legacyKey && !provider.encryptedApiKey) {
        try {
          const encryptedApiKey = await encryptString(legacyKey);

          await db.network_integrations.update(provider.id!, {
            encryptedApiKey: encryptedApiKey,
          });
          // Clear plaintext key from DB (field no longer in schema)
          await db.network_integrations.where('id').equals(provider.id!).modify((obj: any) => { delete obj.apiKey; });

          migratedCount++;
          Logger.info(`[DB] Migrated API key for provider: ${provider.displayName}`);
        } catch (e) {
          Logger.info(
            `[DB] Failed to migrate API key for provider ${provider.displayName}:`,
            e instanceof Error ? e.message : String(e)
          );
          // Continue with other providers on error
        }
      }
    }

    const legacyModels = await db.model_registry.toArray();
    for (const model of legacyModels) {
      const legacyKey = (model as any).apiKey;
      if (legacyKey && !model.encryptedApiKey) {
        try {
          const encryptedApiKey = await encryptString(legacyKey);

          await db.model_registry.update(model.id!, {
            encryptedApiKey: encryptedApiKey,
          });
          await db.model_registry.where('id').equals(model.id!).modify((obj: any) => { delete obj.apiKey; });

          migratedCount++;
          Logger.info(`[DB] Migrated API key for BYOM model: ${model.name}`);
        } catch (e) {
          Logger.info(
            `[DB] Failed to migrate API key for BYOM model ${model.name}:`,
            e instanceof Error ? e.message : String(e)
          );
        }
      }
    }

    if (migratedCount > 0) {
      Logger.info(`[DB] Successfully migrated ${migratedCount} API key(s) to encrypted format`);
    }
  } catch (err) {
    Logger.info('[DB] API key migration failed:', err);
    // Do not throw - allow app to continue even if migration fails
    // (the app can still function with legacy plaintext keys as fallback)
  }
}
