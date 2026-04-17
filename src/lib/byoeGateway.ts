/**
 * Agnostic BYOE (Bring Your Own Endpoint) Gateway
 *
 * Handles secure communication with external providers:
 * - WebSearchAPI (e.g., Brave, Tavily)
 * - CloudLLMAPI (OpenAI-compatible)
 * - CustomEnterprise (internal endpoints)
 *
 * STRICT PRIVACY: no local architecture data is sent. Only sanitized queries are transmitted.
 */

import { db } from './db';
import { validateEndpointUrl } from './networkGuard';

export type ProviderType = 'WebSearchAPI' | 'CloudLLMAPI' | 'CustomEnterprise';

export interface SearchResult {
  title: string;
  content: string;
  url?: string;
}

export interface CloudLLMResponse {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
}

function sanitizeQuery(query: string): string {
  return query.replace(/[<>"'{}\\[\]]/g, '').trim().substring(0, 500);
}

function validateApiKey(apiKey: string): void {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key is required for network integration.');
  }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (!Array.isArray(results) || results.length === 0) {
    return 'No results returned from external endpoint.';
  }

  return results
    .map((item, index) => {
      const lines = [`${index + 1}. ${item.title}`, item.content || ''];
      if (item.url) {
        lines.push(`Source: ${item.url}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

async function fetchWebSearchAPI(endpointUrl: string, apiKey: string, query: string): Promise<string> {
  validateEndpointUrl(endpointUrl);
  const payload = {
    api_key: apiKey,
    query,
    search_depth: 'basic',
    max_results: 10,
  };

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Search API error ${response.status}: ${response.statusText} ${body}`);
  }

  const data = await response.json().catch(() => ({}));
  let results: SearchResult[] = [];

  if (Array.isArray(data.results)) {
    results = data.results.map((item: any) => ({
      title: item.title || 'Untitled',
      content: item.content || item.description || item.snippet || '',
      url: item.url || item.link || '',
    }));
  } else if (Array.isArray(data.web_results)) {
    results = data.web_results.map((item: any) => ({
      title: item.title || 'Untitled',
      content: item.content || item.snippet || '',
      url: item.url || item.link || '',
    }));
  } else if (Array.isArray(data)) {
    results = data.map((item: any) => ({
      title: item.title || 'Untitled',
      content: item.content || item.description || '',
      url: item.url || item.link || '',
    }));
  } else {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  return formatSearchResults(results);
}

async function fetchCloudLLMAPI(endpointUrl: string, apiKey: string, query: string): Promise<string> {
  validateEndpointUrl(endpointUrl);
  // Verify Master Network Toggle is enabled
  const settings = await db.app_settings.where('key').equals('enableNetworkIntegrations').first();
  if (!settings || settings.value !== true) {
    throw new Error('Network integrations are disabled. Please enable in Settings.');
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a enterprise architecture research assistant.' },
      { role: 'user', content: query },
    ],
    temperature: 0.3,
    max_tokens: 500,
  };

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Cloud LLM API error ${response.status}: ${response.statusText} ${body}`);
  }

  const data = (await response.json().catch(() => ({}))) as CloudLLMResponse;
  if (data.choices && data.choices.length > 0) {
    const choice = data.choices[0];
    return (choice.message?.content || choice.delta?.content || '').trim();
  }

  throw new Error('Unexpected Cloud LLM API response format.');
}

async function fetchCustomEnterprise(endpointUrl: string, apiKey: string, query: string): Promise<string> {
  validateEndpointUrl(endpointUrl);
  const payload = { api_key: apiKey, query };
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Custom Enterprise error ${response.status}: ${response.statusText} ${body}`);
  }

  const data = await response.json().catch(() => ({}));
  let results: SearchResult[] = [];

  if (Array.isArray(data.results)) {
    results = data.results.map((item: any) => ({
      title: item.title || 'Untitled',
      content: item.content || item.text || item.description || '',
      url: item.url || item.link || '',
    }));
  } else if (Array.isArray(data)) {
    results = data.map((item: any) => ({
      title: item.title || 'Untitled',
      content: item.content || item.text || '',
      url: item.url || '',
    }));
  } else {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  return formatSearchResults(results);
}

export async function fetchFromProvider(
  providerType: ProviderType,
  endpointUrl: string,
  apiKey: string,
  query: string
): Promise<string> {
  validateApiKey(apiKey);
  const sanitizedQuery = sanitizeQuery(query);
  if (!sanitizedQuery) {
    throw new Error('Query is empty after sanitization.');
  }

  if (!endpointUrl || !endpointUrl.trim()) {
    throw new Error('Endpoint URL cannot be empty.');
  }

  if (providerType === 'WebSearchAPI') {
    return await fetchWebSearchAPI(endpointUrl, apiKey, sanitizedQuery);
  }

  if (providerType === 'CloudLLMAPI') {
    return await fetchCloudLLMAPI(endpointUrl, apiKey, sanitizedQuery);
  }

  if (providerType === 'CustomEnterprise') {
    return await fetchCustomEnterprise(endpointUrl, apiKey, sanitizedQuery);
  }

  throw new Error(`Unknown provider type: ${providerType}`);
}
