-- Zero-Trust Dev UI - initial schema.
-- Apply with:  psql "$DATABASE_URL_UNPOOLED" -f migrations/0001_init.sql
-- Use the UNPOOLED url for DDL; the pooled one for app traffic.

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists vector;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  name text,
  role text not null check (role in ('admin','reviewer','developer')),
  created_at timestamptz not null default now()
);

create table if not exists repositories (
  id uuid primary key default gen_random_uuid(),
  github_repo_id bigint unique not null,
  full_name text not null,
  installation_id bigint not null,
  default_base_branch text not null default 'dev',
  index_commit_sha text,
  created_at timestamptz not null default now()
);

create table if not exists path_classifications (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories on delete cascade,
  path_glob text not null,
  label text not null check (label in ('PUBLIC','INTERNAL','RESTRICTED','SECRET')),
  unique (repo_id, path_glob)
);

create table if not exists user_stories (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories on delete cascade,
  key text not null,
  title text not null,
  developer_brief text,
  internal_notes text,
  acceptance_criteria jsonb not null default '[]',
  base_branch text not null default 'dev',
  feature_branch text,
  status text not null default 'draft' check (status in
    ('draft','assigned','in_progress','submitted','in_review','merged','cancelled')),
  assignee_id uuid references users,
  created_by uuid references users,
  created_at timestamptz not null default now(),
  unique (repo_id, key)
);

create table if not exists story_scopes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references user_stories on delete cascade,
  path_glob text not null,
  access_level text not null check (access_level in ('read','write')),
  created_by uuid references users,
  created_at timestamptz not null default now(),
  unique (story_id, path_glob)
);

create table if not exists dev_sessions (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references users,
  story_id uuid not null references user_stories on delete cascade,
  feature_branch text not null,
  head_sha text,
  status text not null default 'active'
    check (status in ('active','stale','revoked','closed')),
  byok_provider text,
  byok_key_ref text,
  token_spend_usd numeric(10,4) not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists dev_sessions_dev_status on dev_sessions (developer_id, status);

create table if not exists access_elevations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references dev_sessions on delete cascade,
  path_glob text not null,
  access_level text not null check (access_level in ('read','write')),
  reason text not null,
  requested_by uuid references users,
  approved_by uuid references users,
  status text not null default 'pending'
    check (status in ('pending','approved','denied','expired','revoked')),
  granted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists code_files (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories on delete cascade,
  path text not null,
  language text,
  content_hash text not null,
  label text not null default 'INTERNAL',
  indexed_at timestamptz not null default now(),
  unique (repo_id, path)
);

create table if not exists code_symbols (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references code_files on delete cascade,
  kind text not null,
  name text not null,
  qualified_name text not null,
  signature text,
  start_line int,
  end_line int,
  is_exported boolean not null default false
);
create index if not exists code_symbols_file on code_symbols (file_id);

create table if not exists code_edges (
  id bigserial primary key,
  repo_id uuid not null references repositories on delete cascade,
  src_file_id uuid references code_files on delete cascade,
  dst_file_id uuid references code_files on delete cascade,
  kind text not null
);
create index if not exists code_edges_src on code_edges (repo_id, src_file_id);

create table if not exists kb_documents (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories on delete cascade,
  title text not null,
  doc_type text not null,
  label text not null default 'INTERNAL',
  object_key text,
  uploaded_by uuid references users,
  created_at timestamptz not null default now()
);

create table if not exists story_kb_links (
  story_id uuid not null references user_stories on delete cascade,
  document_id uuid not null references kb_documents on delete cascade,
  primary key (story_id, document_id)
);

create table if not exists kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents on delete cascade,
  repo_id uuid not null,
  label text not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1024)
);

create table if not exists global_rules (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories on delete cascade,
  version int not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  session_id uuid,
  story_id uuid,
  action text not null,
  target text,
  outcome text not null,
  detail jsonb not null default '{}',
  prev_hash text,
  hash text not null
);
create index if not exists audit_events_session on audit_events (session_id, at desc);

create table if not exists ai_interactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references dev_sessions on delete cascade,
  route text not null,
  provider text,
  model text,
  system_prompt_hash text not null,
  user_instruction text not null,
  context_manifest jsonb not null,
  raw_response text,
  sanitizer_verdict jsonb not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4),
  created_at timestamptz not null default now()
);

-- Row-level security: defense against our own bugs. See docs/DEPLOYMENT.md.
alter table kb_chunks enable row level security;
drop policy if exists kb_chunks_session_read on kb_chunks;
create policy kb_chunks_session_read on kb_chunks for select using (
  document_id in (
    select l.document_id
    from story_kb_links l
    join dev_sessions s on s.story_id = l.story_id
    where s.id = nullif(current_setting('app.session_id', true), '')::uuid
      and s.status = 'active'
      and s.expires_at > now()
  )
  and label <> 'SECRET'
);
