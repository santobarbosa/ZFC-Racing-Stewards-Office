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

create or replace function public.zfc_is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1 from public.zfc_user_profiles
		where id = auth.uid()
			and lower(email) = lower('s.barbosa.galaxy@gmail.com')
	);
$$;

revoke all on function public.zfc_is_system_admin() from public, anon;
grant execute on function public.zfc_is_system_admin() to authenticated;

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
	using (public.zfc_current_tier() >= 3 and (access_tier < 3 or public.zfc_is_system_admin()))
	with check (
		public.zfc_current_tier() >= 3
		and (
			(access_tier <= 2 and lower(btrim(position)) <> 'ceo')
			or (access_tier = 3 and public.zfc_is_system_admin())
		)
	);

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

-- Prüft sensible Aktenänderungen serverseitig; UI-Sichtbarkeit ist keine Berechtigungsgrenze.
create or replace function public.zfc_validate_app_state_tier_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	actor_tier smallint;
	old_state jsonb := '{}'::jsonb;
	case_item jsonb;
	old_case jsonb;
	new_workflow jsonb;
	old_workflow jsonb;
	last_event jsonb;
	case_code text;
	action_name text;
	history_length integer;
	required_tier smallint;
	expected_owner_tier smallint;
begin
	actor_tier := public.zfc_current_tier();
	if actor_tier < 1 or auth.uid() is null then
		raise exception 'Anmeldung und gültiges Tier-Profil sind erforderlich.';
	end if;

	if tg_op = 'UPDATE' then
		old_state := coalesce(old.state, '{}'::jsonb);
	end if;

	for case_item in
		select value from jsonb_array_elements(coalesce(new.state->'cases', '[]'::jsonb))
	loop
		if case_item->>'id' is null then
			continue;
		end if;

		old_case := null;
		select value into old_case
		from jsonb_array_elements(coalesce(old_state->'cases', '[]'::jsonb)) as old_cases(value)
		where value->>'id' = case_item->>'id'
		limit 1;

		case_code := case_item->>'processCode';
		new_workflow := coalesce(case_item->'processWorkflow', '{}'::jsonb);

		if old_case is null then
			if case_item->>'createdById' is distinct from auth.uid()::text
				or (case_item->>'createdByTier')::smallint is distinct from actor_tier then
				raise exception 'Eine neue Akte muss der angemeldeten Person und deren Tier zugeordnet sein.';
			end if;
			if coalesce(case_item->>'status','Neu') <> 'Neu'
				or coalesce(case_item->>'decision','Keine weitere Untersuchung erforderlich') <> 'Keine weitere Untersuchung erforderlich'
				or coalesce((case_item->>'penaltyPoints')::integer,0) <> 0 then
				raise exception 'Neue Akten beginnen ohne Entscheidung oder Sanktion im Status Neu.';
			end if;
			if case_code is not null then
				if new_workflow->>'createdById' is distinct from auth.uid()::text
					or (new_workflow->>'createdByTier')::smallint is distinct from actor_tier then
					raise exception 'Die Prozessakte muss vom angemeldeten Konto und mit dessen Tier eröffnet werden.';
				end if;
				required_tier := case when case_code in ('D4','D8','D9','07b','V2','V3','F1','F2') then 3 else 2 end;
				if (new_workflow->>'requiredApprovalTier')::smallint is distinct from required_tier then
					raise exception 'Die erforderliche Freigabestufe dieses Prozesses darf nicht verändert werden.';
				end if;
				if new_workflow->>'requiresCeoApproval' is distinct from
					(case when case_code in ('V2','V3','F1','F2') then 'true' else 'false' end) then
					raise exception 'Die CEO-Freigabepflicht dieses Prozesses darf nicht verändert werden.';
				end if;
				expected_owner_tier := case when actor_tier = 1 then 1 else greatest(actor_tier, required_tier) end;
				if (new_workflow->>'ownerTier')::smallint is distinct from expected_owner_tier
					or new_workflow->>'approvalStatus' is distinct from (case
						when actor_tier = 1 then 'Noch nicht vorgelegt'
						else 'Tier-' || expected_owner_tier::text || '-Prüfung ausstehend'
					end) then
					raise exception 'Die neue Prozessakte muss mit dem vorgeschriebenen Prüfstatus beginnen.';
				end if;
				if actor_tier = 1 and case_code not in ('D1','D2','D3','D5','D6','R1','R2','R3','R6','R7','R8','V1','V2','V4','F1','F2','A1','07b') then
					raise exception 'Dieser Prozess darf nicht durch Tier 1 eröffnet werden.';
				end if;
				if case_code in ('D4','D8','D9') and actor_tier < 3 then
					raise exception 'Dieser Prozess darf nur durch Tier 3 eröffnet werden.';
				end if;
				if jsonb_array_length(coalesce(new_workflow->'history','[]'::jsonb)) <> 1
					or new_workflow->'history'->0->>'actorId' is distinct from auth.uid()::text
					or (new_workflow->'history'->0->>'actorTier')::smallint is distinct from actor_tier then
					raise exception 'Die Eröffnung muss mit einem unveränderlichen Protokolleintrag dokumentiert werden.';
				end if;
			end if;
			continue;
		end if;

		if actor_tier = 1 and (
			case_item->'decision' is distinct from old_case->'decision'
			or case_item->'decisionDetail' is distinct from old_case->'decisionDetail'
			or case_item->'penaltyPoints' is distinct from old_case->'penaltyPoints'
			or case_item->'licenseStatusAfter' is distinct from old_case->'licenseStatusAfter'
			or case_item->'licenseStatusDetail' is distinct from old_case->'licenseStatusDetail'
			or case_item->'status' is distinct from old_case->'status'
		) then
			raise exception 'Tier 1 darf keine Entscheidungen, Sanktionen oder Abschlussstatus ändern.';
		end if;

		if case_code is not null then
			old_workflow := coalesce(old_case->'processWorkflow', '{}'::jsonb);
			if new_workflow->>'createdById' is distinct from old_workflow->>'createdById'
				or new_workflow->>'createdByTier' is distinct from old_workflow->>'createdByTier'
				or new_workflow->>'requiredApprovalTier' is distinct from old_workflow->>'requiredApprovalTier'
				or new_workflow->>'requiresCeoApproval' is distinct from old_workflow->>'requiresCeoApproval' then
				raise exception 'Die ursprüngliche Prozessverantwortung darf nicht geändert werden.';
			end if;

			if case_item->'description' is distinct from old_case->'description'
				or case_item->'evidenceLink' is distinct from old_case->'evidenceLink'
				or case_item->'investigationNotes' is distinct from old_case->'investigationNotes'
				or case_item->'processFields' is distinct from old_case->'processFields' then
				if actor_tier is distinct from (old_workflow->>'ownerTier')::smallint
					or (old_workflow->>'createdById' = auth.uid()::text
						and old_workflow->>'approvalStatus' not in ('Noch nicht vorgelegt','Zur Ergänzung zurückgegeben')) then
					raise exception 'Der Sachverhalt darf nur durch die aktuell zuständige Bearbeitungsstufe ergänzt werden.';
				end if;
			end if;

			if case_item->'status' is distinct from old_case->'status' then
				raise exception 'Der Prozessstatus darf nur durch einen dokumentierten Workflow-Schritt geändert werden.';
			end if;

			if new_workflow is distinct from old_workflow then
				history_length := jsonb_array_length(coalesce(new_workflow->'history','[]'::jsonb));
				if history_length <> jsonb_array_length(coalesce(old_workflow->'history','[]'::jsonb)) + 1 then
					raise exception 'Jede Prozessänderung muss genau einen neuen Prüfverlaufseintrag enthalten.';
				end if;
				if (new_workflow->'history' #- array[(history_length - 1)::text]) is distinct from old_workflow->'history' then
					raise exception 'Vorhandene Prüfverlaufseinträge dürfen nicht geändert oder entfernt werden.';
				end if;
				last_event := new_workflow->'history'->(history_length - 1);
				action_name := last_event->>'action';
				if last_event->>'actorId' is distinct from auth.uid()::text
					or (last_event->>'actorTier')::smallint is distinct from actor_tier
					or nullif(btrim(last_event->>'reason'),'') is null then
					raise exception 'Prüfverlauf, handelnde Person und Begründung müssen übereinstimmen.';
				end if;

				if action_name = 'submit_tier2' then
					if actor_tier <> 1
						or old_workflow->>'ownerTier' is distinct from '1'
						or old_workflow->>'approvalStatus' not in ('Noch nicht vorgelegt','Zur Ergänzung zurückgegeben')
						or new_workflow->>'approvalStatus' is distinct from 'Tier-2-Prüfung ausstehend'
						or (new_workflow->>'ownerTier')::smallint <> 2 then
						raise exception 'Diese Übergabe an Tier 2 ist nicht zulässig.';
					end if;
				elsif action_name = 'escalate_t3' then
					if (actor_tier < 2 and not (actor_tier = 1 and case_code = '07b' and old_workflow->>'approvalStatus' in ('Noch nicht vorgelegt','Zur Ergänzung zurückgegeben')))
						or (actor_tier = 2 and (old_workflow->>'ownerTier' is distinct from '2' or old_workflow->>'approvalStatus' is distinct from 'Tier-2-Prüfung ausstehend'))
						or (actor_tier = 3 and (old_workflow->>'ownerTier' is distinct from '2' or old_workflow->>'approvalStatus' is distinct from 'Tier-2-Prüfung ausstehend'))
						or new_workflow->>'approvalStatus' is distinct from 'Tier-3-Prüfung ausstehend'
						or (new_workflow->>'ownerTier')::smallint <> 3 then
						raise exception 'Diese Eskalierung an Tier 3 ist nicht zulässig.';
					end if;
				elsif action_name = 'approve_t2' then
					if actor_tier <> 2 or old_workflow->>'createdById' = auth.uid()::text
						or (old_workflow->>'ownerTier')::smallint <> 2
						or old_workflow->>'approvalStatus' <> 'Tier-2-Prüfung ausstehend'
						or (old_workflow->>'requiredApprovalTier')::smallint > 2
						or new_workflow->>'approvalStatus' <> 'Freigegeben'
						or (new_workflow->>'ownerTier')::smallint <> 0 then
						raise exception 'Die Tier-2-Freigabe erfordert eine unabhängige Tier-2-Prüfung.';
					end if;
				elsif action_name = 'approve_t3' then
					if actor_tier <> 3 or old_workflow->>'createdById' = auth.uid()::text
						or (old_workflow->>'ownerTier')::smallint <> 3
						or old_workflow->>'approvalStatus' <> 'Tier-3-Prüfung ausstehend'
						or new_workflow->>'approvalStatus' is distinct from (case
							when coalesce((old_workflow->>'requiresCeoApproval')::boolean,false) then 'CEO-Entscheidung ausstehend'
							else 'Freigegeben'
						end)
						or (new_workflow->>'ownerTier')::smallint is distinct from (case
							when coalesce((old_workflow->>'requiresCeoApproval')::boolean,false) then 3
							else 0
						end) then
						raise exception 'Die Tier-3-Freigabe erfordert eine unabhängige Tier-3-Prüfung.';
					end if;
				elsif action_name = 'send_ceo' then
					if actor_tier <> 3 or old_workflow->>'ownerTier' is distinct from '3'
						or old_workflow->>'approvalStatus' is distinct from 'Tier-3-Prüfung ausstehend'
						or new_workflow->>'approvalStatus' is distinct from 'CEO-Entscheidung ausstehend'
						or new_workflow->>'ownerTier' is distinct from '3' then
						raise exception 'Eine CEO-Vorlage muss durch Tier 3 übergeben werden.';
					end if;
				elsif action_name = 'ceo_decide' then
					if actor_tier <> 3
						or not exists (select 1 from public.zfc_user_profiles where id = auth.uid() and lower(btrim(position)) = 'ceo')
						or old_workflow->>'createdById' = auth.uid()::text
						or old_workflow->>'ownerTier' is distinct from '3'
						or old_workflow->>'approvalStatus' is distinct from 'CEO-Entscheidung ausstehend'
						or old_workflow->'history'->(jsonb_array_length(coalesce(old_workflow->'history','[]'::jsonb))-1)->>'actorId' = auth.uid()::text
						or lower(coalesce(case_item->'processFields'->>'subject','')) like '%ceo%'
						or lower(coalesce(case_item->'processFields'->>'participants','')) like '%ceo%'
						or last_event->>'decision' is null
						or last_event->>'decision' is distinct from new_workflow->>'decision'
						or coalesce(not (
							(last_event->>'decision' in ('Freigegeben','Abgelehnt')
								and new_workflow->>'approvalStatus' = last_event->>'decision'
								and new_workflow->>'ownerTier' = '0')
							or (last_event->>'decision' = 'Änderung verlangt'
								and new_workflow->>'approvalStatus' = 'Zur Ergänzung zurückgegeben'
								and new_workflow->>'ownerTier' = '1')
							or (last_event->>'decision' in ('Weitere Prüfung angeordnet','Bearbeitung delegiert')
								and new_workflow->>'ownerTier' in ('2','3')
								and new_workflow->>'approvalStatus' = 'Tier-' || new_workflow->>'ownerTier' || '-Prüfung ausstehend')
						),true) then
						raise exception 'Die CEO-Entscheidung ist nur für ein unabhängiges, als CEO gekennzeichnetes Tier-3-Konto zulässig.';
					end if;
				elsif action_name = 'return_t1' then
					if actor_tier < 2 or new_workflow->>'approvalStatus' <> 'Zur Ergänzung zurückgegeben'
						or (new_workflow->>'ownerTier')::smallint <> 1 then
						raise exception 'Eine Rückgabe an Tier 1 erfordert einen konkreten Auftrag durch Tier 2 oder Tier 3.';
					end if;
				elsif action_name = 'implement_measure' then
					if actor_tier <> 1 or case_code <> 'D5'
						or old_workflow->>'approvalStatus' <> 'Freigegeben'
						or new_workflow->>'approvalStatus' <> 'Freigegeben'
						or new_workflow->>'implementationStatus' <> 'Umgesetzt'
						or old_workflow->>'implementationStatus' = 'Umgesetzt' then
						raise exception 'Tier 1 darf nur eine zuvor freigegebene D5-Maßnahme umsetzen und dokumentieren.';
					end if;
				else
					raise exception 'Unbekannte oder nicht zulässige Prozessaktion.';
				end if;

				if (
					case_item->'decision' is distinct from old_case->'decision'
					or case_item->'decisionDetail' is distinct from old_case->'decisionDetail'
					or case_item->'penaltyPoints' is distinct from old_case->'penaltyPoints'
					or case_item->'licenseStatusAfter' is distinct from old_case->'licenseStatusAfter'
					or case_item->'licenseStatusDetail' is distinct from old_case->'licenseStatusDetail'
				) and action_name not in ('approve_t2','approve_t3','ceo_decide') then
					raise exception 'Entscheidungen und Sanktionen benötigen die vorgeschriebene Freigabeaktion.';
				end if;
			elsif (
				case_item->'decision' is distinct from old_case->'decision'
				or case_item->'decisionDetail' is distinct from old_case->'decisionDetail'
				or case_item->'penaltyPoints' is distinct from old_case->'penaltyPoints'
				or case_item->'licenseStatusAfter' is distinct from old_case->'licenseStatusAfter'
				or case_item->'licenseStatusDetail' is distinct from old_case->'licenseStatusDetail'
			) then
				raise exception 'Entscheidungen und Sanktionen bei Prozessakten müssen über den Freigabeschritt erfolgen.';
			end if;
		else
			if case_item->'decision' is distinct from old_case->'decision'
				or case_item->'decisionDetail' is distinct from old_case->'decisionDetail'
				or case_item->'penaltyPoints' is distinct from old_case->'penaltyPoints'
				or case_item->'licenseStatusAfter' is distinct from old_case->'licenseStatusAfter'
				or case_item->'licenseStatusDetail' is distinct from old_case->'licenseStatusDetail'
				or case_item->'status' is distinct from old_case->'status' then
				if actor_tier < 2 then
					raise exception 'Tier 1 darf keine Entscheidungen, Sanktionen oder Abschlussstatus ändern.';
				end if;
				history_length := jsonb_array_length(coalesce(case_item->'history','[]'::jsonb));
				if history_length <> jsonb_array_length(coalesce(old_case->'history','[]'::jsonb)) + 1
					or (case_item->'history' #- array[(history_length - 1)::text]) is distinct from old_case->'history'
					or case_item->'history'->(history_length - 1)->>'actorId' is distinct from auth.uid()::text
					or (case_item->'history'->(history_length - 1)->>'actorTier')::smallint is distinct from actor_tier
					or nullif(btrim(case_item->'history'->(history_length - 1)->>'text'),'') is null then
					raise exception 'Entscheidungen und Statusänderungen benötigen einen nachvollziehbaren Prüfverlauf.';
				end if;
				if case_item->'decision' is distinct from old_case->'decision'
					and old_case->>'createdById' = auth.uid()::text then
					raise exception 'Die eigene Fallaufnahme darf nicht selbst entschieden werden.';
				end if;
				if case_item->>'decision' = 'Rennsperre' and actor_tier < 3 then
					raise exception 'Eine Rennsperre benötigt mindestens eine unabhängige Tier-3-Prüfung.';
				end if;
				if case_item->>'licenseStatusAfter' = 'Entzogen'
					and not exists (select 1 from public.zfc_user_profiles where id = auth.uid() and lower(btrim(position)) = 'ceo') then
					raise exception 'Ein Lizenzentzug benötigt eine CEO-Freigabe.';
				end if;
			end if;
		end if;
	end loop;
	return new;
end;
$$;

drop trigger if exists zfc_validate_app_state_tier_workflow on public.zfc_app_state;
create trigger zfc_validate_app_state_tier_workflow
	before insert or update of state on public.zfc_app_state
	for each row execute function public.zfc_validate_app_state_tier_workflow();
revoke all on function public.zfc_validate_app_state_tier_workflow() from public, anon, authenticated;

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
