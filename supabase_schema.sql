-- ZFC Racing Stewards Office
-- Vollständiges Supabase-Schema für gemeinsamen State, Finanzen und Realtime.
-- Dieses Skript kann wiederholt ausgeführt werden, ohne bestehende Daten zu löschen.

create extension if not exists pgcrypto;

-- Rollenprofil: neue Konten starten mit den geringsten Rechten.
create table if not exists public.zfc_user_profiles (
	id uuid primary key references auth.users(id) on delete cascade,
	email text not null default '',
	display_name text not null default '',
	position text not null default 'Steward',
	access_tier smallint not null default 1 check (access_tier between 1 and 3),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Dieses Konto erhält beim Anlegen automatisch die Administratorrolle.

alter table public.zfc_user_profiles enable row level security;

create or replace function public.zfc_current_tier()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
	select coalesce((select access_tier from public.zfc_user_profiles where id = auth.uid()), 0)::smallint;
$$;

revoke all on function public.zfc_current_tier() from public, anon;
grant execute on function public.zfc_current_tier() to authenticated;

create or replace function public.zfc_create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.zfc_user_profiles (id, email, display_name, position, access_tier)
	values (
		new.id,
		coalesce(new.email, ''),
		coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1)),
		case when lower(coalesce(new.email, '')) = lower('s.barbosa.galaxy@gmail.com') then 'Administrator' else 'Steward' end,
		case when lower(coalesce(new.email, '')) = lower('s.barbosa.galaxy@gmail.com') then 3 else 1 end
	)
	on conflict (id) do update set email = excluded.email;
	return new;
end;
$$;

drop trigger if exists zfc_create_user_profile on auth.users;
create trigger zfc_create_user_profile
	after insert on auth.users
	for each row execute function public.zfc_create_user_profile();

insert into public.zfc_user_profiles (id, email, display_name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'display_name', split_part(coalesce(email, ''), '@', 1))
from auth.users
on conflict (id) do nothing;

update public.zfc_user_profiles
set access_tier = 3, position = 'Administrator', updated_at = now()
where lower(email) = lower('s.barbosa.galaxy@gmail.com');

drop policy if exists zfc_user_profiles_self_select on public.zfc_user_profiles;
drop policy if exists zfc_user_profiles_tier3_select on public.zfc_user_profiles;
drop policy if exists zfc_user_profiles_tier3_update on public.zfc_user_profiles;
create policy zfc_user_profiles_self_select
	on public.zfc_user_profiles for select to authenticated using (id = auth.uid());
create policy zfc_user_profiles_tier3_select
	on public.zfc_user_profiles for select to authenticated using (public.zfc_current_tier() >= 3);
create policy zfc_user_profiles_tier3_update
	on public.zfc_user_profiles for update to authenticated
	using (public.zfc_current_tier() >= 3) with check (public.zfc_current_tier() >= 3);

grant usage on schema public to authenticated;
grant select on public.zfc_user_profiles to authenticated;
grant update (display_name, position, access_tier, updated_at) on public.zfc_user_profiles to authenticated;
revoke all on public.zfc_user_profiles from anon;

-- Gemeinsamer Chat für Tier 2 und Tier 3. Autorenname und Tier werden serverseitig gesetzt.
create table if not exists public.zfc_tier_chat_messages (
	id uuid primary key default gen_random_uuid(),
	sender_id uuid not null references public.zfc_user_profiles(id) on delete cascade,
	sender_name text not null default '',
	sender_tier smallint not null default 2 check (sender_tier in (2, 3)),
	message text not null check (char_length(message) between 1 and 2000 and message ~ '[^[:space:]]'),
	created_at timestamptz not null default now()
);

alter table public.zfc_tier_chat_messages enable row level security;
alter table public.zfc_tier_chat_messages replica identity full;
create index if not exists zfc_tier_chat_messages_created_idx on public.zfc_tier_chat_messages(created_at desc);

create or replace function public.zfc_prepare_tier_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if auth.uid() is null or new.sender_id <> auth.uid() then
		raise exception 'Chat-Nachrichten dürfen nur für das eigene Konto gesendet werden.';
	end if;

	new.sender_tier := public.zfc_current_tier();
	if new.sender_tier not in (2, 3) then
		raise exception 'Der Chat ist ausschließlich für Tier 2 und Tier 3 verfügbar.';
	end if;

	select coalesce(nullif(display_name, ''), email)
	into new.sender_name
	from public.zfc_user_profiles
	where id = new.sender_id;

	if new.sender_name is null or new.sender_name = '' then
		raise exception 'Das Benutzerprofil für die Chat-Nachricht wurde nicht gefunden.';
	end if;
	return new;
end;
$$;

drop trigger if exists zfc_prepare_tier_chat_message on public.zfc_tier_chat_messages;
create trigger zfc_prepare_tier_chat_message
	before insert on public.zfc_tier_chat_messages
	for each row execute function public.zfc_prepare_tier_chat_message();

