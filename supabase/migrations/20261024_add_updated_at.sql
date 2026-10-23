-- Migration: Add updated_at column to groups and yuvaks tables
alter table groups add column if not exists updated_at timestamptz not null default now();
alter table yuvaks add column if not exists updated_at timestamptz not null default now();

-- Trigger function to update updated_at timestamp on row modification
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists groups_updated_at_trg on groups;
create trigger groups_updated_at_trg
  before update on groups
  for each row execute function update_updated_at_column();

drop trigger if exists yuvaks_updated_at_trg on yuvaks;
create trigger yuvaks_updated_at_trg
  before update on yuvaks
  for each row execute function update_updated_at_column();
