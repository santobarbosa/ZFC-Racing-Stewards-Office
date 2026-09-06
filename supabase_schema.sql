-- ZFC Racing: finance, realtime sync and Discord integration
create extension if not exists pgcrypto;

create table if not exists public.zfc_app_state (
  id integer primary key check (id = 1),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.zfc_app_state enable row level security;
drop policy if exists zfc_app_state_anon on public.zfc_app_state;
create policy zfc_app_state_anon on public.zfc_app_state
  for all to anon using (true) with check (true);
alter table public.zfc_app_state replica identity full;

create table if not exists public.zfc_finance_settings (
  id uuid primary key default gen_random_uuid(),
  season text not null default '2026',
  starting_capital numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  discord_webhook_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.zfc_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  season text not null default '2026',
  race text not null default '',
  transaction_date date not null default current_date,
  type text not null check (type in ('income', 'expense')),
  category text not null default 'Sonstiges',
  description text not null default '',
  amount numeric(12,2) not null check (amount >= 0),
  counterparty text not null default '',
  status text not null default 'Gebucht' check (status in ('Geplant', 'Gebucht', 'Storniert')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zfc_finance_transactions_season_idx
  on public.zfc_finance_transactions(season);
create index if not exists zfc_finance_transactions_date_idx
  on public.zfc_finance_transactions(transaction_date desc);

alter table public.zfc_finance_settings enable row level security;
alter table public.zfc_finance_transactions enable row level security;

-- Replace these policies with authenticated-team policies before production use.
drop policy if exists zfc_finance_settings_anon on public.zfc_finance_settings;
create policy zfc_finance_settings_anon on public.zfc_finance_settings
  for all to anon using (true) with check (true);
drop policy if exists zfc_finance_transactions_anon on public.zfc_finance_transactions;
create policy zfc_finance_transactions_anon on public.zfc_finance_transactions
  for all to anon using (true) with check (true);

insert into public.zfc_finance_settings (season)
select '2026'
where not exists (select 1 from public.zfc_finance_settings);

alter table public.zfc_finance_settings replica identity full;
alter table public.zfc_finance_transactions replica identity full;

-- In Supabase Dashboard: Database > Replication > enable these tables for realtime.
-- Also enable public.zfc_app_state for realtime. The app stores the complete
-- editable ZFC state in its single row so all modules stay synchronized.
