-- Run this first in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists groups (
  id           bigint generated always as identity primary key,
  code         text not null unique,          -- 'SK 1', 'UK 1', 'NEW'
  leader_name  text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists yuvaks (
  id           bigint generated always as identity primary key,
  group_id     bigint references groups(id) on delete set null,
  serial_no    int,
  form_id      text,
  name         text not null,
  birth_date   text,
  address      text,
  mobile       text,
  whatsapp     text,
  home_phone   text,
  education    text,
  remarks      text,
  source       text not null default 'excel' check (source in ('excel', 'added')),
  created_at   timestamptz not null default now()
);
create index if not exists yuvaks_group_idx on yuvaks(group_id);

-- One row = that yuvak was PRESENT on that sabha date. No row = absent.
create table if not exists attendance (
  id           bigint generated always as identity primary key,
  session_date date   not null,
  yuvak_id     bigint not null references yuvaks(id) on delete cascade,
  marked_at    timestamptz not null default now(),
  unique (session_date, yuvak_id)
);
create index if not exists attendance_date_idx on attendance(session_date);

-- Key/value app settings. 'sabha_day' = the weekday of the weekly sabha (default friday).
create table if not exists settings (
  key    text primary key,
  value  text not null
);
insert into settings (key, value) values ('sabha_day', 'friday')
on conflict (key) do nothing;
insert into settings (key, value) values ('date_mode', 'auto')
on conflict (key) do nothing;
insert into settings (key, value) values ('manual_date', '')
on conflict (key) do nothing;

-- The app talks to Supabase with the SERVICE ROLE key on the server only.
-- Enabling RLS with no public policies means the anon key cannot read or write anything.
alter table groups     enable row level security;
alter table yuvaks     enable row level security;
alter table attendance enable row level security;
alter table settings   enable row level security;
