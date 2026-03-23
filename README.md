# Open Brain — Universal AI Memory Layer

> Build a shared memory system so Claude, ChatGPT, and Cursor all remember the same things.
> Powered by Supabase pgvector + MCP.

---

## Files — Click to Copy

| File | What it does |
|---|---|
| [`brain-schema.sql`](https://github.com/saafir-coder/open-brain/blob/main/brain-schema.sql) | Run this in Supabase SQL Editor |
| [`supabase-function/index.ts`](https://github.com/saafir-coder/open-brain/blob/main/supabase-function/index.ts) | Deploy this as a Supabase Edge Function |
| [`.env.example`](https://github.com/saafir-coder/open-brain/blob/main/.env.example) | Copy to `.env` and fill in your keys |

> Open any file → click the **copy icon** (top right of the code block) to copy the full code.

---

## What You're Building

One Supabase database stores all your memories as vector embeddings.
Every AI tool you use connects to the same brain — they all search and store to the same place.

```
Claude Code  ─┐
ChatGPT      ─┼──► Supabase pgvector (brain.memories) ◄── MCP Server
Cursor       ─┘
```

---

## Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  Any AI Tool │────►│  Supabase Edge Func  │────►│   Supabase   │
│  (via MCP)   │     │  capture-memory      │     │   pgvector   │
└─────────────┘     └──────────────────────┘     └──────────────┘
                           │         │
                    ┌──────┘         └──────┐
                    ▼                       ▼
             ┌────────────┐         ┌─────────────┐
             │  OpenAI    │         │  Claude      │
             │  Embeddings│         │  Haiku       │
             │  (1536-dim)│         │  (metadata)  │
             └────────────┘         └─────────────┘
```

- **Supabase + pgvector** — Vector database for semantic memory storage
- **Edge Function** — Serverless endpoint for storing and searching memories
- **OpenAI** — Generates 1536-dimension embeddings for similarity search
- **Claude Haiku** — Extracts metadata (type, topics, people, action items)
- **MCP** — Lets any AI tool (Claude, ChatGPT, Cursor) query the same brain

---

## Prerequisites

- [Supabase](https://supabase.com) account (free tier works)
- [OpenAI](https://platform.openai.com) API key (for embeddings)
- [Anthropic](https://console.anthropic.com) API key (for metadata extraction)
- [Node.js](https://nodejs.org) 18+ installed

---

## Step 1 — Create Your Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Save your **Project URL** and **anon key** (Settings → API)
3. Save your **service_role key** (Settings → API → service_role — keep this secret)

---

## Step 2 — Run the Database Schema

1. In your Supabase dashboard → **SQL Editor** → **New query**
2. Paste the contents of `brain-schema.sql`
3. Click **Run**

This creates:
- `brain` schema (separate from your other data)
- `brain.memories` table with pgvector support
- `brain.search_memories()` similarity search function

---

## Step 3 — Deploy the Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project (get project ref from dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Set environment variables on the function
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Deploy
supabase functions deploy capture-memory --no-verify-jwt
```

The function endpoint will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/capture-memory
```

---

## Step 4 — Set Up the MCP Server for Claude

Add this to your Claude MCP settings (`~/.claude/settings.json` or Claude Desktop config):

```json
{
  "mcpServers": {
    "open-brain": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "SUPABASE_URL": "https://YOUR_PROJECT_REF.supabase.co",
        "SUPABASE_ANON_KEY": "your-anon-key",
        "CAPTURE_ENDPOINT": "https://YOUR_PROJECT_REF.supabase.co/functions/v1/capture-memory"
      }
    }
  }
}
```

Or use the custom MCP server in `mcp-server/` (see that folder's README).

---

## Step 5 — Test It

```bash
# Store a memory
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/capture-memory \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "I prefer TypeScript over Python for backend services", "source": "manual"}'

# Search memories (via SQL Editor)
select * from brain.search_memories(
  (select embedding from brain.memories limit 1),
  5,
  0.3
);
```

---

## API Reference

### POST `/functions/v1/capture-memory` — Store a memory

Embeds the text, extracts metadata, and stores it in the brain.

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/capture-memory \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The deploy pipeline uses GitHub Actions with a staging step",
    "source": "claude-code",
    "metadata": { "project": "open-brain" }
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | The memory content to store |
| `source` | string | No | Where this memory came from (e.g. `manual`, `claude-code`, `chatgpt`) |
| `metadata` | object | No | Additional key-value pairs to store alongside the memory |

**Response:** `201 Created` with the stored memory object.

### GET `/functions/v1/capture-memory?q=QUERY` — Recall memories

Searches stored memories by semantic similarity.

```bash
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/capture-memory?q=deploy+pipeline" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Natural language search query |
| `limit` | number | 5 | Max results to return |
| `threshold` | number | 0.3 | Minimum similarity score (0-1) |

**Response:** Array of matching memories sorted by similarity score.

### SQL — Direct similarity search

If querying Supabase directly (e.g. from an Edge Function or client):

```sql
SELECT * FROM brain.search_memories(
  '<embedding_vector>',  -- 1536-dim vector
  5,                     -- limit
  0.3                    -- similarity threshold
);
```

---

## File Structure

```
├── README.md                    ← this file
├── brain-schema.sql             ← run in Supabase SQL editor
├── supabase-function/
│   └── index.ts                 ← deploy as Supabase Edge Function
└── .env.example                 ← copy to .env and fill in your keys
```

---

## Environment Variables

See `.env.example` for all required variables.

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API (secret) |
| `OPENAI_API_KEY` | platform.openai.com → API Keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

---

## How It Works

1. You send a text note to the edge function
2. OpenAI generates a 1536-dimension vector embedding
3. Claude Haiku extracts metadata (type, topics, people, action items)
4. Everything stores in `brain.memories` in Supabase
5. Any AI tool with MCP access can similarity-search your memories

---

## License

MIT

---

## Questions?

Drop a comment on the YouTube video or open an issue on GitHub.
