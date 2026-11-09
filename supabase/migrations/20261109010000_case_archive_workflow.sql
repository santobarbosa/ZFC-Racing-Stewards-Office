-- Apply after the base schema and the case-document tables are installed.
-- Adds a Tier-2/3 close-and-submit step, a Tier-2/3 A1 assignment, and a guarded
-- final archive step with required A1 documents.

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
	completed_pdf_count integer;
	process_list jsonb;
	required_process text;
	requirement_number integer;
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
				raise exception 'Eingereichte oder archivierte Akten dürfen nicht gelöscht werden.';
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
			and (case_item - array['archiveWorkflow','activeProcessCodes','activeProcessHistory','updatedAt'])
				is distinct from (old_case - array['archiveWorkflow','activeProcessCodes','activeProcessHistory','updatedAt']) then
			raise exception 'Eingereichte Akten sind bis zum Abschluss von A1 gesperrt.';
		end if;
		if (case_item->'activeProcessCodes' is distinct from old_case->'activeProcessCodes'
				or case_item->'activeProcessHistory' is distinct from old_case->'activeProcessHistory')
			and not (new_archive->>'status'='submitted'
				and new_archive->>'a1Status'='active'
				and old_archive->>'a1Status' is distinct from 'active') then
			raise exception 'Während des A1-Abschlusses dürfen keine anderen Prozessdaten geändert werden.';
		end if;
		if old_archive is not distinct from new_archive then continue; end if;
		if actor_tier < 2 then
			raise exception 'Akten können nur von Tier 2 oder Tier 3 geschlossen und archiviert werden.';
		end if;
		if old_case is null or new_archive->>'status' not in ('submitted','archived') then
			raise exception 'Ungültiger A1-Aktenabschluss.';
		end if;
		if old_archive->>'status'='archived' then
			raise exception 'Endgültig archivierte Akten und ihr A1-Abschlussprotokoll sind unveränderlich.';
		end if;
		if jsonb_typeof(coalesce(new_archive->'history','[]'::jsonb))<>'array'
			or jsonb_typeof(coalesce(old_archive->'history','[]'::jsonb))<>'array' then
			raise exception 'Der A1-Abschluss benötigt ein unveränderliches Verlaufsprotokoll.';
		end if;
		history_length:=jsonb_array_length(coalesce(new_archive->'history','[]'::jsonb));
		if history_length<>jsonb_array_length(coalesce(old_archive->'history','[]'::jsonb))+1
			or (new_archive->'history' #- array[(history_length-1)::text]) is distinct from coalesce(old_archive->'history','[]'::jsonb) then
			raise exception 'Jeder A1-Abschlussschritt muss genau einen neuen Protokolleintrag enthalten.';
		end if;
		last_event:=new_archive->'history'->(history_length-1);
		if last_event->>'actorId' is distinct from auth.uid()::text
			or (last_event->>'actorTier')::smallint is distinct from actor_tier
			or nullif(btrim(last_event->>'reason'),'') is null then
			raise exception 'A1-Protokoll, handelnde Person und Abschlussvermerk müssen übereinstimmen.';
		end if;

		if new_archive->>'status'='submitted' then
			if old_archive='{}'::jsonb then
				if last_event->>'action' is distinct from 'submitted'
					or (new_archive->>'submittedById') is distinct from auth.uid()::text
					or (new_archive->>'submittedByTier')::smallint is distinct from actor_tier then
					raise exception 'Die Akte kann nur einmalig und durch Tier 2 oder Tier 3 zur Archivierung eingereicht werden.';
				end if;
			elsif old_archive->>'status'='submitted'
				and new_archive->>'a1Status' is distinct from old_archive->>'a1Status' then
				if new_archive->>'a1Status'='pending' then
					if actor_tier<>2 or old_archive->>'a1Status' is not null
						or last_event->>'action' is distinct from 'a1_requested'
						or (new_archive->>'a1RequestedById') is distinct from auth.uid()::text
						or (new_archive->>'a1RequestedByTier')::smallint is distinct from actor_tier then
						raise exception 'Eine A1-Anfrage darf nur einmalig durch Tier 2 eingereicht werden.';
					end if;
				elsif new_archive->>'a1Status'='active' then
					if (old_archive->>'a1Status'='pending' and actor_tier<>3)
						or (old_archive->>'a1Status' is null and actor_tier<2)
						or (old_archive->>'a1Status' is not null and old_archive->>'a1Status'<>'pending')
						or (old_archive->>'a1Status'='pending'
							and last_event->>'action' is distinct from 'a1_approved')
						or (old_archive->>'a1Status' is null
							and last_event->>'action' is distinct from 'a1_assigned')
						or (coalesce(old_case->'activeProcessCodes','[]'::jsonb) @> '["A1"]'::jsonb
							and case_item->'activeProcessCodes' is distinct from old_case->'activeProcessCodes')
						or (not coalesce(old_case->'activeProcessCodes','[]'::jsonb) @> '["A1"]'::jsonb
							and jsonb_array_length(coalesce(case_item->'activeProcessCodes','[]'::jsonb)) <> jsonb_array_length(coalesce(old_case->'activeProcessCodes','[]'::jsonb))+1)
						or not coalesce(case_item->'activeProcessCodes','[]'::jsonb) @> '["A1"]'::jsonb
						or not coalesce(case_item->'activeProcessCodes','[]'::jsonb) @> coalesce(old_case->'activeProcessCodes','[]'::jsonb)
						or jsonb_array_length(coalesce(case_item->'activeProcessHistory','[]'::jsonb)) <> jsonb_array_length(coalesce(old_case->'activeProcessHistory','[]'::jsonb))+1
						or (case_item->'activeProcessHistory' #- array[(jsonb_array_length(coalesce(case_item->'activeProcessHistory','[]'::jsonb))-1)::text]) is distinct from coalesce(old_case->'activeProcessHistory','[]'::jsonb)
						or case_item->'activeProcessHistory'->(jsonb_array_length(coalesce(case_item->'activeProcessHistory','[]'::jsonb))-1)->>'processCode' is distinct from 'A1'
						or case_item->'activeProcessHistory'->(jsonb_array_length(coalesce(case_item->'activeProcessHistory','[]'::jsonb))-1)->>'action' is distinct from 'linked'
						or case_item->'activeProcessHistory'->(jsonb_array_length(coalesce(case_item->'activeProcessHistory','[]'::jsonb))-1)->>'actorId' is distinct from auth.uid()::text
						or (case_item->'activeProcessHistory'->(jsonb_array_length(coalesce(case_item->'activeProcessHistory','[]'::jsonb))-1)->>'actorTier')::smallint is distinct from actor_tier then
						raise exception 'A1 kann durch Tier 2 oder Tier 3 zugeordnet werden; offene Anfragen bestätigt Tier 3.';
					end if;
				else
					raise exception 'Ungültiger A1-Status.';
				end if;
			else
				raise exception 'Der A1-Abschlussstatus ist nicht zulässig.';
			end if;
		elsif new_archive->>'status'='archived' then
			if old_archive->>'status' is distinct from 'submitted'
				or last_event->>'action' is distinct from 'archived'
				or (new_archive->>'archivedById') is distinct from auth.uid()::text
				or (new_archive->>'archivedByTier')::smallint is distinct from actor_tier
				or new_archive->>'a1Status' is distinct from 'active'
				or not coalesce(case_item->'activeProcessCodes','[]'::jsonb) @> '["A1"]'::jsonb then
				raise exception 'Die endgültige Ablage erfordert einen aktiven und bestätigten Prozess A1.';
			end if;

			select count(distinct doc.document_type||':'||encode(digest(doc.content::text,'sha256'),'hex'))
			into completed_pdf_count
			from public.zfc_case_documents doc
			join storage.objects object_row on object_row.bucket_id='case-documents' and object_row.name=doc.pdf_path
			where doc.case_id=case_item->>'id'
				and doc.status in ('Freigegeben','Finalisiert')
				and doc.pdf_path is not null
				and jsonb_typeof(doc.content)='object'
				and exists(select 1 from jsonb_each_text(doc.content) fields where length(btrim(fields.value))>0);
			if coalesce(completed_pdf_count,0)<5 then
				raise exception 'A1-Abschluss gesperrt: mindestens fünf unterschiedliche, vollständige PDF-Dokumente sind erforderlich.';
			end if;

			if case_item->>'documentClosureRoute'='early' then
				process_list:=jsonb_build_array('EARLY','A1');
			else
				process_list:=coalesce(case_item->'activeProcessCodes','[]'::jsonb);
				if case_item->>'processCode' is not null and not process_list @> to_jsonb(case_item->>'processCode') then
					process_list:=process_list||jsonb_build_array(case_item->>'processCode');
				end if;
				if not process_list @> '["A1"]'::jsonb then process_list:=process_list||'["A1"]'::jsonb; end if;
			end if;
			for required_process in select jsonb_array_elements_text(process_list)
			loop
				for requirement_number in 1..5
				loop
					if not exists (
						select 1 from public.zfc_case_documents doc
						join storage.objects object_row on object_row.bucket_id='case-documents' and object_row.name=doc.pdf_path
						where doc.case_id=case_item->>'id'
							and doc.status in ('Freigegeben','Finalisiert')
							and doc.pdf_path is not null
							and doc.required_for @> jsonb_build_array(jsonb_build_object('processCode',required_process,'index',requirement_number))
					) then
						raise exception 'A1-Abschluss gesperrt: Pflichtunterlage % von Prozess % fehlt.',requirement_number,required_process;
					end if;
				end loop;
			end loop;
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
