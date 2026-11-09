-- Restore the Tier-3 document deletion RPC used by the app.
create or replace function public.zfc_delete_case_documents(p_case_id text default null, p_document_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
	deleted_count integer;
begin
	if auth.uid() is null or public.zfc_current_tier() < 3 then
		raise exception 'Das endgültige Löschen von Dokumenten ist Tier 3 vorbehalten.';
	end if;
	if (p_case_id is null) = (p_document_id is null) then
		raise exception 'Genau eine Akte oder Dokument-ID muss zum Löschen angegeben werden.';
	end if;
	if p_case_id is not null and exists (
		select 1
		from public.zfc_app_state app_state
		cross join lateral jsonb_array_elements(coalesce(app_state.state->'cases','[]'::jsonb)) as case_item(value)
		where app_state.id=1
			and case_item.value->>'id'=p_case_id
			and case_item.value->'archiveWorkflow'->>'status'='submitted'
	) then
		raise exception 'Eingereichte Akten müssen zuerst durch Tier 3 endgültig archiviert werden.';
	end if;
	if p_document_id is not null and exists (
		select 1
		from public.zfc_case_documents doc
		join public.zfc_app_state app_state on app_state.id=1
		cross join lateral jsonb_array_elements(coalesce(app_state.state->'cases','[]'::jsonb)) as case_item(value)
		where doc.document_id=p_document_id
			and case_item.value->>'id'=doc.case_id
			and case_item.value->'archiveWorkflow'->>'status'='submitted'
	) then
		raise exception 'Dokumente einer eingereichten Akte können nicht gelöscht werden.';
	end if;

	delete from public.zfc_case_document_events doc_event
	using public.zfc_case_documents doc
	where doc_event.document_row_id=doc.id
		and (
			(p_case_id is not null and doc.case_id=p_case_id)
			or (p_document_id is not null and doc.document_id=p_document_id)
		);
	delete from public.zfc_case_documents doc
	where (p_case_id is not null and doc.case_id=p_case_id)
		or (p_document_id is not null and doc.document_id=p_document_id);
	get diagnostics deleted_count = row_count;
	return deleted_count;
end;
$$;
revoke all on function public.zfc_delete_case_documents(text, uuid) from public, anon, authenticated;
grant execute on function public.zfc_delete_case_documents(text, uuid) to authenticated;

create or replace function public.zfc_delete_case(p_case_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	current_state jsonb;
	next_state jsonb;
	case_record jsonb;
	actor_name text;
	audit_entry jsonb;
begin
	if auth.uid() is null or public.zfc_current_tier() < 3 then
		raise exception 'Das endgültige Löschen von Akten und Vorgängen ist Tier 3 vorbehalten.';
	end if;
	if nullif(btrim(p_case_id),'') is null then
		raise exception 'Eine Akten-ID ist erforderlich.';
	end if;

	select state into current_state
	from public.zfc_app_state
	where id=1
	for update;
	if current_state is null then
		raise exception 'Der gemeinsame Aktenbestand ist nicht verfügbar.';
	end if;
	select value into case_record
	from jsonb_array_elements(coalesce(current_state->'cases','[]'::jsonb)) as cases(value)
	where value->>'id'=p_case_id
	limit 1;
	if case_record is null then
		raise exception 'Die Akte wurde in der gemeinsamen Datenbank nicht gefunden.';
	end if;
	if case_record->'archiveWorkflow'->>'status'='submitted' then
		raise exception 'Eingereichte Akten müssen zuerst durch Tier 3 endgültig archiviert werden.';
	end if;

	select coalesce(display_name,email,'Tier 3') into actor_name
	from public.zfc_user_profiles
	where id=auth.uid();
	delete from public.zfc_case_document_events doc_event
	using public.zfc_case_documents doc
	where doc_event.document_row_id=doc.id and doc.case_id=p_case_id;
	delete from public.zfc_case_documents doc where doc.case_id=p_case_id;

	audit_entry:=jsonb_build_object(
		'caseId',p_case_id,
		'stw',coalesce(case_record->>'stw',''),
		'event',coalesce(case_record->>'event',''),
		'deletedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint,
		'deletedById',auth.uid()::text,
		'deletedByName',coalesce(actor_name,'Tier 3'),
		'deletedByTier',3
	);
	next_state:=jsonb_set(
		coalesce(current_state,'{}'::jsonb),
		'{cases}',
		coalesce((
			select jsonb_agg(value order by ordinal)
			from jsonb_array_elements(coalesce(current_state->'cases','[]'::jsonb)) with ordinality as cases(value,ordinal)
			where value->>'id' is distinct from p_case_id
		),'[]'::jsonb),
		true
	);
	next_state:=jsonb_set(
		next_state,
		'{deletedCaseLog}',
		coalesce(next_state->'deletedCaseLog','[]'::jsonb)||jsonb_build_array(audit_entry),
		true
	);
	update public.zfc_app_state
	set state=next_state,updated_at=now()
	where id=1
	returning state into next_state;
	return next_state;
end;
$$;
revoke all on function public.zfc_delete_case(text) from public, anon, authenticated;
grant execute on function public.zfc_delete_case(text) to authenticated;
notify pgrst, 'reload schema';
