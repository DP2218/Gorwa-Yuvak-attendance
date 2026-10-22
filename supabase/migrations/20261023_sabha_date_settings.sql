-- Migration: Extend settings with date_mode and manual_date defaults
-- Note: The settings table uses a key-value store (key text primary key, value text not null).
-- New keys are stored without modifying the table schema.

insert into settings (key, value)
values ('date_mode', 'auto')
on conflict (key) do nothing;

insert into settings (key, value)
values ('manual_date', '')
on conflict (key) do nothing;
