import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, BianDomain } from '../lib/db';

const SEED_DOMAINS: BianDomain[] = [
  {
    name: 'Customer Offer',
    businessArea: 'Sales & Service',
    businessDomain: 'Customer Management',
    controlRecord: 'Customer Offer Procedure',
    functionalPattern: 'Agree',
    description: 'Management of customer offers and campaigns.',
    status: 'Active'
  },
  {
    name: 'Lending',
    businessArea: 'Lending',
    businessDomain: 'Consumer Lending',
    controlRecord: 'Loan Agreement',
    functionalPattern: 'Fulfill',
    description: 'Management of loans and credit facilities.',
    status: 'Active'
  },
  {
    name: 'Payments',
    businessArea: 'Operations & Execution',
    businessDomain: 'Payments Operations',
    controlRecord: 'Payment Execution',
    functionalPattern: 'Execute',
    description: 'Execution and management of payment transactions.',
    status: 'Active'
  },
  {
    name: 'Credit Assessment',
    businessArea: 'Risk & Compliance',
    businessDomain: 'Risk Management',
    controlRecord: 'Credit Decision',
    functionalPattern: 'Assess',
    description: 'Evaluation of creditworthiness for counterparty risk.',
    status: 'Active'
  },
  {
    name: 'Current Account',
    businessArea: 'Operations & Execution',
    businessDomain: 'Account Management',
    controlRecord: 'Account Facility',
    functionalPattern: 'Track & Maintain',
    description: 'Fulfillment and handling of checking/current accounts.',
    status: 'Active'
  }
];

export function useBianDomains(searchTerm: string = '') {
  const [isSeeding, setIsSeeding] = useState(true);

  // 1. Initial Seed Logic
  useEffect(() => {
    async function seedBianIfNeeded() {
      try {
        const count = await db.bian_domains.count();
        if (count === 0) {
          await db.bian_domains.bulkAdd(SEED_DOMAINS);

          // Seed Master Categories mapping to these new types
          const masterAdditions = [];
          
          const uniqueAreas = Array.from(new Set(SEED_DOMAINS.map(d => d.businessArea)));
          uniqueAreas.forEach(a => masterAdditions.push({ name: a, type: 'bian_business_area', isActive: true }));
          
          const uniqueDomains = Array.from(new Set(SEED_DOMAINS.map(d => d.businessDomain)));
          uniqueDomains.forEach(d => masterAdditions.push({ name: d, type: 'bian_business_domain', isActive: true }));
          
          const uniqueCRs = Array.from(new Set(SEED_DOMAINS.map(d => d.controlRecord)));
          uniqueCRs.forEach(c => masterAdditions.push({ name: c, type: 'bian_control_record', isActive: true }));
          
          const uniqueFPs = Array.from(new Set(SEED_DOMAINS.map(d => d.functionalPattern)));
          uniqueFPs.forEach(f => masterAdditions.push({ name: f, type: 'bian_functional_pattern', isActive: true }));

          await db.master_categories.bulkAdd(masterAdditions as any);
        }
      } catch (error) {
        console.error("Failed to seed BIAN domains:", error);
      } finally {
        setIsSeeding(false);
      }
    }
    seedBianIfNeeded();
  }, []);

  // 2. Query capabilities
  const domains = useLiveQuery(
    async () => {
      if (isSeeding) return [];
      
      const allDomains = await db.bian_domains.toArray();
      
      if (!searchTerm) return allDomains;
      
      const lowerSearch = searchTerm.toLowerCase();
      return allDomains.filter(domain => 
        domain.name.toLowerCase().includes(lowerSearch) ||
        domain.businessArea.toLowerCase().includes(lowerSearch) ||
        domain.businessDomain.toLowerCase().includes(lowerSearch)
      );
    },
    [searchTerm, isSeeding],
    [] // Default value during loading
  );

  return {
    domains: domains || [],
    isLoading: isSeeding || domains === undefined
  };
}
