import { SuggestionCard } from '@/types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function fetchSuggestions(
  apiKey: string,
  transcript: string,
  salesScript: string
): Promise<SuggestionCard[]> {
  if (!apiKey || !transcript.trim()) return [];

  const last500Words = transcript.split(/\s+/).slice(-500).join(' ');

  const systemPrompt = `You are a real-time sales coach assistant. The user is on a live sales call. Given the transcript below and the sales context, return exactly 3 suggestion cards as a JSON array. Each card has: { type: 'response' | 'objection' | 'insight', title: string (max 5 words), body: string (max 2 sentences) }. Be concise and actionable. Return only valid JSON, no markdown.`;

  const userMessage = `Sales Context:\n${salesScript || 'No script provided.'}\n\nLive Transcript (last 500 words):\n${last500Words}`;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  // Extract JSON from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in response');
  
  return JSON.parse(jsonMatch[0]) as SuggestionCard[];
}
