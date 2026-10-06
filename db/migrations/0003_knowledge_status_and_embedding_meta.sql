-- 0003: per-chunk knowledge status, embedding provenance, vehicle/weapon availability.

-- Every chunk states how trustworthy it is. 'unverified' content must never be presented as confirmed fact.
alter table chunks add column knowledge_status text not null default 'curated'
  check (knowledge_status in ('verified','curated','unverified'));
create index chunks_status_idx on chunks (knowledge_status);

-- The database must know which embedding model produced each vector (never compare vectors across models).
alter table chunks add column embedding_provider  text;
alter table chunks add column embedding_dimension integer;

create table kb_meta (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table kb_meta enable row level security;

-- Story-Mode availability (strict four-state enum) for vehicles and weapons.
alter table vehicles add column availability text not null default 'UNKNOWN'
  check (availability in ('STORY_MODE','ONLINE_ONLY','BOTH','UNKNOWN'));
alter table weapons  add column availability text not null default 'UNKNOWN'
  check (availability in ('STORY_MODE','ONLINE_ONLY','BOTH','UNKNOWN'));
