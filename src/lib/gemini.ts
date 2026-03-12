import { SuggestionCard } from '@/types';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// Track which key index to use next
let currentKeyIndex = 0;

function getNextApiKey(keys: string[]): string | null {
  if (!keys.length) return null;
  const key = keys[currentKeyIndex % keys.length];
  return key;
}

function cycleToNextKey(keys: string[]) {
  if (keys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  }
}

export async function fetchSuggestions(
  apiKeyOrKeys: string | string[],
  transcript: string,
  salesScript: string
): Promise<SuggestionCard[]> {
  // Normalize to array
  const keys = Array.isArray(apiKeyOrKeys) 
    ? apiKeyOrKeys.filter(k => k.trim()) 
    : [apiKeyOrKeys].filter(k => k.trim());
  
  if (!keys.length || !transcript.trim()) return [];

  const last300Words = transcript.split(/\s+/).slice(-300).join(' ');

  const systemPrompt = `You are a real-time sales coach. Return exactly 3 JSON suggestion cards: [{ "type": "response"|"objection"|"insight", "title": "max 5 words", "body": "max 1 sentence" }]. Be extremely concise. JSON only, no markdown.`;

  const userMessage = `Context:\n${salesScript || 'None'}\n\nTranscript:\n${last300Words}`;

  // Try keys in order, cycling on failure
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const apiKey = getNextApiKey(keys);
    if (!apiKey) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.0-flash-lite',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.5,
          max_tokens: 300,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429 || res.status === 403) {
        // Rate limited or quota exhausted – cycle to next key
        cycleToNextKey(keys);
        lastError = new Error(`Key exhausted (${res.status})`);
        continue;
      }

      if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array in response');
      
      return JSON.parse(jsonMatch[0]) as SuggestionCard[];
    } catch (e) {
      clearTimeout(timeout);
      lastError = e as Error;
      cycleToNextKey(keys);
    }
  }

  throw lastError || new Error('No API keys available');
}
