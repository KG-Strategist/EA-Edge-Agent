import { PGlite } from '@electric-sql/pglite';
import seedData from '../data/ea_seed_data.json';
import { Logger } from '../lib/logger';

let db: PGlite | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'INIT') {
      if (!db) {
        // Initialize PGLite with IndexedDB persistence
        db = new PGlite('idb://ea-niti-pglite');
        await db.waitReady;
        
        // Setup initial schema if needed
        await db.exec(`
          CREATE TABLE IF NOT EXISTS sme_routing (
            id SERIAL PRIMARY KEY,
            domain VARCHAR(255) NOT NULL,
            rules JSONB NOT NULL
          );
          
          CREATE TABLE IF NOT EXISTS togaf_phases (
            id VARCHAR(10) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT
          );
          
          CREATE TABLE IF NOT EXISTS service_domains (
            id VARCHAR(10) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            businessArea VARCHAR(255),
            status VARCHAR(50)
          );
        `);

        // Check if seeded
        const res = await db.query('SELECT count(*) as count FROM togaf_phases');
        if (Number((res.rows[0] as any).count) === 0) {
          Logger.info('[PGLite] Seeding TOGAF and Service data...');
          // Seed TOGAF
          for (const phase of seedData.togaf_phases) {
            await db.query('INSERT INTO togaf_phases (id, name, description) VALUES ($1, $2, $3)', [phase.id, phase.name, phase.description]);
          }
          // Seed Service Domains
          for (const domain of seedData.service_domains) {
            await db.query('INSERT INTO service_domains (id, name, businessArea, status) VALUES ($1, $2, $3, $4)', [domain.id, domain.name, domain.businessArea, domain.status]);
          }
        }
      }
      self.postMessage({ id, status: 'success' });
    } 
    else if (type === 'QUERY') {
      if (!db) throw new Error('PGLite not initialized');
      const result = await db.query(payload.query, payload.params);
      self.postMessage({ id, status: 'success', data: result.rows });
    }
    else if (type === 'EXEC') {
      if (!db) throw new Error('PGLite not initialized');
      await db.exec(payload.query);
      self.postMessage({ id, status: 'success' });
    }
  } catch (error: any) {
    self.postMessage({ id, status: 'error', error: error.message });
  }
};
