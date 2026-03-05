// Open Brain — Capture Memory Edge Function
// Deployed to Supabase Edge Functions
// POST { text: string, source?: string }
// → generates embedding + extracts metadata → stores in brain_memories

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { text, source = "manual" } = await req.json();
  if (!text) return new Response("text is required", { status: 400 });

  // Run embedding + metadata extraction in parallel
  const [embedding, metadata] = await Promise.all([
    generateEmbedding(text),
    extractMetadata(text),
  ]);

  const { data, error } = await supabase
    .schema("brain")
    .from("memories")
    .insert({
      text,
      embedding,
      type: metadata.type,
      topics: metadata.topics,
      people: metadata.people,
      action_items: metadata.action_items,
      source,
    })
    .select("id, type, topics, people, action_items")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      stored: true,
      id: data.id,
      type: data.type,
      topics: data.topics,
      people: data.people,
      action_items: data.action_items,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const json = await res.json();
  return json.data[0].embedding;
}

async function extractMetadata(text: string): Promise<{
  type: string;
  topics: string[];
  people: string[];
  action_items: string[];
}> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Extract metadata from this note. Reply with valid JSON only, no explanation.

Note: "${text}"

JSON schema:
{
  "type": "insight|decision|person|meeting|idea|finance|business|task",
  "topics": ["topic1", "topic2"],
  "people": ["name1", "name2"],
  "action_items": ["action1"]
}`,
        },
      ],
    }),
  });
  const json = await res.json();
  try {
    const raw = json.content[0].text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(raw);
  } catch {
    return { type: "idea", topics: [], people: [], action_items: [] };
  }
}
