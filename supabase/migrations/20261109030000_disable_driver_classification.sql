-- Disable the retired driver-classification API while preserving its historical data.
do $$
begin
	if to_regclass('public.zfc_driver_classification_config') is not null then
		execute 'drop trigger if exists zfc_record_driver_classification_config on public.zfc_driver_classification_config';
		execute 'drop policy if exists zfc_driver_classification_config_tier3_all on public.zfc_driver_classification_config';
		execute 'revoke all on public.zfc_driver_classification_config from public, anon, authenticated';
	end if;
	if to_regclass('public.zfc_driver_classification_config_history') is not null then
		execute 'drop policy if exists zfc_driver_classification_config_history_tier3_select on public.zfc_driver_classification_config_history';
		execute 'revoke all on public.zfc_driver_classification_config_history from public, anon, authenticated';
	end if;
	if to_regclass('public.zfc_driver_classifications') is not null then
		execute 'drop policy if exists zfc_driver_classifications_tier3_select on public.zfc_driver_classifications';
		execute 'revoke all on public.zfc_driver_classifications from public, anon, authenticated';
	end if;
	if to_regclass('public.zfc_driver_classification_events') is not null then
		execute 'drop policy if exists zfc_driver_classification_events_tier3_select on public.zfc_driver_classification_events';
		execute 'revoke all on public.zfc_driver_classification_events from public, anon, authenticated';
	end if;
	if to_regclass('public.zfc_driver_classification_reports') is not null then
		execute 'drop policy if exists zfc_driver_classification_reports_tier3_select on public.zfc_driver_classification_reports';
		execute 'revoke all on public.zfc_driver_classification_reports from public, anon, authenticated';
	end if;
	if to_regclass('public.zfc_driver_classification_report_files') is not null then
		execute 'revoke all on public.zfc_driver_classification_report_files from public, anon, authenticated';
	end if;
	if to_regclass('public.zfc_driver_classification_number_seq') is not null then
		execute 'revoke all on sequence public.zfc_driver_classification_number_seq from public, anon, authenticated';
	end if;
end;
$$;

drop function if exists public.zfc_save_driver_classification(uuid, jsonb, jsonb, integer, text, text);
drop function if exists public.zfc_decide_driver_classification(uuid, text, text, text, jsonb);
drop function if exists public.zfc_record_driver_classification_config();
notify pgrst, 'reload schema';
