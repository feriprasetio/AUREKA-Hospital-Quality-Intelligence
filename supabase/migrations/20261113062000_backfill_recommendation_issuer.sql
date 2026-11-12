-- Backfill the stakeholder source from legacy free-text labels without changing existing recommendation content.
update aureka_governance.recommendations
set issued_by_level = case
  when lower(coalesce(given_by_name,'')) like '%dewan%' then 'DEWAN_PENGAWAS'
  when lower(coalesce(given_by_name,'')) like '%direktur%' then 'DIREKTUR'
  when lower(coalesce(given_by_name,'')) like '%kabid%' or lower(coalesce(given_by_name,'')) like '%kepala bidang%' then 'KABID'
  when lower(coalesce(given_by_name,'')) like '%ketua pmkp%' then 'KETUA_PMKP'
  else issued_by_level
end
where issued_by_level='KETUA_PMKP'
  and lower(coalesce(given_by_name,'')) ~ '(dewan|direktur|kabid|kepala bidang|ketua pmkp)';
