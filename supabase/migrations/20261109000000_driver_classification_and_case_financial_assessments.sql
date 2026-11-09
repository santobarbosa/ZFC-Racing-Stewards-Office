-- Apply this migration in the Supabase SQL Editor to expose the classification
-- configuration table and add role-protected financial assessments to cases.

create table if not exists public.zfc_driver_classification_config (
	id integer primary key check (id = 1),
	config jsonb not null,
	updated_by uuid,
	updated_at timestamptz not null default now()
);

create table if not exists public.zfc_driver_classification_config_history (
	id uuid primary key default gen_random_uuid(),
	config jsonb not null,
	actor_id uuid,
	actor_name text not null,
	created_at timestamptz not null default now()
);

insert into public.zfc_driver_classification_config (id, config)
values (
	1,
	'{
		"tracks":[
			{"id":"australia","name":"Australien","referenceSeconds":null},
			{"id":"bahrain","name":"Bahrain","referenceSeconds":null},
			{"id":"belgium","name":"Belgien","referenceSeconds":null}
		],
		"weights":{"timeTrial":40,"racePace":25,"consistency":20,"safety":15},
		"divisions":[
			{"name":"D1","minRating":800,"minSafety":80},
			{"name":"D2","minRating":600,"minSafety":60},
			{"name":"D3","minRating":0,"minSafety":0}
		],
		"timePenaltyPerPercent":100
	}'::jsonb
)
on conflict (id) do nothing;

alter table public.zfc_driver_classification_config enable row level security;
alter table public.zfc_driver_classification_config_history enable row level security;

drop policy if exists zfc_driver_classification_config_tier3_all on public.zfc_driver_classification_config;
create policy zfc_driver_classification_config_tier3_all
	on public.zfc_driver_classification_config for all to authenticated
	using (public.zfc_current_tier() >= 3)
	with check (public.zfc_current_tier() >= 3);

drop policy if exists zfc_driver_classification_config_history_tier3_select on public.zfc_driver_classification_config_history;
create policy zfc_driver_classification_config_history_tier3_select
	on public.zfc_driver_classification_config_history for select to authenticated
	using (public.zfc_current_tier() >= 3);

revoke all on public.zfc_driver_classification_config,
	public.zfc_driver_classification_config_history from anon, authenticated;
grant select, insert, update, delete on public.zfc_driver_classification_config to authenticated;
grant select on public.zfc_driver_classification_config_history to authenticated;

create or replace function public.zfc_record_driver_classification_config()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	actor uuid := coalesce(auth.uid(), new.updated_by);
	actor_label text;
begin
	select coalesce(nullif(display_name,''), email) into actor_label
	from public.zfc_user_profiles where id = actor;
	insert into public.zfc_driver_classification_config_history (config, actor_id, actor_name)
	values (new.config, actor, coalesce(actor_label, 'System'));
	return new;
end;
$$;

revoke all on function public.zfc_record_driver_classification_config() from public, anon, authenticated;
drop trigger if exists zfc_record_driver_classification_config on public.zfc_driver_classification_config;
create trigger zfc_record_driver_classification_config
	after insert or update on public.zfc_driver_classification_config
	for each row execute function public.zfc_record_driver_classification_config();

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
