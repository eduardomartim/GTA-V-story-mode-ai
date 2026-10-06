-- 0001_init: core schema for the GTA V Story Mode knowledge base.
-- Requires: pgvector (vector), pg_trgm. Works on Supabase, plain Postgres 15+, and PGlite.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ───────────── Sources (provenance registry) ─────────────
create table sources (
  id          text primary key check (id ~ '^[a-z0-9-]+$'),
  name        text not null,
  base_url    text not null,
  source_type text not null check (source_type in ('official','official-support','wiki','guide','community')),
  authority   smallint not null check (authority between 1 and 10),  -- 10 = Rockstar, lower = weaker
  notes       text
);

-- ───────────── Entities (one row per knowledge entity) ─────────────
create table entities (
  id            text primary key check (id ~ '^[a-z_]+:[a-z0-9-]+$'),
  type          text not null check (type in (
                  'mission','character','vehicle','weapon','location','property','collectible',
                  'random_event','activity','hobby','achievement','cheat','heist','ending','business',
                  'stock','easter_egg','troubleshooting','game_mechanic','version','completion','online_boundary')),
  name          text not null,
  summary       text not null,
  story_mode    boolean not null default true,
  online_only   boolean not null default false,
  spoiler_level smallint not null default 0 check (spoiler_level between 0 and 3),
  versions      text[] not null default '{}',
  verification  text not null default 'curated' check (verification in ('verified','curated','unverified')),
  confidence    real not null default 0.8 check (confidence between 0 and 1),
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  -- an entity can never be both Story Mode content and Online-only content
  constraint story_xor_online check (not (online_only and story_mode))
);
create index entities_type_idx on entities (type);
create index entities_name_trgm on entities using gin (name gin_trgm_ops);
create index entities_flags_idx on entities (story_mode, online_only);

-- ───────────── Typed detail tables (structured filters / SQL lookups) ─────────────
create table missions (
  entity_id    text primary key references entities(id) on delete cascade,
  mission_type text not null check (mission_type in ('prologue','main','heist','heist_setup','heist_finale','assassination','stranger','ending','side')),
  protagonists text[] not null default '{}',
  giver        text,
  sequence     integer,
  missable     boolean,
  counts_for_completion boolean,
  details      jsonb not null default '{}'::jsonb
);
create index missions_protagonists_idx on missions using gin (protagonists);
create index missions_giver_idx on missions (giver);

create table characters (
  entity_id text primary key references entities(id) on delete cascade,
  role      text,
  playable  boolean not null default false,
  details   jsonb not null default '{}'::jsonb
);

create table locations (
  entity_id       text primary key references entities(id) on delete cascade,
  region          text,
  district        text,
  game_x          real,
  game_y          real,
  game_z          real,
  map_x           real check (map_x between 0 and 1),
  map_y           real check (map_y between 0 and 1),
  coord_precision text not null default 'approximate' check (coord_precision in ('approximate','verified','unknown')),
  map_image       text,
  external_map_url text,
  details         jsonb not null default '{}'::jsonb
);

create table vehicles (
  entity_id  text primary key references entities(id) on delete cascade,
  category   text,
  manufacturer text,
  vehicle_class text,
  story_mode_available boolean not null default true,
  details    jsonb not null default '{}'::jsonb
);

create table weapons (
  entity_id text primary key references entities(id) on delete cascade,
  category  text,
  details   jsonb not null default '{}'::jsonb
);

create table collectibles (
  entity_id text primary key references entities(id) on delete cascade,
  kind      text not null,
  total     integer,
  counts_for_100 boolean,
  details   jsonb not null default '{}'::jsonb
);

create table properties (
  entity_id text primary key references entities(id) on delete cascade,
  details   jsonb not null default '{}'::jsonb
);
create table activities (
  entity_id text primary key references entities(id) on delete cascade,
  counts_for_100 boolean,
  details   jsonb not null default '{}'::jsonb
);
create table random_events (
  entity_id text primary key references entities(id) on delete cascade,
  counts_for_100 boolean,
  details   jsonb not null default '{}'::jsonb
);
create table heists (
  entity_id text primary key references entities(id) on delete cascade,
  approaches text[] not null default '{}',
  details   jsonb not null default '{}'::jsonb
);
create table endings (
  entity_id text primary key references entities(id) on delete cascade,
  details   jsonb not null default '{}'::jsonb
);

-- ───────────── Aliases (PT/EN, nicknames) ─────────────
create table aliases (
  id          bigserial primary key,
  entity_id   text not null references entities(id) on delete cascade,
  alias       text not null,
  alias_norm  text not null,      -- lowercase, accent-free
  lang        text not null default 'any',
  unique (entity_id, alias_norm)
);
create index aliases_norm_idx on aliases (alias_norm);
create index aliases_norm_trgm on aliases using gin (alias_norm gin_trgm_ops);

-- ───────────── Relationships (knowledge graph, light) ─────────────
create table relationships (
  from_id   text not null references entities(id) on delete cascade,
  predicate text not null check (predicate in (
              'requires','involves','participates_in','takes_place_at','located_in','located_at','found_at',
              'owns','given_by','part_of','setup_for','unlocks','next','related_to','rewards','drives')),
  to_id     text not null references entities(id) on delete cascade,
  source_id text references sources(id),
  primary key (from_id, predicate, to_id)
);
create index relationships_to_idx on relationships (to_id, predicate);

-- ───────────── Documents + chunks (RAG corpus) ─────────────
create table documents (
  id         bigserial primary key,
  entity_id  text not null references entities(id) on delete cascade,
  title      text not null,
  source_id  text not null references sources(id),
  source_url text not null,
  source_date date,
  retrieved_at timestamptz,
  confidence real not null default 0.8,
  content_hash text not null,
  created_at timestamptz not null default now()
);
create index documents_entity_idx on documents (entity_id);

create table chunks (
  id           bigserial primary key,
  document_id  bigint not null references documents(id) on delete cascade,
  entity_id    text not null references entities(id) on delete cascade,
  entity_type  text not null,
  content_type text not null default 'overview',  -- overview | requirements | walkthrough | reward | location | ...
  content      text not null,
  search_text  text not null,                      -- accent-free text used for FTS
  tsv          tsvector generated always as (to_tsvector('simple', search_text)) stored,
  embedding    vector(384),                        -- pre-computed at ingest time, never per request
  embedding_model text,
  source_id    text not null references sources(id),
  source_url   text not null,
  confidence   real not null default 0.8,
  story_mode   boolean not null default true,
  online_only  boolean not null default false,
  spoiler_level smallint not null default 0,
  versions     text[] not null default '{}',
  position     integer not null default 0
);
create index chunks_tsv_idx on chunks using gin (tsv);
create index chunks_entity_idx on chunks (entity_id);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

-- ───────────── Assets (images / maps) ─────────────
create table assets (
  id            text primary key,
  title         text not null,
  asset_type    text not null check (asset_type in ('character','vehicle','weapon','location','map','mission','collectible','diagram')),
  url           text not null,
  thumbnail_url text,
  source        text not null,
  source_url    text,
  entity_type   text,
  entity_id     text references entities(id) on delete cascade,
  license       text not null,
  attribution   text
);
create index assets_entity_idx on assets (entity_id);

-- ───────────── Knowledge backlog (things we refuse to invent) ─────────────
create table kb_backlog (
  id        bigserial primary key,
  topic     text not null,
  entity_id text,
  note      text not null,
  status    text not null default 'todo' check (status in ('todo','in_progress','done'))
);
