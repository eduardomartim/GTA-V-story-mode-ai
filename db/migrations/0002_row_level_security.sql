-- 0002_row_level_security: the application connects server-side with a direct Postgres role.
-- Enabling RLS (with no policies) means that, on Supabase, the auto-generated PostgREST/anon API
-- can NOT read or write these tables; only the table owner / service connection can.
alter table sources          enable row level security;
alter table entities         enable row level security;
alter table missions         enable row level security;
alter table characters       enable row level security;
alter table locations        enable row level security;
alter table vehicles         enable row level security;
alter table weapons          enable row level security;
alter table collectibles     enable row level security;
alter table properties       enable row level security;
alter table activities       enable row level security;
alter table random_events    enable row level security;
alter table heists           enable row level security;
alter table endings          enable row level security;
alter table aliases          enable row level security;
alter table relationships    enable row level security;
alter table documents        enable row level security;
alter table chunks           enable row level security;
alter table assets           enable row level security;
alter table kb_backlog       enable row level security;
