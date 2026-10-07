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
	linked_code text;
	active_history jsonb;
	old_active_history jsonb;
	completed_pdf_count integer;
	required_process text;
	requirement_number integer;
	process_list jsonb;
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
			if jsonb_array_length(coalesce(case_item->'activeProcessCodes','[]'::jsonb)) > 0
				or jsonb_array_length(coalesce(case_item->'activeProcessHistory','[]'::jsonb)) > 0
				or case_item->>'documentClosureRoute' = 'early' then
				raise exception 'Zusätzliche Prozesse und frühe Abschlusswege müssen nach Aktenanlage mit nachvollziehbarer Berechtigung verknüpft werden.';
			end if;
			if coalesce(case_item->>'status','Neu') <> 'Neu'
				or coalesce(case_item->>'decision','Keine weitere Untersuchung erforderlich') <> 'Keine weitere Untersuchung erforderlich'
				or coalesce((case_item->>'penaltyPoints')::integer,0) <> 0 then
				raise exception 'Neue Akten beginnen ohne Entscheidung oder Sanktion im Status Neu.';
			end if;
			if case_code is not null then
				if case_item->>'caseType' is null
					or case_item->>'caseType' not in ('steward','force') then
					raise exception 'Prozessakten müssen als Steward-Fall oder Force-Vorgang gekennzeichnet werden.';
				end if;
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

		if actor_tier = 3 then
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

		if case_item->'activeProcessCodes' is distinct from old_case->'activeProcessCodes' then
			if jsonb_typeof(coalesce(case_item->'activeProcessCodes','[]'::jsonb)) <> 'array'
				or not coalesce(case_item->'activeProcessCodes','[]'::jsonb) @> coalesce(old_case->'activeProcessCodes','[]'::jsonb) then
				raise exception 'Verknüpfte Prozesse dürfen nicht entfernt oder rückwirkend geändert werden.';
			end if;
			select value into linked_code
			from jsonb_array_elements_text(coalesce(case_item->'activeProcessCodes','[]'::jsonb)) value
			where not coalesce(old_case->'activeProcessCodes','[]'::jsonb) @> to_jsonb(value)
			limit 1;
			old_active_history := coalesce(old_case->'activeProcessHistory','[]'::jsonb);
			active_history := coalesce(case_item->'activeProcessHistory','[]'::jsonb);
			history_length := jsonb_array_length(active_history);
			if linked_code is null
				or linked_code = case_item->>'processCode'
				or history_length <> jsonb_array_length(old_active_history) + 1
				or (active_history #- array[(history_length - 1)::text]) is distinct from old_active_history then
				raise exception 'Eine Prozessverknüpfung benötigt genau einen neuen, unveränderlichen Historieneintrag.';
			end if;
			last_event := active_history->(history_length - 1);
			if last_event->>'processCode' is distinct from linked_code
				or last_event->>'action' is distinct from 'linked'
				or last_event->>'actorId' is distinct from auth.uid()::text
				or (last_event->>'actorTier')::smallint is distinct from actor_tier then
				raise exception 'Prozessverknüpfung, handelndes Konto und Auditverlauf stimmen nicht überein.';
			end if;
			if actor_tier = 1 and linked_code not in ('D1','D2','D3','D5','D6','R1','R2','R3','R6','R7','R8','V1','V2','V4','F1','F2','A1','07b')
				or linked_code in ('D4','D8','D9') and actor_tier < 3 then
				raise exception 'Dieser Prozess darf von der angemeldeten Tier-Stufe nicht mit der Akte verknüpft werden.';
			end if;
		elsif case_item->'activeProcessHistory' is distinct from old_case->'activeProcessHistory' then
			raise exception 'Der Prozessverlauf darf nicht unabhängig von einer Prozessverknüpfung geändert werden.';
		end if;

		if (case_item->'documentClosureRoute' is distinct from old_case->'documentClosureRoute'
			or case_item->'documentClosureReason' is distinct from old_case->'documentClosureReason')
			and case_item->>'documentClosureRoute' = 'early' then
			history_length := jsonb_array_length(coalesce(case_item->'history','[]'::jsonb));
			if actor_tier < 2
				or nullif(btrim(case_item->>'documentClosureReason'),'') is null
				or history_length <> jsonb_array_length(coalesce(old_case->'history','[]'::jsonb)) + 1
				or (case_item->'history' #- array[(history_length - 1)::text]) is distinct from coalesce(old_case->'history','[]'::jsonb)
				or case_item->'history'->(history_length - 1)->>'actorId' is distinct from auth.uid()::text
				or (case_item->'history'->(history_length - 1)->>'actorTier')::smallint is distinct from actor_tier then
				raise exception 'Ein früher Abschlussweg erfordert eine Tier-2-Begründung und einen unveränderlichen Protokolleintrag.';
			end if;
		elsif old_case->>'documentClosureRoute' = 'early'
			and case_item->'documentClosureRoute' is distinct from old_case->'documentClosureRoute' then
			raise exception 'Ein begründeter früher Abschlussweg darf nicht nachträglich entfernt werden.';
		end if;

		if case_item->>'status' = 'Archiviert' and old_case->>'status' is distinct from 'Archiviert' then
			select count(distinct doc.document_type||':'||encode(digest(doc.content::text,'sha256'),'hex'))
			into completed_pdf_count
			from public.zfc_case_documents doc
			join storage.objects object_row
				on object_row.bucket_id = 'case-documents' and object_row.name = doc.pdf_path
			where doc.case_id = case_item->>'id'
				and doc.status in ('Freigegeben','Finalisiert')
				and doc.pdf_path is not null
				and jsonb_typeof(doc.content) = 'object'
				and exists (
					select 1 from jsonb_each_text(doc.content) fields
					where length(btrim(fields.value)) > 0
				);
			if coalesce(completed_pdf_count,0) < 5 then
				raise exception 'Aktenabschluss gesperrt: mindestens fünf unterschiedliche, vollständige PDF-Dokumente sind erforderlich.';
			end if;

			if case_item->>'documentClosureRoute' = 'early' then
				process_list := jsonb_build_array('EARLY');
			else
				process_list := coalesce(case_item->'activeProcessCodes','[]'::jsonb);
				if case_item->>'processCode' is not null
					and not process_list @> to_jsonb(case_item->>'processCode') then
					process_list := process_list || jsonb_build_array(case_item->>'processCode');
				end if;
			end if;
			for required_process in select jsonb_array_elements_text(process_list)
			loop
				for requirement_number in 1..5
				loop
					if not exists (
						select 1
						from public.zfc_case_documents doc
						join storage.objects object_row
							on object_row.bucket_id = 'case-documents' and object_row.name = doc.pdf_path
						where doc.case_id = case_item->>'id'
							and doc.status in ('Freigegeben','Finalisiert')
							and doc.pdf_path is not null
							and doc.required_for @> jsonb_build_array(jsonb_build_object(
								'processCode',required_process,'index',requirement_number
							))
					) then
						raise exception 'Aktenabschluss gesperrt: Pflichtunterlage % von Prozess % fehlt.',requirement_number,required_process;
					end if;
				end loop;
			end loop;
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

-- Aktenbezogene Dokumente und unveränderliche PDF-Fassungen.
create or replace function public.zfc_case_document_case(p_case_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
	select item.value
	from public.zfc_app_state state_row
	cross join lateral jsonb_array_elements(coalesce(state_row.state->'cases', '[]'::jsonb)) item(value)
	where state_row.id = 1 and item.value->>'id' = p_case_id
	limit 1;
$$;

create or replace function public.zfc_case_document_access(p_case_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	actor_tier smallint := public.zfc_current_tier();
	case_item jsonb;
begin
	if auth.uid() is null or actor_tier < 1 then return false; end if;
	case_item := public.zfc_case_document_case(p_case_id);
	if case_item is null then return false; end if;
	if actor_tier >= 2 then return true; end if;
	return case_item->>'createdById' = auth.uid()::text
		or case_item->'processWorkflow'->>'createdById' = auth.uid()::text
		or coalesce(case_item->'processWorkflow'->>'ownerTier','0') = '1'
		or exists (
			select 1 from jsonb_array_elements(coalesce(case_item->'activeProcessHistory','[]'::jsonb)) linked
			where linked->>'actorId' = auth.uid()::text
		);
end;
$$;

create or replace function public.zfc_document_process_review_tier(p_process_code text)
returns smallint
language sql
immutable
as $$
	select case
		when p_process_code in ('D4','D8','D9','07b','V2','V3','F1','F2') then 3
		else 2
	end::smallint;
$$;

create or replace function public.zfc_document_type_requires_approval(p_document_type text)
returns boolean
language sql
immutable
as $$
	select coalesce(p_document_type, '') ~
		'(entscheidung|freigabe|beschluss|unabhangig|unabhaengig|prufauftrag|pruefauftrag|freigegeben|freigegebene|abschlussfreigabe|offentliche-entscheidungsfassung|oeffentliche-entscheidungsfassung)';
$$;

create table if not exists public.zfc_process_document_requirements (
	process_code text not null,
	requirement_index smallint not null check (requirement_index between 1 and 5),
	document_title text not null,
	primary key (process_code, requirement_index)
);

with process_matrix(process_code, document_titles) as (
	values
		('D1', array['Meldeformular','Eingangs- und Vollständigkeitsprüfung','Neutraler Sachverhaltsvermerk','Unterlagenübersicht und offene Fragen','Weiterleitungs- oder Einstellungsvermerk']::text[]),
		('D2', array['Sicherungsauftrag','Herkunfts- und Übernahmevermerk','Beweismittelverzeichnis','Prüfung von Kontext und Vollständigkeit','Sicherungsabschluss und Übergabe']::text[]),
		('D3', array['Anhörungsauftrag und Fragenkatalog','Anhörungsschreiben','Zustell- und Fristvermerk','Stellungnahme oder dokumentierter Nichteingang','Auswertung und Übergabe']::text[]),
		('35', array['Eröffnungsvermerk','Sachverhaltsbericht','Beweis- und Stellungnahmenübersicht','Analyse und freigegebene Entscheidung','Zustellung, Umsetzung und Abschluss']::text[]),
		('D4', array['Einspruchsformular','Voraussetzungen- und Fristprüfung','Prüfauftrag und Unabhängigkeitsvermerk','Überprüfungsbericht und Entscheidung','Zustellung und Folgemaßnahmen']::text[]),
		('D5', array['Maßnahmenauftrag','Prüfung der Entscheidungsgrundlage','Umsetzungsplan','Ausführungs- und Kontrollnachweis','Mitteilung und Abschluss']::text[]),
		('D6', array['Beschwerdeformular','Sachverhalts- und Kontextbericht','Kommunikations- und Beweisübersicht','Stellungnahmen und Analyse','Weiterleitungs- oder Abschlussentscheidung']::text[]),
		('D7', array['Befangenheitsmeldung','Beschreibung des Interessenkonflikts','Unabhängiger Prüfbericht','Zuständigkeitsentscheidung','Übergabe- und Berechtigungsnachweis']::text[]),
		('D8', array['Wiederaufnahmeantrag','Relevanz- und Voraussetzungenprüfung','Freigabe und Prüfauftrag','Ergänzende Untersuchung und Entscheidung','Änderungs-, Zustellungs- und Abschlussbericht']::text[]),
		('D9', array['Erweiterungsantrag','Freigegebener Erweiterungsbeschluss','Untersuchungsplan','Gesamtuntersuchungsbericht','Freigegebene Abschlussentscheidung und Umsetzungsauftrag']::text[]),
		('07b', array['Eskalierungsantrag','Sachstands- und Übergabebericht','Unterlagen- und Aufgabenübersicht','Tier-3-Prüfung und Ergebnis','Rückübermittlung und Erledigungsvermerk']::text[]),
		('R1', array['Teilnahme- oder Abmeldeformular','Startberechtigungsprüfung','Teilnehmer- und Ersatzfahrerübersicht','Bestätigungs- und Änderungsprotokoll','Abschließende Startliste oder Abmeldebestätigung']::text[]),
		('R2', array['Lobbyauftrag','Einstellungscheckliste','Einladungs- und Anwesenheitsliste','Bereitschaft und Startfreigabe','Lobbyabschlussprotokoll']::text[]),
		('R3', array['Briefingauftrag','Regel- und Veranstaltungsprüfung','Freigegebenes Fahrerbriefing','Veröffentlichungsnachweis','Rückfragen-, Änderungs- und Abschlussvermerk']::text[]),
		('R4', array['Veranstaltungs- und Zuständigkeitsblatt','Ereignisprotokoll','Regel- und Lagebewertung','Entscheidungs- und Kommunikationsprotokoll','Nachbereitungsbericht']::text[]),
		('R5', array['Rennvorfallmeldung','Sachverhaltsrekonstruktion','Beweis- und Stellungnahmenübersicht','Analyse und freigegebene Steward-Entscheidung','Zustellung und Ergebnisübergabe']::text[]),
		('R6', array['Ergebnis-Eingangsblatt','Rohdaten- und Quellenübersicht','Punkte- und Maßnahmenberechnung','Prüf- und Freigabevermerk','Veröffentlichte Ergebnisse und Wertung']::text[]),
		('R7', array['Lizenzantrag oder Änderungsauftrag','Voraussetzungenprüfung','Lizenzstatusblatt','Entscheidungs- und Änderungsnachweis','Mitteilung und Abschluss']::text[]),
		('R8', array['Störungsmeldung','Technischer Sachverhaltsbericht','Nachweis- und Rückmeldungsübersicht','Auswirkungsanalyse und Maßnahmenplan','Lösungs- und Abschlussbericht']::text[]),
		('V1', array['Aufnahme- oder Änderungsformular','Stammdatenprüfung','Teilnahme- und Zuordnungsprüfung','Freigegebenes Profil- oder Änderungsblatt','Bestätigung und Abschluss']::text[]),
		('V2', array['Rollen- und Rechteantrag','Bedarfs- und Konfliktprüfung','Berechtigungsfreigabe','Einrichtungs- und Kontrollnachweis','Einweisungs- oder Entzugsvermerk']::text[]),
		('V3', array['Änderungsantrag','Auswirkungsanalyse','Abstimmungs- und Rückmeldungsbericht','Änderungsversion mit CEO-Freigabe','Veröffentlichung und Einführung']::text[]),
		('V4', array['Wechselantrag','Voraussetzungenprüfung','Bestätigungs- und Auswirkungsübersicht','Wechselentscheidung','Änderung und Mitteilungsnachweis']::text[]),
		('F1', array['Finanzantrag','Beleg- und Empfängerprüfung','Budget- und Befugnisprüfung','Finanzentscheidung','Zahlungs- oder Buchungsnachweis und Abschluss']::text[]),
		('F2', array['Buchungsauftrag','Grundlagenprüfung','Buchungs- oder Korrekturbeleg','Salden- und Kontrollbericht','Freigabe und Abschluss']::text[]),
		('A1', array['Abschlussantrag','Vollständigkeitscheckliste','Aufgaben- und Maßnahmenabschlussübersicht','Abschlussfreigabe','Archivierungsvermerk und Dokumentenverzeichnis']::text[]),
		('A2', array['Veröffentlichungsauftrag','Inhalts- und Vertraulichkeitsprüfung','Öffentliche Entscheidungsfassung','Veröffentlichungsfreigabe','Veröffentlichungs- und Abschlussnachweis']::text[]),
		('E1', array['Bewerbungsformular','Voraussetzungen und Testplan','Leistungsbewertung','Auswahlgesprächsvermerk','Aufnahmeentscheidung und nächste Schritte']::text[]),
		('E2', array['Trainingsauftrag und Zielsetzung','Trainingsplan','Anmelde- und Anwesenheitsliste','Trainings- und Beobachtungsprotokoll','Nachbereitung und Aufgabenbericht']::text[]),
		('E3', array['Bewertungsauftrag und Kriterien','Beobachtungs- und Datenauswertung','Bewertungsbericht','Entwicklungsgespräch und Zielplan','Fortschritts- und Abschlussbericht']::text[]),
		('EARLY', array['Eingangsformular beziehungsweise Antrag','Voraussetzungen- und Vollständigkeitsprüfung','Sachstands- und Unterlagenvermerk','Freigegebene Einstellungs-, Ablehnungs- oder Zusammenführungsentscheidung','Mitteilungs- und Abschlussvermerk']::text[])
)
insert into public.zfc_process_document_requirements(process_code,requirement_index,document_title)
select process_code, position::smallint, document_title
from process_matrix
cross join lateral unnest(document_titles) with ordinality as items(document_title,position)
on conflict (process_code,requirement_index) do update set document_title = excluded.document_title;
revoke all on public.zfc_process_document_requirements from public, anon, authenticated;

create or replace function public.zfc_document_title_slug(p_title text)
returns text
language sql
immutable
as $$
	select trim(both '-' from regexp_replace(
		regexp_replace(lower(translate(coalesce(p_title,''),'ÄÖÜäöü','AOUaou')),'[^a-z0-9]+','-','g'),
		'-+','-','g'
	));
$$;

create table if not exists public.zfc_case_document_type_catalog (
	document_type text primary key,
	title text not null,
	requires_approval boolean not null default false
);

insert into public.zfc_case_document_type_catalog(document_type,title,requires_approval)
select
	'process-'||required.process_code||'-'||required.requirement_index||'-'||public.zfc_document_title_slug(required.document_title),
	required.document_title,
	public.zfc_document_type_requires_approval('process-'||required.process_code||'-'||required.requirement_index||'-'||public.zfc_document_title_slug(required.document_title))
from public.zfc_process_document_requirements required
where required.process_code <> 'EARLY'
on conflict (document_type) do update
set title=excluded.title,requires_approval=excluded.requires_approval;

with catalog_types(type_prefix,title) as (
	values
		('general','Eingangs- oder Meldeformular'),
		('general','Eröffnungsvermerk'),
		('general','Sachverhaltsbericht'),
		('general','Beweismittelverzeichnis'),
		('general','Beweismittelprüfbericht'),
		('general','Gesprächsvermerk'),
		('general','Anhörungsschreiben'),
		('general','Stellungnahme'),
		('general','Frist- und Zustellvermerk'),
		('general','Analysebericht'),
		('general','Prüfauftrag'),
		('general','Entscheidungsentwurf'),
		('general','Freigabevermerk'),
		('general','Verbindliche Entscheidung'),
		('general','07b-Eskalierungsbericht'),
		('general','D9-Erweiterungsantrag'),
		('general','D9-Eröffnungsbeschluss'),
		('general','CEO-Entscheidungsvorlage'),
		('general','CEO-Entscheidungsvermerk'),
		('general','Maßnahmen- und Umsetzungsbericht'),
		('general','Abschlussbericht'),
		('general','Archivierungsvermerk'),
		('general','Öffentliche Entscheidungsfassung'),
		('general','Ergänzender Aktenvermerk'),
		('general','Einstellungs- oder Zusammenführungsentscheidung'),
		('additional','Eingangsformular beziehungsweise Antrag'),
		('additional','Voraussetzungen- und Vollständigkeitsprüfung'),
		('additional','Sachstands- und Unterlagenvermerk'),
		('additional','Freigegebene Einstellungs-, Ablehnungs- oder Zusammenführungsentscheidung'),
		('additional','Mitteilungs- und Abschlussvermerk'),
		('additional','Beweismittelblatt'),
		('additional','Aktualisiertes Beweismittelverzeichnis'),
		('additional','Übernahmevermerk'),
		('additional','Freigegebener D9-Beschluss'),
		('additional','Befangenheitsmeldung und Prüfentscheidung'),
		('additional','Umsetzungsauftrag'),
		('additional','Abschlussbericht und Vollständigkeitsprüfung'),
		('additional','Ergänzender Prüfauftrag und Ergebnisbericht'),
		('additional','Fristverlängerungsentscheidung'),
		('additional','Neue Entscheidungsfassung und Änderungsvermerk'),
		('additional','Aktennachtrag')
)
insert into public.zfc_case_document_type_catalog(document_type,title,requires_approval)
select type_prefix||'-'||public.zfc_document_title_slug(title),title,
	public.zfc_document_type_requires_approval(type_prefix||'-'||public.zfc_document_title_slug(title))
from catalog_types
on conflict (document_type) do update
set title=excluded.title,requires_approval=excluded.requires_approval;
revoke all on public.zfc_case_document_type_catalog from public, anon, authenticated;

create table if not exists public.zfc_case_documents (
	id uuid primary key default gen_random_uuid(),
	document_id uuid not null,
	version integer not null check (version > 0),
	case_id text not null,
	process_code text,
	document_type text not null,
	title text not null default '',
	status text not null default 'Entwurf'
		check (status in ('Entwurf','Zur Prüfung','Zur Ergänzung zurückgegeben','Freigegeben','Finalisiert','Ersetzt')),
	content jsonb not null default '{}'::jsonb,
	record_snapshot jsonb not null default '{}'::jsonb,
	required_for jsonb not null default '[]'::jsonb,
	requires_approval boolean not null default false,
	required_tier smallint not null default 2 check (required_tier between 1 and 3),
	requires_ceo boolean not null default false,
	created_by uuid not null references public.zfc_user_profiles(id),
	created_by_name text not null default '',
	created_by_tier smallint not null check (created_by_tier between 1 and 3),
	reviewed_by uuid references public.zfc_user_profiles(id),
	reviewed_by_name text,
	approved_by uuid references public.zfc_user_profiles(id),
	approved_by_name text,
	review_note text not null default '',
	pdf_path text,
	pdf_generated_at timestamptz,
	revision integer not null default 0 check (revision >= 0),
	document_number text not null,
	previous_document_id uuid references public.zfc_case_documents(id),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (document_id, version),
	unique (case_id, document_number)
);

create index if not exists zfc_case_documents_case_idx
	on public.zfc_case_documents(case_id, created_at desc);
create index if not exists zfc_case_documents_logical_idx
	on public.zfc_case_documents(document_id, version desc);
alter table public.zfc_case_documents enable row level security;
alter table public.zfc_case_documents replica identity full;

create or replace function public.zfc_case_document_can_review(p_document_row_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
	doc public.zfc_case_documents%rowtype;
	actor_tier smallint := public.zfc_current_tier();
	actor_position text;
begin
	select * into doc from public.zfc_case_documents where id = p_document_row_id;
	if not found or doc.status <> 'Zur Prüfung' or not public.zfc_case_document_access(doc.case_id) then return false; end if;
	if actor_tier >= 3 then return true; end if;
	if doc.created_by = auth.uid() then return false; end if;
	if doc.requires_ceo then
		select lower(btrim(position)) into actor_position from public.zfc_user_profiles where id = auth.uid();
		return actor_tier = 3 and actor_position = 'ceo' and doc.reviewed_by is distinct from auth.uid();
	end if;
	return actor_tier = doc.required_tier;
end;
$$;

create table if not exists public.zfc_case_document_events (
	id uuid primary key default gen_random_uuid(),
	document_row_id uuid not null references public.zfc_case_documents(id) on delete restrict,
	event_type text not null,
	actor_id uuid not null references public.zfc_user_profiles(id),
	actor_name text not null default '',
	actor_tier smallint not null check (actor_tier between 1 and 3),
	details text not null default '',
	created_at timestamptz not null default now()
);
create index if not exists zfc_case_document_events_document_idx
	on public.zfc_case_document_events(document_row_id, created_at);
alter table public.zfc_case_document_events enable row level security;

create or replace function public.zfc_prepare_case_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	actor_tier smallint := public.zfc_current_tier();
	profile_name text;
	case_item jsonb;
	code_tier smallint;
	approval_required boolean;
	ceo_required boolean;
	content_values integer;
	catalog_approval_required boolean;
	requirement_row jsonb;
	required_title text;
	expected_document_type text;
begin
	if auth.uid() is null or actor_tier < 1 then
		raise exception 'Anmeldung und gültiges Tier-Profil sind für Dokumentvorgänge erforderlich.';
	end if;
	case_item := public.zfc_case_document_case(new.case_id);
	if case_item is null or not public.zfc_case_document_access(new.case_id) then
		raise exception 'Kein berechtigter Zugriff auf die zugeordnete Akte.';
	end if;
	if case_item->>'caseType' = 'steward' then
		raise exception 'Für einen Steward-Fall ist der Dokumentenbereich geschlossen.';
	end if;
	if case_item->>'status' = 'Archiviert' and actor_tier < 3 then
		raise exception 'In einer archivierten Akte können keine Dokumente mehr geändert werden.';
	end if;
	if nullif(new.process_code,'') is not null
		and case_item->>'processCode' is distinct from new.process_code
		and not coalesce(case_item->'activeProcessCodes','[]'::jsonb) @> to_jsonb(new.process_code) then
		raise exception 'Der Dokumentprozess ist in dieser Akte nicht aktiv verknüpft.';
	end if;
	if new.process_code is null then
		new.process_code := coalesce(case_item->>'processCode','');
	end if;
	code_tier := public.zfc_document_process_review_tier(new.process_code);
	select catalog.requires_approval into catalog_approval_required
	from public.zfc_case_document_type_catalog catalog
	where catalog.document_type = new.document_type and catalog.title = new.title;
	if not found then raise exception 'Die Dokumentart ist nicht im verbindlichen Katalog enthalten.'; end if;
	approval_required := catalog_approval_required;
	ceo_required := approval_required and (
		new.process_code in ('V2','V3','F1','F2')
		or coalesce((case_item->'processWorkflow'->>'requiresCeoApproval')::boolean,false)
	);
	if new.requires_approval is distinct from approval_required
		or new.requires_ceo is distinct from ceo_required
		or new.required_tier is distinct from code_tier then
		raise exception 'Dokumentfreigabestufe und Freigabepflicht werden verbindlich serverseitig bestimmt.';
	end if;

	select coalesce(nullif(display_name,''),email) into profile_name
	from public.zfc_user_profiles where id = auth.uid();

	if tg_op = 'INSERT' then
		if new.created_by is distinct from auth.uid()
			or new.created_by_tier is distinct from actor_tier
			or new.status <> 'Entwurf'
			or new.revision <> 0 then
			raise exception 'Neue Dokumente beginnen als Entwurf des angemeldeten Kontos.';
		end if;
		if jsonb_typeof(new.content) <> 'object' or jsonb_typeof(new.record_snapshot) <> 'object'
			or jsonb_typeof(new.required_for) <> 'array' then
			raise exception 'Dokumentinhalt, Aktenstand und Pflichtzuordnungen müssen strukturiert vorliegen.';
		end if;
		if new.document_type like 'process-%' then
			expected_document_type := 'process-'||new.process_code||'-'||split_part(new.document_type,'-',3)||'-'||public.zfc_document_title_slug(new.title);
			if new.document_type is distinct from expected_document_type
				or not exists (
					select 1 from public.zfc_process_document_requirements required
					where required.process_code = new.process_code
						and required.requirement_index = split_part(new.document_type,'-',3)::smallint
						and required.document_title = new.title
				) then
				raise exception 'Prozessspezifischer Dokumenttyp und Pflichtunterlage stimmen nicht mit der verbindlichen Matrix überein.';
			end if;
		elsif new.document_type like 'general-%' then
			if substring(new.document_type from 9) is distinct from public.zfc_document_title_slug(new.title) then
				raise exception 'Dokumentart und Dokumenttitel stimmen nicht mit dem zentralen Katalog überein.';
			end if;
		elsif new.document_type like 'additional-%' then
			if substring(new.document_type from 12) is distinct from public.zfc_document_title_slug(new.title) then
				raise exception 'Zusatzdokumentart und Titel stimmen nicht mit dem Katalog überein.';
			end if;
		else
			raise exception 'Unbekannte Dokumentart.';
		end if;
		for requirement_row in select value from jsonb_array_elements(new.required_for)
		loop
			if jsonb_typeof(requirement_row) <> 'object'
				or coalesce(requirement_row->>'processCode','') = ''
				or coalesce((requirement_row->>'index')::integer,0) not between 1 and 5 then
				raise exception 'Ungültige Pflichtunterlagenzuordnung.';
			end if;
			if requirement_row->>'processCode' = 'EARLY' then
				if case_item->>'documentClosureRoute' <> 'early' then
					raise exception 'Frühabschluss-Unterlagen dürfen nur für den ausdrücklich begründeten Frühabschlussweg verknüpft werden.';
				end if;
			elsif requirement_row->>'processCode' <> case_item->>'processCode'
				and not coalesce(case_item->'activeProcessCodes','[]'::jsonb) @> to_jsonb(requirement_row->>'processCode') then
				raise exception 'Eine Pflichtunterlage kann nur einem aktiven Prozess dieser Akte zugeordnet werden.';
			end if;
			select document_title into required_title
			from public.zfc_process_document_requirements
			where process_code = requirement_row->>'processCode'
				and requirement_index = (requirement_row->>'index')::smallint;
			if required_title is null or required_title is distinct from new.title then
				raise exception 'Die Dokumentzuordnung erfüllt den konkreten Pflichtunterlagentyp nicht.';
			end if;
		end loop;
		if new.document_type like 'process-%'
			and (new.process_code is distinct from split_part(new.document_type,'-',2)
				or not new.required_for @> jsonb_build_array(jsonb_build_object(
					'processCode',new.process_code,'index',split_part(new.document_type,'-',3)::integer
				))) then
			raise exception 'Pflichtdokument und zugeordnete Prozess-Checkliste stimmen nicht überein.';
		end if;
		if new.version > 1 and not exists (
			select 1 from public.zfc_case_documents previous
			where previous.document_id = new.document_id
				and previous.id = new.previous_document_id
				and previous.version = new.version - 1
				and previous.case_id = new.case_id
				and previous.status in ('Freigegeben','Finalisiert','Ersetzt')
		) then
			raise exception 'Eine neue Dokumentversion muss auf eine abgeschlossene Vorversion verweisen.';
		end if;
		if new.process_code = case_item->>'processCode' and new.process_code <> '' then
			if actor_tier < 3 and (
				actor_tier <> coalesce((case_item->'processWorkflow'->>'ownerTier')::smallint,actor_tier)
				or case_item->'processWorkflow'->>'createdById' = auth.uid()::text
					and case_item->'processWorkflow'->>'approvalStatus' not in ('Noch nicht vorgelegt','Zur Ergänzung zurückgegeben')
				or case_item->'processWorkflow'->>'approvalStatus' in ('Freigegeben','Abgelehnt')
			) then
				raise exception 'Die Prozessakte ist einer anderen Bearbeitungsstufe oder bereits einer Freigabe zugeordnet.';
			end if;
		elsif new.process_code <> '' then
			if actor_tier = 1 and new.process_code not in ('D1','D2','D3','D5','D6','R1','R2','R3','R6','R7','R8','V1','V2','V4','F1','F2','A1','07b')
				or actor_tier < public.zfc_document_process_review_tier(new.process_code)
					and actor_tier <> 1 then
				raise exception 'Die Tier-Stufe darf diesen verknüpften Prozess nicht bearbeiten.';
			end if;
		end if;
		new.created_by_name := profile_name;
		new.created_at := now();
		new.pdf_generated_at := null;
		perform pg_advisory_xact_lock(hashtext(new.case_id));
		select coalesce(case_item->>'stw',new.case_id)||'-D-'||lpad((count(*)+1)::text,3,'0')
		into new.document_number
		from public.zfc_case_documents existing
		where existing.case_id = new.case_id;
		new.updated_at := now();
		return new;
	end if;

	if actor_tier = 3 then
		new.updated_at := now();
		if new.pdf_path is distinct from old.pdf_path and new.pdf_path is not null then
			new.pdf_generated_at := now();
		end if;
		return new;
	end if;

	if new.id is distinct from old.id
		or new.document_id is distinct from old.document_id
		or new.version is distinct from old.version
		or new.case_id is distinct from old.case_id
		or new.process_code is distinct from old.process_code
		or new.document_type is distinct from old.document_type
		or new.title is distinct from old.title
		or new.required_for is distinct from old.required_for
		or new.requires_approval is distinct from old.requires_approval
		or new.required_tier is distinct from old.required_tier
		or new.requires_ceo is distinct from old.requires_ceo
		or new.created_by is distinct from old.created_by
		or new.created_by_tier is distinct from old.created_by_tier
		or new.document_number is distinct from old.document_number
		or new.previous_document_id is distinct from old.previous_document_id then
		raise exception 'Dokumentidentität, Aktenzuordnung und Ersteller sind unveränderlich.';
	end if;
	if new.reviewed_by is distinct from old.reviewed_by
		or new.reviewed_by_name is distinct from old.reviewed_by_name
		or new.approved_by is distinct from old.approved_by
		or new.approved_by_name is distinct from old.approved_by_name
		or new.review_note is distinct from old.review_note then
		if new.status not in ('Freigegeben','Zur Ergänzung zurückgegeben')
			or old.status <> 'Zur Prüfung' then
			raise exception 'Prüf- und Freigabeangaben dürfen nur beim dokumentierten Prüfschritt geändert werden.';
		end if;
	end if;
	if old.status in ('Freigegeben','Finalisiert','Ersetzt')
		and (new.content is distinct from old.content
			or new.record_snapshot is distinct from old.record_snapshot
			or new.pdf_path is distinct from old.pdf_path
			or new.document_type is distinct from old.document_type) then
		raise exception 'Abgeschlossene Dokumentfassungen und ihre gespeicherten PDFs dürfen nicht überschrieben werden.';
	end if;
	if new.revision <> old.revision + 1 then
		raise exception 'Der Dokumententwurf wurde parallel geändert. Bitte neu laden und Änderungen zusammenführen.';
	end if;
	if new.status is distinct from old.status then
		if new.status = 'Zur Prüfung' then
			if old.status not in ('Entwurf','Zur Ergänzung zurückgegeben')
				or not approval_required or new.pdf_path is null then
				raise exception 'Nur vollständige, als PDF gespeicherte freigabepflichtige Entwürfe können zur Prüfung gesendet werden.';
			end if;
			select count(*) into content_values
			from jsonb_each_text(new.content) fields
			where length(btrim(fields.value)) > 0;
			if content_values < 2 then raise exception 'Vor der Prüfung müssen Dokumentfelder ausgefüllt werden.'; end if;
		elsif new.status = 'Finalisiert' then
			if old.status not in ('Entwurf','Zur Ergänzung zurückgegeben')
				or approval_required or new.created_by is distinct from auth.uid()
				or new.pdf_path is null then
				raise exception 'Dieses Dokument darf nicht ohne erforderliche unabhängige Freigabe finalisiert werden.';
			end if;
		elsif new.status = 'Freigegeben' then
			if old.status <> 'Zur Prüfung' or not approval_required
				or new.created_by = auth.uid()
				or case_item->'processWorkflow'->>'createdById' = auth.uid()::text
				or actor_tier <> code_tier
				or new.pdf_path is null then
				raise exception 'Freigabe erfordert eine unabhängige, zuständige Prüfstufe und ein gespeichertes PDF.';
			end if;
			if ceo_required and (not public.zfc_is_system_admin()
				or (select lower(btrim(position)) from public.zfc_user_profiles where id = auth.uid()) <> 'ceo'
				or old.reviewed_by = auth.uid()) then
				raise exception 'Diese Entscheidung erfordert eine unabhängige Freigabe durch ein als CEO gekennzeichnetes Konto.';
			end if;
			new.reviewed_by := auth.uid();
			new.reviewed_by_name := profile_name;
			new.approved_by := auth.uid();
			new.approved_by_name := profile_name;
		elsif new.status = 'Zur Ergänzung zurückgegeben' then
			if old.status <> 'Zur Prüfung'
				or new.created_by = auth.uid()
				or actor_tier <> code_tier
				or length(btrim(new.review_note)) = 0 then
				raise exception 'Eine Rückgabe erfordert die unabhängige Prüfstufe und eine konkrete Ergänzungsbegründung.';
			end if;
			new.reviewed_by := auth.uid();
			new.reviewed_by_name := profile_name;
		elsif new.status = 'Ersetzt' then
			if old.status not in ('Freigegeben','Finalisiert')
				or not exists (
					select 1 from public.zfc_case_documents newer
					where newer.document_id = old.document_id
						and newer.version > old.version
						and newer.status in ('Freigegeben','Finalisiert')
				)
				or new.content is distinct from old.content
				or new.record_snapshot is distinct from old.record_snapshot
				or new.pdf_path is distinct from old.pdf_path then
				raise exception 'Eine abgeschlossene Fassung kann erst nach erfolgreichem Abschluss einer neuen Version ersetzt werden.';
			end if;
		else
			raise exception 'Unzulässiger Dokumentstatuswechsel.';
		end if;
	end if;
	if old.status in ('Entwurf','Zur Ergänzung zurückgegeben') and old.created_by <> auth.uid() then
		raise exception 'Nur die erstellende Person darf diesen Entwurf bearbeiten.';
	end if;
	if new.pdf_path is distinct from old.pdf_path and new.pdf_path is not null then
		if split_part(new.pdf_path,'/',1) <> new.case_id
			or split_part(new.pdf_path,'/',2) <> new.document_id::text
			or not exists (
				select 1 from storage.objects object_row
				where object_row.bucket_id = 'case-documents' and object_row.name = new.pdf_path
			) then
			raise exception 'Die referenzierte PDF-Datei fehlt oder ist nicht der Akte und Dokumentversion zugeordnet.';
		end if;
		new.pdf_generated_at := now();
	end if;
	new.updated_at := now();
	return new;
end;
$$;

drop trigger if exists zfc_prepare_case_document on public.zfc_case_documents;
create trigger zfc_prepare_case_document
	before insert or update on public.zfc_case_documents
	for each row execute function public.zfc_prepare_case_document();

create or replace function public.zfc_record_case_document_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	profile_name text;
	actor_tier smallint := public.zfc_current_tier();
	event_name text;
	details_text text;
begin
	select coalesce(nullif(display_name,''),email) into profile_name
	from public.zfc_user_profiles where id = auth.uid();
	if tg_op = 'INSERT' then
		event_name := 'created'; details_text := 'Dokumententwurf angelegt.';
	elsif new.status is distinct from old.status then
		event_name := lower(replace(new.status,' ','_'));
		details_text := coalesce(nullif(new.review_note,''),'Status geändert: '||old.status||' → '||new.status);
	elsif new.content is distinct from old.content then
		event_name := 'content_saved'; details_text := 'Dokumentinhalt gespeichert.';
	else
		event_name := 'metadata_saved'; details_text := 'Dokumentmetadaten aktualisiert.';
	end if;
	insert into public.zfc_case_document_events(document_row_id,event_type,actor_id,actor_name,actor_tier,details)
	values (new.id,event_name,auth.uid(),coalesce(profile_name,''),actor_tier,details_text);
	return new;
end;
$$;

drop trigger if exists zfc_record_case_document_event on public.zfc_case_documents;
create trigger zfc_record_case_document_event
	after insert or update on public.zfc_case_documents
	for each row execute function public.zfc_record_case_document_event();

drop policy if exists zfc_case_documents_select on public.zfc_case_documents;
drop policy if exists zfc_case_documents_insert on public.zfc_case_documents;
drop policy if exists zfc_case_documents_update on public.zfc_case_documents;
create policy zfc_case_documents_select
	on public.zfc_case_documents for select to authenticated
	using (public.zfc_case_document_access(case_id));
create policy zfc_case_documents_insert
	on public.zfc_case_documents for insert to authenticated
	with check (public.zfc_case_document_access(case_id) and created_by = auth.uid());
create policy zfc_case_documents_update
	on public.zfc_case_documents for update to authenticated
	using (
		public.zfc_case_document_access(case_id)
		and (public.zfc_current_tier() >= 3 or created_by = auth.uid() or public.zfc_case_document_can_review(id)
			or status in ('Freigegeben','Finalisiert') and public.zfc_current_tier() >= required_tier)
	)
	with check (public.zfc_case_document_access(case_id));
revoke all on public.zfc_case_documents from anon;
grant select, insert, update on public.zfc_case_documents to authenticated;
revoke delete on public.zfc_case_documents from authenticated;

drop policy if exists zfc_case_document_events_select on public.zfc_case_document_events;
create policy zfc_case_document_events_select
	on public.zfc_case_document_events for select to authenticated
	using (exists (
		select 1 from public.zfc_case_documents doc
		where doc.id = document_row_id and public.zfc_case_document_access(doc.case_id)
	));
revoke all on public.zfc_case_document_events from anon, authenticated;
grant select on public.zfc_case_document_events to authenticated;
revoke all on function public.zfc_prepare_case_document() from public, anon, authenticated;
revoke all on function public.zfc_record_case_document_event() from public, anon, authenticated;
revoke all on function public.zfc_case_document_case(text) from public, anon;
revoke all on function public.zfc_case_document_access(text) from public, anon;
revoke all on function public.zfc_case_document_can_review(uuid) from public, anon;
grant execute on function public.zfc_case_document_access(text) to authenticated;
grant execute on function public.zfc_case_document_can_review(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('case-documents','case-documents',false,20971520,array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists zfc_case_document_pdf_select on storage.objects;
drop policy if exists zfc_case_document_pdf_insert on storage.objects;
create policy zfc_case_document_pdf_select
	on storage.objects for select to authenticated
	using (
		bucket_id = 'case-documents'
		and exists (
			select 1 from public.zfc_case_documents doc
			where doc.case_id = split_part(name,'/',1)
				and doc.document_id::text = split_part(name,'/',2)
				and doc.pdf_path = name
				and public.zfc_case_document_access(doc.case_id)
		)
	);
create policy zfc_case_document_pdf_insert
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'case-documents'
		and exists (
			select 1 from public.zfc_case_documents doc
			where doc.case_id = split_part(name,'/',1)
				and doc.document_id::text = split_part(name,'/',2)
				and public.zfc_case_document_access(doc.case_id)
				and (doc.created_by = auth.uid() or public.zfc_case_document_can_review(doc.id))
		)
	);
