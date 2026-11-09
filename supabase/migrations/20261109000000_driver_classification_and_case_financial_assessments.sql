create table if not exists public.zfc_case_financial_assessments (
	case_id text primary key,
	estimated_amount numeric(12,2) not null check (estimated_amount >= 0),
	currency text not null default 'EUR' check (currency in ('EUR','CHF','USD','GBP')),
	assessment_notes text not null check (char_length(btrim(assessment_notes)) > 0),
	created_by uuid references public.zfc_user_profiles(id),
	created_by_name text not null default '',
	created_by_tier smallint not null default 2 check (created_by_tier between 2 and 3),
	created_at timestamptz not null default now(),
	updated_by uuid references public.zfc_user_profiles(id),
	updated_by_name text not null default '',
	updated_by_tier smallint not null default 2 check (updated_by_tier between 2 and 3),
	updated_at timestamptz not null default now()
);

alter table public.zfc_case_financial_assessments enable row level security;
drop policy if exists zfc_case_financial_assessments_tier2_all on public.zfc_case_financial_assessments;
create policy zfc_case_financial_assessments_tier2_all on public.zfc_case_financial_assessments
	for all to authenticated
	using (public.zfc_current_tier() >= 2)
	with check (public.zfc_current_tier() >= 2);

revoke all on public.zfc_case_financial_assessments from anon, authenticated;
grant select, insert, update on public.zfc_case_financial_assessments to authenticated;

create or replace function public.zfc_stamp_case_financial_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	actor_tier smallint := public.zfc_current_tier();
	actor_label text;
begin
	if actor_tier < 2 or auth.uid() is null then
		raise exception 'Finanzielle Einschätzungen dürfen nur von Tier 2 und Tier 3 gespeichert werden.';
	end if;
	select coalesce(nullif(display_name,''), email) into actor_label
	from public.zfc_user_profiles where id = auth.uid();
	if tg_op = 'UPDATE' then
		new.created_by := old.created_by;
		new.created_by_name := old.created_by_name;
		new.created_by_tier := old.created_by_tier;
		new.created_at := old.created_at;
	else
		new.created_by := auth.uid();
		new.created_by_name := coalesce(actor_label, 'Tier ' || actor_tier::text);
		new.created_by_tier := actor_tier;
	end if;
	new.updated_by := auth.uid();
	new.updated_by_name := coalesce(actor_label, 'Tier ' || actor_tier::text);
	new.updated_by_tier := actor_tier;
	new.updated_at := now();
	return new;
end;
$$;

revoke all on function public.zfc_stamp_case_financial_assessment() from public, anon, authenticated;
drop trigger if exists zfc_stamp_case_financial_assessment on public.zfc_case_financial_assessments;
create trigger zfc_stamp_case_financial_assessment
	before insert or update on public.zfc_case_financial_assessments
	for each row execute function public.zfc_stamp_case_financial_assessment();

notify pgrst, 'reload schema';
