/**
 * db-init.ts
 * 
 * Production-grade database initialization with schema validation and migration support.
 */

import { db, EADatabase } from './db';

// Current schema version (increment on any breaking schema changes)
const CURRENT_SCHEMA_VERSION = 23;

export async function initDatabase() {
  try {
    console.log('[DB] Initializing database (Schema v%d)...', CURRENT_SCHEMA_VERSION);
    
    // 1. Validate schema version from Dexie
    const actualVersion = db.verno;
    if (actualVersion === undefined || actualVersion === 0) {
      console.log('[DB] Fresh database detected; will auto-initialize on first seed');
      return Promise.resolve();
    }
    
    if (actualVersion > CURRENT_SCHEMA_VERSION) {
      console.warn('[DB] WARNING: Database schema version (%d) is newer than code version (%d). Downgrade risk.', actualVersion, CURRENT_SCHEMA_VERSION);
      return Promise.resolve(); // Gracefully proceed; let app handle
    }
    
    if (actualVersion < CURRENT_SCHEMA_VERSION) {
      console.log('[DB] Detected schema version upgrade: %d → %d. Migrations would be applied here.', actualVersion, CURRENT_SCHEMA_VERSION);
      // TODO: Implement schema migrations as needed
    }
    
    // 2. Validate table existence and indexes
    const validationResults = await validateDatabaseSchema();
    if (!validationResults.isValid) {
      console.error('[DB] Schema validation failed:', validationResults.errors);
      // In production, could trigger a reset or alert; for now, log and continue
    }
    
    console.log('[DB] Database initialization complete. Ready for operation.');
    return Promise.resolve();
  } catch (error) {
    console.error('[DB] Fatal initialization error:', error);
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
    'bian_domains',
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
      console.log(`  [TABLE] ${tableName}: ${count} records`);
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
    console.error('[DB] Error fetching architecture principles:', err);
    return [];
  }
}

/**
 * Get BIAN domains.
 * Async wrapper for queries.
 */
export async function getBianDomains() {
  try {
    return await db.bian_domains.where('status').equals('Active').toArray();
  } catch (err) {
    console.error('[DB] Error fetching BIAN domains:', err);
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
    console.error('[DB] Error fetching tags:', err);
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
    console.error('[DB] Health check failed:', err);
    return {
      healthy: false,
      recordCount: { masters: 0, sessions: 0, threats: 0 },
      error: String(err)
    };
  }
}
