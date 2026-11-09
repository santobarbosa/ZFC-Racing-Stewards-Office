-- Apply after the base schema and the case-document tables are installed.
-- Adds direct archive submission and a Tier-3-only final archive step.

-- Archive submissions can be finalized directly by Tier 3 without an A1 process.
create or replace function public.zfc_validate_case_archive_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	actor_tier smallint := public.zfc_current_tier();
	old_state jsonb := '{}'::jsonb;
	case_item jsonb;
	old_case jsonb;
	old_archive jsonb;
	new_archive jsonb;
	last_event jsonb;
	history_length integer;
begin
	if auth.uid() is null or actor_tier < 1 then
		raise exception 'Anmeldung und gültiges Tier-Profil sind für den Aktenabschluss erforderlich.';
	end if;
	if tg_op = 'UPDATE' then
		old_state := coalesce(old.state, '{}'::jsonb);
		for old_case in select value from jsonb_array_elements(coalesce(old_state->'cases','[]'::jsonb))
		loop
			if old_case->'archiveWorkflow'->>'status' in ('submitted','archived')
				and not exists (
					select 1
					from jsonb_array_elements(coalesce(new.state->'cases','[]'::jsonb)) as new_cases(value)
					where value->>'id'=old_case->>'id'
				) then
				if old_case->'archiveWorkflow'->>'status'<>'archived' or actor_tier<>3 then
					raise exception 'Eingereichte Akten dürfen nicht gelöscht werden; archivierte Akten darf nur Tier 3 endgültig löschen.';
				end if;
			end if;
		end loop;
	end if;

	for case_item in select value from jsonb_array_elements(coalesce(new.state->'cases','[]'::jsonb))
	loop
		if case_item->>'id' is null then continue; end if;
		old_case := null;
		select value into old_case
		from jsonb_array_elements(coalesce(old_state->'cases','[]'::jsonb)) as old_cases(value)
		where value->>'id'=case_item->>'id'
		limit 1;
		new_archive := coalesce(case_item->'archiveWorkflow','{}'::jsonb);
		old_archive := coalesce(old_case->'archiveWorkflow','{}'::jsonb);

		if old_archive->>'status'='archived' and case_item is distinct from old_case then
			raise exception 'Endgültig archivierte Akten sind unveränderlich.';
		end if;
		if old_archive->>'status'='submitted'
			and (case_item - array['archiveWorkflow','updatedAt'])
				is distinct from (old_case - array['archiveWorkflow','updatedAt']) then
			raise exception 'Eingereichte Akten sind bis zum endgültigen Abschluss durch Tier 3 gesperrt.';
		end if;
		if old_archive is not distinct from new_archive then continue; end if;
		if old_case is null or new_archive->>'status' is null or new_archive->>'status' not in ('submitted','archived') then
			raise exception 'Ungültiger Archivierungsstatus.';
		end if;
		if old_archive->>'status'='archived' then
			raise exception 'Endgültig archivierte Akten und ihr Protokoll sind unveränderlich.';
		end if;
		if jsonb_typeof(coalesce(new_archive->'history','[]'::jsonb))<>'array'
			or jsonb_typeof(coalesce(old_archive->'history','[]'::jsonb))<>'array' then
			raise exception 'Die Archivierung benötigt ein unveränderliches Verlaufsprotokoll.';
		end if;
		history_length:=jsonb_array_length(coalesce(new_archive->'history','[]'::jsonb));
		if history_length<>jsonb_array_length(coalesce(old_archive->'history','[]'::jsonb))+1
			or (new_archive->'history' #- array[(history_length-1)::text]) is distinct from coalesce(old_archive->'history','[]'::jsonb) then
			raise exception 'Jeder Archivierungsschritt muss genau einen neuen Protokolleintrag enthalten.';
		end if;
		last_event:=new_archive->'history'->(history_length-1);
		if last_event->>'actorId' is distinct from auth.uid()::text
			or (last_event->>'actorTier')::smallint is distinct from actor_tier
			or nullif(btrim(last_event->>'reason'),'') is null then
			raise exception 'Archivprotokoll, handelnde Person und Abschlussvermerk müssen übereinstimmen.';
		end if;

		if new_archive->>'status'='submitted' then
			if old_archive<>'{}'::jsonb or actor_tier<2
				or last_event->>'action' is distinct from 'submitted'
				or new_archive->>'submittedById' is distinct from auth.uid()::text
				or (new_archive->>'submittedByTier')::smallint is distinct from actor_tier then
				raise exception 'Eine Akte kann nur einmalig durch Tier 2 oder Tier 3 eingereicht werden.';
			end if;
		elsif new_archive->>'status'='archived' then
			if old_archive->>'status' is distinct from 'submitted'
				or actor_tier<>3
				or last_event->>'action' is distinct from 'archived'
				or new_archive->>'archivedById' is distinct from auth.uid()::text
				or (new_archive->>'archivedByTier')::smallint is distinct from 3
				or new_archive->>'submittedById' is distinct from old_archive->>'submittedById'
				or new_archive->>'submittedByTier' is distinct from old_archive->>'submittedByTier'
				or new_archive->>'submittedAt' is distinct from old_archive->>'submittedAt' then
				raise exception 'Die endgültige Archivierung ist ausschließlich Tier 3 vorbehalten.';
			end if;
		end if;
	end loop;
	return new;
end;
$$;

drop trigger if exists zfc_validate_case_archive_workflow on public.zfc_app_state;
create trigger zfc_validate_case_archive_workflow
	before insert or update of state on public.zfc_app_state
	for each row execute function public.zfc_validate_case_archive_workflow();
revoke all on function public.zfc_validate_case_archive_workflow() from public, anon, authenticated;
