import { validateEndpointUrl } from './networkGuard';

// Secure Web Fetch Worker
// This utility is strictly designed to fetch external data without leaking local context.

export async function fetchWebTrends(query: string, apiKey: string, endpointUrl: string): Promise<string> {
  const sanitizedQuery = String(query).trim();

  if (!sanitizedQuery) {
    throw new Error('Search query cannot be empty.');
  }

  if (!apiKey) {
    throw new Error('Search API Key is missing.');
  }

  if (!endpointUrl || !endpointUrl.trim()) {
    throw new Error('Search endpoint URL is missing.');
  }

  validateEndpointUrl(endpointUrl);

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: sanitizedQuery,
        search_depth: 'basic',
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        max_results: 5,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Search API error: ${response.status} ${errorData.detail || response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid response format from Search API.');
    }

    const summaries = data.results.map((result: any, index: number) => {
      return `Source ${index + 1}: ${result.title}\nSummary: ${result.content}\nURL: ${result.url}\n`;
    }).join('\n');

    return summaries;
  } catch (error) {
    console.error('Web Fetch Worker Error:', error);
    throw error;
  }
}
