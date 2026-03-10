import { SuggestionCard } from '@/types';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export async function fetchSuggestions(
  apiKey: string,
  transcript: string,
  salesScript: string
): Promise<SuggestionCard[]> {
  if (!apiKey || !transcript.trim()) return [];

  // Use only last 300 words for speed
  const last300Words = transcript.split(/\s+/).slice(-300).join(' ');

  const systemPrompt = `You are a real-time sales coach. Return exactly 3 JSON suggestion cards: [{ "type": "response"|"objection"|"insight", "title": "max 5 words", "body": "max 1 sentence" }]. Be extremely concise. JSON only, no markdown.`;

  const userMessage = `Context:\n${salesScript || 'None'}\n\nTranscript:\n${last300Words}`;

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

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    
    return JSON.parse(jsonMatch[0]) as SuggestionCard[];
  } finally {
    clearTimeout(timeout);
  }
}
