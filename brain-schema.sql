-- Open Brain — Supabase Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Creates a separate 'brain' schema — does NOT touch your existing public.leads or public.orders tables

-- Step 1: Create dedicated schema
create schema if not exists brain;

-- Step 2: Enable pgvector extension (if not already enabled)
create extension if not exists vector;

-- Step 3: Create brain_memories table inside the brain schema
create table if not exists brain.memories (
  id           bigint generated always as identity primary key,
  text         text not null,
  embedding    vector(1536),
  type         text,           -- 'insight' | 'decision' | 'person' | 'meeting' | 'idea' | 'finance' | 'business'
  topics       text[],
  people       text[],
  action_items text[],
  source       text,           -- 'claude-code' | 'migration' | 'clickup-sync' | 'manual'
  created_at   timestamptz default now()
);

-- Step 4: Index for fast similarity search
create index if not exists memories_embedding_idx
  on brain.memories using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Step 5: Similarity search function (lives in the brain schema)
create or replace function brain.search_memories(
  query_embedding vector(1536),
  match_count     int default 5,
  min_similarity  float default 0.3
)
returns table (
  id           bigint,
  text         text,
  type         text,
  topics       text[],
  people       text[],
  action_items text[],
  created_at   timestamptz,
  similarity   float
)
language sql stable as $$
  select
    id,
    text,
    type,
    topics,
    people,
    action_items,
    created_at,
    1 - (embedding <=> query_embedding) as similarity
  from brain.memories
  where 1 - (embedding <=> query_embedding) > min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Step 6: Grant access to the service role and anon key
grant usage on schema brain to anon, authenticated, service_role;
grant all on brain.memories to service_role;
grant select on brain.memories to anon, authenticated;
grant execute on function brain.search_memories to anon, authenticated, service_role;

-- Step 7: Verify (run these after to confirm it worked)
-- select schema_name from information_schema.schemata where schema_name = 'brain';
-- select count(*) from brain.memories;
