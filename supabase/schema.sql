create table if not exists site_content (
  id bigint primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists planner_state (
  id bigint primary key check (id = 1),
  payload jsonb not null default '{"exercises":[],"foods":[],"clients":[],"workoutTemplates":[],"foodTemplates":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists workout_sessions (
  id uuid primary key,
  client_id text not null,
  day_index integer not null,
  day_title text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  notes text not null default '',
  snapshot jsonb not null,
  results jsonb not null
);
create index if not exists workout_sessions_client_started_idx on workout_sessions(client_id, started_at desc);

create table if not exists weekly_checkins (
  id uuid primary key,
  client_id text not null,
  submitted_at timestamptz not null default now(),
  weight numeric,
  adherence integer not null check (adherence between 0 and 100),
  sleep_quality integer not null check (sleep_quality between 1 and 5),
  energy integer not null check (energy between 1 and 5),
  hunger integer not null check (hunger between 1 and 5),
  notes text not null default ''
);
create index if not exists weekly_checkins_client_submitted_idx on weekly_checkins(client_id, submitted_at desc);

create table if not exists payments (
  id uuid primary key,
  client_id text not null,
  client_name text not null,
  plan_name text not null,
  amount numeric not null,
  currency text not null default 'EGP',
  status text not null default 'paid' check (status in ('paid','pending','refunded')),
  paid_at timestamptz not null default now(),
  notes text not null default ''
);
create index if not exists payments_paid_at_idx on payments(paid_at desc);

create table if not exists reviews (
  id uuid primary key,
  name text not null,
  text text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  display_order integer,
  created_at timestamptz not null default now()
);

alter table site_content enable row level security;
alter table planner_state enable row level security;
alter table workout_sessions enable row level security;
alter table weekly_checkins enable row level security;
alter table payments enable row level security;
alter table reviews enable row level security;

insert into storage.buckets (id, name, public)
values ('coaching-uploads', 'coaching-uploads', true)
on conflict (id) do nothing;
