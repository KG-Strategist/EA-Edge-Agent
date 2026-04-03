// Secure Web Fetch Worker
// This utility is strictly designed to fetch external data without leaking local context.

export async function fetchWebTrends(query: string, apiKey: string): Promise<string> {
  // SECURITY RULE: Explicitly strip any local state or context.
  // We ONLY use the provided 'query' string.
  const sanitizedQuery = String(query).trim();

  if (!sanitizedQuery) {
    throw new Error('Search query cannot be empty.');
  }

  if (!apiKey) {
    throw new Error('Search API Key is missing.');
  }

  try {
    // Using Tavily API as the search provider
    const response = await fetch('https://api.tavily.com/search', {
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
    
    // Extract and format the top 5 articles/summaries
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
