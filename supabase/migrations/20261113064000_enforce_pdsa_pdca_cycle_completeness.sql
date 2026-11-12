-- Preserve explicit relinking and clearing of optional action assignments when editing an RTL.
create or replace function public.aureka_gov_save_action(p jsonb)
returns uuid language plpgsql security definer
set search_path = aureka_governance, aureka_system, public, auth as $$
declare v record; v_id uuid := nullif(p->>'id','')::uuid; a record; v_method text;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  v_method := coalesce(nullif(p->>'improvement_method',''),'PDSA');
  if v_method not in ('PDSA','PDCA') then raise exception 'Metode perbaikan harus PDSA atau PDCA.'; end if;
  if v_id is null then
    if length(trim(coalesce(p->>'cycle_plan',''))) < 5 or length(trim(coalesce(p->>'cycle_do',''))) < 5
       or length(trim(coalesce(p->>'cycle_study_check',''))) < 5 or length(trim(coalesce(p->>'cycle_act',''))) < 5 then
      raise exception 'Lengkapi seluruh tahap Plan, Do, Study/Check, dan Act sebelum menyimpan RTL.';
    end if;
    if v.role_code not in ('ADMIN','PMKP') then raise exception 'Hanya Komite PMKP / Super Admin yang dapat membuat RTL.'; end if;
    insert into aureka_governance.actions
      (recommendation_id,parent_action_id,title,description,responsible_level,assigned_to_name,assigned_room_id,due_date,
       expected_output,improvement_method,cycle_plan,cycle_do,cycle_study_check,cycle_act)
    values
      (nullif(p->>'recommendation_id','')::uuid,nullif(p->>'parent_action_id','')::uuid,p->>'title',coalesce(p->>'description',''),
       p->>'responsible_level',nullif(p->>'assigned_to_name',''),nullif(p->>'assigned_room_id','')::bigint,
       nullif(p->>'due_date','')::date,coalesce(p->>'expected_output',''),v_method,
       coalesce(p->>'cycle_plan',''),coalesce(p->>'cycle_do',''),coalesce(p->>'cycle_study_check',''),coalesce(p->>'cycle_act',''))
    returning id into v_id;
    perform aureka_governance.write_audit('create','action',v_id::text,p);
    return v_id;
  end if;
  select * into a from aureka_governance.actions where id=v_id;
  if not found then raise exception 'RTL tidak ditemukan.'; end if;
  if (p ? 'improvement_method' or p ? 'cycle_plan' or p ? 'cycle_do' or p ? 'cycle_study_check' or p ? 'cycle_act') and (
       length(trim(coalesce(p->>'cycle_plan',a.cycle_plan))) < 5 or
       length(trim(coalesce(p->>'cycle_do',a.cycle_do))) < 5 or
       length(trim(coalesce(p->>'cycle_study_check',a.cycle_study_check))) < 5 or
       length(trim(coalesce(p->>'cycle_act',a.cycle_act))) < 5
     ) then
    raise exception 'Lengkapi seluruh tahap Plan, Do, Study/Check, dan Act sebelum menyimpan RTL.';
  end if;
  if v.role_code in ('ADMIN','PMKP') then
    update aureka_governance.actions set
      recommendation_id=case when p ? 'recommendation_id' then nullif(p->>'recommendation_id','')::uuid else recommendation_id end,
      parent_action_id=case when p ? 'parent_action_id' then nullif(p->>'parent_action_id','')::uuid else parent_action_id end,
      title=coalesce(nullif(p->>'title',''),title),description=coalesce(p->>'description',description),
      responsible_level=coalesce(nullif(p->>'responsible_level',''),responsible_level),
      assigned_to_name=case when p ? 'assigned_to_name' then nullif(p->>'assigned_to_name','') else assigned_to_name end,
      assigned_room_id=case when p ? 'assigned_room_id' then nullif(p->>'assigned_room_id','')::bigint else assigned_room_id end,
      due_date=case when p ? 'due_date' then nullif(p->>'due_date','')::date else due_date end,
      expected_output=coalesce(p->>'expected_output',expected_output),
      improvement_method=coalesce(nullif(p->>'improvement_method',''),improvement_method),
      cycle_plan=coalesce(p->>'cycle_plan',cycle_plan),cycle_do=coalesce(p->>'cycle_do',cycle_do),
      cycle_study_check=coalesce(p->>'cycle_study_check',cycle_study_check),cycle_act=coalesce(p->>'cycle_act',cycle_act),
      status=coalesce(nullif(p->>'status',''),status),progress_note=coalesce(p->>'progress_note',progress_note),
      evidence_url=case when p ? 'evidence_url' then nullif(p->>'evidence_url','') else evidence_url end,updated_at=now()
    where id=v_id;
  elsif (a.responsible_level=v.role_code) or
    (a.responsible_level='UNIT' and v.role_code in ('PIC','VALIDATOR') and a.assigned_room_id=v.room_id) then
    if coalesce(p->>'status','') not in ('','berjalan','selesai') then
      raise exception 'Penanggung jawab hanya dapat mengubah status ke berjalan/selesai.';
    end if;
    update aureka_governance.actions set status=coalesce(nullif(p->>'status',''),status),
      progress_note=coalesce(p->>'progress_note',progress_note),
      evidence_url=case when p ? 'evidence_url' then nullif(p->>'evidence_url','') else evidence_url end,updated_at=now()
    where id=v_id;
  else
    raise exception 'RTL ini bukan dalam lingkup penugasan Anda.';
  end if;
  perform aureka_governance.write_audit('update','action',v_id::text,p);
  return v_id;
end;
$$;
revoke all on function public.aureka_gov_save_action(jsonb) from public,anon;
grant execute on function public.aureka_gov_save_action(jsonb) to authenticated;