drop policy if exists zfc_tier_chat_messages_select on public.zfc_tier_chat_messages;
drop policy if exists zfc_tier_chat_messages_insert on public.zfc_tier_chat_messages;
create policy zfc_tier_chat_messages_select
	on public.zfc_tier_chat_messages for select to authenticated
	using (public.zfc_current_tier() in (2, 3));
create policy zfc_tier_chat_messages_insert
	on public.zfc_tier_chat_messages for insert to authenticated
	with check (public.zfc_current_tier() in (2, 3) and sender_id = auth.uid());

revoke all on public.zfc_tier_chat_messages from anon, authenticated;
grant select, insert on public.zfc_tier_chat_messages to authenticated;
revoke all on function public.zfc_prepare_tier_chat_message() from public, anon, authenticated;

create table if not exists public.zfc_tier_escalations (
	id text primary key,
	case_id text,
	target_tier smallint not null check (target_tier in (2, 3)),
	data jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now()
);

alter table public.zfc_tier_escalations enable row level security;
create index if not exists zfc_tier_escalations_target_idx on public.zfc_tier_escalations(target_tier, updated_at desc);
drop policy if exists zfc_tier_escalations_select on public.zfc_tier_escalations;
drop policy if exists zfc_tier_escalations_insert on public.zfc_tier_escalations;
drop policy if exists zfc_tier_escalations_update on public.zfc_tier_escalations;
drop policy if exists zfc_tier_escalations_delete on public.zfc_tier_escalations;
create policy zfc_tier_escalations_select
	on public.zfc_tier_escalations for select to authenticated
	using (public.zfc_current_tier() >= 3 or (public.zfc_current_tier() = 2 and target_tier = 2));
create policy zfc_tier_escalations_insert
	on public.zfc_tier_escalations for insert to authenticated
	with check (public.zfc_current_tier() >= 3 or target_tier > public.zfc_current_tier() or (public.zfc_current_tier() = 2 and target_tier = 2));
create policy zfc_tier_escalations_update
	on public.zfc_tier_escalations for update to authenticated
	using (public.zfc_current_tier() >= 3 or (public.zfc_current_tier() = 2 and target_tier = 2))
	with check (public.zfc_current_tier() >= 3 or (public.zfc_current_tier() = 2 and target_tier = 2));
create policy zfc_tier_escalations_delete
	on public.zfc_tier_escalations for delete to authenticated using (public.zfc_current_tier() >= 3);
revoke all on public.zfc_tier_escalations from anon;
grant select, insert, update, delete on public.zfc_tier_escalations to authenticated;

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
drop policy if exists zfc_app_state_authenticated_select on public.zfc_app_state;
drop policy if exists zfc_app_state_authenticated_insert on public.zfc_app_state;
drop policy if exists zfc_app_state_authenticated_update on public.zfc_app_state;
drop policy if exists zfc_app_state_authenticated_delete on public.zfc_app_state;

create policy zfc_app_state_authenticated_select
	on public.zfc_app_state for select to authenticated using (public.zfc_current_tier() >= 1);
create policy zfc_app_state_authenticated_insert
	on public.zfc_app_state for insert to authenticated with check (public.zfc_current_tier() >= 1);
create policy zfc_app_state_authenticated_update
	on public.zfc_app_state for update to authenticated using (public.zfc_current_tier() >= 1) with check (public.zfc_current_tier() >= 1);
create policy zfc_app_state_authenticated_delete
	on public.zfc_app_state for delete to authenticated using (public.zfc_current_tier() >= 3);

revoke all on public.zfc_app_state from anon;
grant select, insert, update on public.zfc_app_state to authenticated;

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
drop policy if exists zfc_finance_settings_tier3_select on public.zfc_finance_settings;
drop policy if exists zfc_finance_settings_tier3_insert on public.zfc_finance_settings;
drop policy if exists zfc_finance_settings_tier3_update on public.zfc_finance_settings;
drop policy if exists zfc_finance_settings_tier3_delete on public.zfc_finance_settings;

create policy zfc_finance_settings_tier3_select
	on public.zfc_finance_settings for select to authenticated using (public.zfc_current_tier() >= 3);
create policy zfc_finance_settings_tier3_insert
	on public.zfc_finance_settings for insert to authenticated with check (public.zfc_current_tier() >= 3);
create policy zfc_finance_settings_tier3_update
	on public.zfc_finance_settings for update to authenticated using (public.zfc_current_tier() >= 3) with check (public.zfc_current_tier() >= 3);
create policy zfc_finance_settings_tier3_delete
	on public.zfc_finance_settings for delete to authenticated using (public.zfc_current_tier() >= 3);

