-- 0004: knowledge base v2 — item-level collectibles, generic geo points, a richer knowledge graph,
-- an explicit 100% completion model and per-record evidence (provenance).

-- ───────────── New entity type: individual collectible / challenge items ─────────────
alter table entities drop constraint if exists entities_type_check;
alter table entities add constraint entities_type_check check (type in (
  'mission','character','vehicle','weapon','location','property','collectible','collectible_item',
  'random_event','activity','hobby','achievement','cheat','heist','ending','business',
  'stock','easter_egg','troubleshooting','game_mechanic','version','completion','online_boundary'));

-- ───────────── Knowledge graph: more predicates, qualified edges ─────────────
alter table relationships drop constraint if exists relationships_predicate_check;
alter table relationships add constraint relationships_predicate_check check (predicate in (
  'requires','involves','participates_in','takes_place_at','located_in','located_at','found_at',
  'owns','given_by','part_of','setup_for','unlocks','next','related_to','rewards','drives',
  -- v2
  'available_to','starts_at','instance_of','contributes_to','hookup_with','family_of','friend_of',
  'appears_in','required_for','sells','lives_at','enemy_of','works_for'));
-- Edge qualifiers ("only after mission X", "between 8pm and 6am"...), and how sure we are about the edge itself.
alter table relationships add column props jsonb not null default '{}'::jsonb;
alter table relationships add column knowledge_status text not null default 'curated'
  check (knowledge_status in ('verified','curated','unverified'));
create index relationships_predicate_idx on relationships (predicate, to_id);

-- ───────────── Geo points: any entity can have a position (items, homes, mission starts, spawns) ─────────────
-- precision: verified (≥2 agreeing coordinate sources) · community (one community-measured coordinate dataset)
--            approximate (hand-placed) · area (only the named area is known)
create table geo_points (
  entity_id   text primary key references entities(id) on delete cascade,
  game_x      real,
  game_y      real,
  game_z      real,
  map_x       real check (map_x between 0 and 1),
  map_y       real check (map_y between 0 and 1),
  precision   text not null check (precision in ('verified','community','approximate','area')),
  area        text,
  region      text,
  coord_source text,
  details     jsonb not null default '{}'::jsonb
);
create index geo_points_xy_idx on geo_points (game_x, game_y);
create index geo_points_area_idx on geo_points (lower(area));
alter table locations drop constraint if exists locations_coord_precision_check;
alter table locations add constraint locations_coord_precision_check check (coord_precision in ('approximate','verified','unknown','community','area'));

-- ───────────── Item-level collectibles and challenges ─────────────
create table collectible_items (
  entity_id      text primary key references entities(id) on delete cascade,
  category_id    text not null references entities(id) on delete cascade,  -- e.g. collectible:letter-scraps
  kind           text not null,                                             -- e.g. "Letter Scrap"
  number         integer,                                                   -- position in the source's list (not an official in-game index)
  area           text,
  region         text,
  counts_for_100 boolean,
  protagonists   text[] not null default '{}',
  details        jsonb not null default '{}'::jsonb
);
create index collectible_items_category_idx on collectible_items (category_id, number);
create index collectible_items_area_idx on collectible_items (lower(area));

-- ───────────── 100% completion model ─────────────
create table completion_requirements (
  id             text primary key,
  category       text not null check (category in ('missions','strangers_and_freaks','hobbies_and_pastimes','random_events','miscellaneous','not_required')),
  label          text not null,
  required_count integer,            -- how many are needed for 100% (null = all / not countable)
  total_count    integer,            -- how many exist (may differ by version)
  protagonists   text[] not null default '{}',
  target_ids     text[] not null default '{}',   -- entities this requirement is about
  source_id      text references sources(id),
  source_url     text,
  knowledge_status text not null default 'curated' check (knowledge_status in ('verified','curated','unverified')),
  notes          text,
  position       integer not null default 0
);
create index completion_requirements_category_idx on completion_requirements (category, position);

-- ───────────── Evidence (provenance per record / section) ─────────────
create table evidence (
  id           bigserial primary key,
  entity_id    text not null references entities(id) on delete cascade,
  section      text not null default 'overview',
  source_id    text not null references sources(id),
  url          text not null,
  title        text,
  retrieved_at date,
  license      text,
  excerpt      text,
  knowledge_status text not null default 'curated' check (knowledge_status in ('verified','curated','unverified')),
  confidence   real not null default 0.8
);
create index evidence_entity_idx on evidence (entity_id);
alter table documents add column source_title text;
alter table sources add column license text;
alter table chunks add column source_title text;

alter table geo_points enable row level security;
alter table collectible_items enable row level security;
alter table completion_requirements enable row level security;
alter table evidence enable row level security;
