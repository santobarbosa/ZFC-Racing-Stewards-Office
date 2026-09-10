-- ZFC Racing Stewards Office
-- Vollständiges Supabase-Schema für gemeinsamen State, Finanzen und Realtime.
-- Dieses Skript kann wiederholt ausgeführt werden, ohne bestehende Daten zu löschen.

create extension if not exists pgcrypto;

-- Der Frontend-State wird als ein gemeinsamer JSON-Datensatz gespeichert.
create table if not exists public.zfc_app_state (
	id integer primary key check (id = 1),
	state jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now()
);

alter table public.zfc_app_state enable row level security;
alter table public.zfc_app_state replica identity full;

drop policy if exists zfc_app_state_anon_select on public.zfc_app_state;
drop policy if exists zfc_app_state_anon_insert on public.zfc_app_state;
drop policy if exists zfc_app_state_anon_update on public.zfc_app_state;
drop policy if exists zfc_app_state_anon_delete on public.zfc_app_state;

create policy zfc_app_state_anon_select
	on public.zfc_app_state for select to anon using (true);
create policy zfc_app_state_anon_insert
	on public.zfc_app_state for insert to anon with check (true);
create policy zfc_app_state_anon_update
	on public.zfc_app_state for update to anon using (true) with check (true);
create policy zfc_app_state_anon_delete
	on public.zfc_app_state for delete to anon using (true);

-- Feste ID: Das Frontend schreibt die Einstellungen immer in denselben Datensatz.
create table if not exists public.zfc_finance_settings (
	id uuid primary key default gen_random_uuid(),
	season text not null default '2026',
	starting_capital numeric(12,2) not null default 0,
	currency text not null default 'EUR',
	discord_webhook_url text,
	case_webhook_url text,
	site_url text,
	updated_at timestamptz not null default now()
);

alter table public.zfc_finance_settings add column if not exists case_webhook_url text;
alter table public.zfc_finance_settings add column if not exists site_url text;
alter table public.zfc_finance_settings enable row level security;
alter table public.zfc_finance_settings replica identity full;

drop policy if exists zfc_finance_settings_anon_select on public.zfc_finance_settings;
drop policy if exists zfc_finance_settings_anon_insert on public.zfc_finance_settings;
drop policy if exists zfc_finance_settings_anon_update on public.zfc_finance_settings;
drop policy if exists zfc_finance_settings_anon_delete on public.zfc_finance_settings;

create policy zfc_finance_settings_anon_select
	on public.zfc_finance_settings for select to anon using (true);
create policy zfc_finance_settings_anon_insert
	on public.zfc_finance_settings for insert to anon with check (true);
create policy zfc_finance_settings_anon_update
	on public.zfc_finance_settings for update to anon using (true) with check (true);
create policy zfc_finance_settings_anon_delete
	on public.zfc_finance_settings for delete to anon using (true);

insert into public.zfc_finance_settings (
	id, season, starting_capital, currency
)
values (
	'00000000-0000-0000-0000-000000000001', '2026', 0, 'EUR'
)
on conflict (id) do nothing;

create table if not exists public.zfc_finance_transactions (
	id uuid primary key default gen_random_uuid(),
	season text not null default '2026',
	team_id text,
	race text not null default '',
	transaction_date date not null default current_date,
	type text not null check (type in ('income', 'expense')),
	category text not null default 'Sonstiges',
	description text not null default '',
	amount numeric(12,2) not null check (amount >= 0),
	counterparty text not null default '',
	status text not null default 'Gebucht'
		check (status in ('Geplant', 'Gebucht', 'Storniert')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table public.zfc_finance_transactions enable row level security;
alter table public.zfc_finance_transactions replica identity full;

create index if not exists zfc_finance_transactions_season_idx
	on public.zfc_finance_transactions(season);
create index if not exists zfc_finance_transactions_date_idx
	on public.zfc_finance_transactions(transaction_date desc);

drop policy if exists zfc_finance_transactions_anon_select on public.zfc_finance_transactions;
drop policy if exists zfc_finance_transactions_anon_insert on public.zfc_finance_transactions;
drop policy if exists zfc_finance_transactions_anon_update on public.zfc_finance_transactions;
drop policy if exists zfc_finance_transactions_anon_delete on public.zfc_finance_transactions;

create policy zfc_finance_transactions_anon_select
	on public.zfc_finance_transactions for select to anon using (true);
create policy zfc_finance_transactions_anon_insert
	on public.zfc_finance_transactions for insert to anon with check (true);
create policy zfc_finance_transactions_anon_update
	on public.zfc_finance_transactions for update to anon using (true) with check (true);
create policy zfc_finance_transactions_anon_delete
	on public.zfc_finance_transactions for delete to anon using (true);

-- Explizite API-Rechte für den öffentlichen anon-Key.
grant usage on schema public to anon;
grant select, insert, update, delete on public.zfc_app_state to anon;
grant select, insert, update, delete on public.zfc_finance_settings to anon;
grant select, insert, update, delete on public.zfc_finance_transactions to anon;

-- Supabase Realtime für alle Tabellen aktivieren.
do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'zfc_app_state'
		) then
			alter publication supabase_realtime add table public.zfc_app_state;
		end if;

		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'zfc_finance_settings'
		) then
			alter publication supabase_realtime add table public.zfc_finance_settings;
		end if;

		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'zfc_finance_transactions'
		) then
			alter publication supabase_realtime add table public.zfc_finance_transactions;
		end if;
	end if;
end $$;