revoke all on public.zfc_finance_settings from anon;
grant select, insert, update, delete on public.zfc_finance_settings to authenticated;

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
drop policy if exists zfc_finance_transactions_tier3_select on public.zfc_finance_transactions;
drop policy if exists zfc_finance_transactions_tier3_insert on public.zfc_finance_transactions;
drop policy if exists zfc_finance_transactions_tier3_update on public.zfc_finance_transactions;
drop policy if exists zfc_finance_transactions_tier3_delete on public.zfc_finance_transactions;

create policy zfc_finance_transactions_tier3_select
	on public.zfc_finance_transactions for select to authenticated using (public.zfc_current_tier() >= 3);
create policy zfc_finance_transactions_tier3_insert
	on public.zfc_finance_transactions for insert to authenticated with check (public.zfc_current_tier() >= 3);
create policy zfc_finance_transactions_tier3_update
	on public.zfc_finance_transactions for update to authenticated using (public.zfc_current_tier() >= 3) with check (public.zfc_current_tier() >= 3);
create policy zfc_finance_transactions_tier3_delete
	on public.zfc_finance_transactions for delete to authenticated using (public.zfc_current_tier() >= 3);

revoke all on public.zfc_finance_transactions from anon;
grant select, insert, update, delete on public.zfc_finance_transactions to authenticated;

-- Finanzdaten lagen bisher zusätzlich im gemeinsam lesbaren JSON-State.
update public.zfc_app_state
set state = state - 'finance' - 'financeSettings'
where state ? 'finance' or state ? 'financeSettings';

-- Bestehende Eskalierungen einmalig in die Tier-geschützte Tabelle übernehmen.
insert into public.zfc_tier_escalations (id, case_id, target_tier, data, updated_at)
select item->>'id', item->>'caseId',
	case when item->>'targetTier' = '2' then 2 else 3 end,
	item,
	coalesce(to_timestamp(nullif(item->>'updatedAt','')::double precision / 1000), now())
from public.zfc_app_state state_row
cross join lateral jsonb_array_elements(coalesce(state_row.state->'escalations', '[]'::jsonb)) item
where state_row.id = 1 and item ? 'id'
on conflict (id) do nothing;

update public.zfc_app_state
set state = state - 'escalations'
where state ? 'escalations';

-- Explizite API-Rechte für den öffentlichen anon-Key.
grant usage on schema public to authenticated;

-- Atomarer Merge für parallele Browser-Schreibvorgänge. Neue oder geänderte
-- Datensätze werden anhand ihrer ID zusammengeführt, statt einen Snapshot zu überschreiben.
create or replace function public.zfc_merge_json_arrays(existing jsonb, incoming jsonb)
returns jsonb
language sql
immutable
as $$
	select coalesce(jsonb_agg(item order by item->>'id'), '[]'::jsonb)
	from (
		select distinct on (item->>'id') item
		from (
			select value as item, 0 as source
			from jsonb_array_elements(coalesce(existing, '[]'::jsonb))
			where value ? 'id'
			union all
			select value as item, 1 as source
			from jsonb_array_elements(coalesce(incoming, '[]'::jsonb))
			where value ? 'id'
		) candidates
		order by item->>'id', source desc
	) merged_items;
$$;

create or replace function public.zfc_merge_app_state(incoming_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	current_state jsonb;
	merged_state jsonb;
	state_key text;
begin
	if public.zfc_current_tier() < 1 then
		raise exception 'Authentication required';
	end if;

	insert into public.zfc_app_state (id, state)
	values (1, '{}'::jsonb)
	on conflict (id) do nothing;

	select state into current_state
	from public.zfc_app_state
	where id = 1
	for update;

	merged_state := coalesce(current_state, '{}'::jsonb) || coalesce(incoming_state, '{}'::jsonb);
	foreach state_key in array array['teams','drivers','cases','transfers','esportSetups','marketRequests','caseActivityLog','deletedCaseLog'] loop
		if coalesce(incoming_state, '{}'::jsonb) ? state_key then
			merged_state := jsonb_set(merged_state, array[state_key], public.zfc_merge_json_arrays(current_state->state_key, incoming_state->state_key));
		end if;
	end loop;
	merged_state := merged_state - 'finance' - 'financeSettings' - 'escalations';

	update public.zfc_app_state
	set state = merged_state, updated_at = now()
	where id = 1;
	return merged_state;
end;
$$;

revoke all on function public.zfc_merge_app_state(jsonb) from public, anon;
grant execute on function public.zfc_merge_app_state(jsonb) to authenticated;
revoke all on function public.zfc_merge_json_arrays(jsonb, jsonb) from public, anon;

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

		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'zfc_tier_escalations'
		) then
			alter publication supabase_realtime add table public.zfc_tier_escalations;
		end if;

		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'zfc_tier_chat_messages'
		) then
			alter publication supabase_realtime add table public.zfc_tier_chat_messages;
		end if;
	end if;
end $$;
