import { db } from './db';

export async function queryEAContext(userPrompt: string): Promise<string> {
  const query = userPrompt.toLowerCase();
  
  // Query Dexie for EA Principles
  const allPrinciples = await db.architecture_principles.toArray();
  const relevantPrinciples = allPrinciples.filter(p => 
    p.name.toLowerCase().includes(query) || 
    p.statement.toLowerCase().includes(query)
  ).slice(0, 3);

  // Query Dexie for Service Domains
  const allDomains = await db.service_domains.toArray();
  const relevantDomains = allDomains.filter(d => 
    d.name.toLowerCase().includes(query) || 
    d.description.toLowerCase().includes(query)
  ).slice(0, 3);

  let result = `**[Lightweight RAG Result]**\n\n`;

  if (relevantPrinciples.length > 0) {
    result += `**EA Principles Context:**\n`;
    relevantPrinciples.forEach(p => {
      result += `- **${p.name}**: ${p.statement}\n`;
    });
    result += `\n`;
  }

  if (relevantDomains.length > 0) {
    result += `**Service Domains Context:**\n`;
    relevantDomains.forEach(d => {
      result += `- **${d.name}**: ${d.description}\n`;
    });
    result += `\n`;
  }

  if (relevantPrinciples.length === 0 && relevantDomains.length === 0) {
    result += `No specific EA Principles or Service Domains found matching your query in the local database.\n`;
  }

  return result;
}
