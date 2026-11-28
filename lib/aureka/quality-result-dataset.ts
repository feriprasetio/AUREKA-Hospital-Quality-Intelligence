import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllPages } from '@/lib/aureka/pagination'
import type { IndicatorProfileForResults, ResultRecord } from '@/lib/aureka/quality-results-engine'
type IndicatorResponseReview = { record_id: string; indicator_id: string; review_status: string | null; response_code?: number | null; response_label?: string | null; raw_value?: Record<string, any> | null }
export type IndicatorResultDataset={profiles:IndicatorProfileForResults[];rows:ResultRecord[]}
/** One read path for Hasil Capaian and public INM: same profile versions, record fields and review hydration. */
export async function readIndicatorResultDataset(client:SupabaseClient,year:number,selectedRoom:number|null,signal:AbortSignal,inmOnly=false):Promise<IndicatorResultDataset>{
  const q=()=>client.schema('aureka_quality')
        const indicatorRecordSelect = 'id,room_id,profile_year,record_date,status,created_at,updated_at,indicator_values:core_data->indicator_values,source_import:core_data->source_import,core_record_date:core_data->>record_date,form_fields:core_data->form_fields,form_data:core_data->form_data,admission_at:core_data->>admission_at,admit:core_data->>admit'
        const profileQuery = readAllPages<IndicatorProfileForResults>((from, to) => {
          let request = q().from('indicator_profiles')
            .select('id,room_id,code,title,indicator_type,unit_of_measure,target_text,target_operator,target_value,numerator_definition,denominator_definition,measurement_grain,schema_json,options_json')
            .eq('profile_year', year).eq('status', 'published').eq('is_active', true)
            .order('room_id').order('code').order('id')
          if (selectedRoom != null) request = request.eq('room_id', selectedRoom)
          if (inmOnly) request = request.ilike('indicator_type', 'INM%')
          return request.range(from, to).abortSignal(signal)
        })
        const recordQuery = (roomIds?:number[]) => readAllPages<ResultRecord>((from, to) => {
          let request: any = q().from('quality_records')
            .select(indicatorRecordSelect)
            .eq('profile_year', year)
            .neq('status', 'archived')
          if (selectedRoom != null) request = request.eq('room_id', selectedRoom)
          if (inmOnly) request = request.eq('status','validated').in('room_id', roomIds ?? [])
          return request.order('created_at', { ascending: false }).order('id').range(from, to).abortSignal(signal)
        })
        const [activeProfiles, loadedRecords] = inmOnly ? await (async()=>{
          const profiles=await profileQuery
          const roomIds=[...new Set(profiles.map(p=>Number(p.room_id)))].filter(n=>Number.isSafeInteger(n)&&n>0)
          if (!roomIds.length) throw new Error('Profil INM aktif belum tersedia.')
          return [profiles,await recordQuery(roomIds)] as const
        })() : await Promise.all([profileQuery, recordQuery()])
        if (signal.aborted) throw new Error('Permintaan dibatalkan.')
        const records = loadedRecords.map((row: any): ResultRecord => ({
            ...row,
            core_data: {
              indicator_values: row.indicator_values ?? {},
              ...(row.form_fields != null || row.form_data != null ? { form_fields: row.form_fields ?? row.form_data ?? {} } : {}),
              ...(row.admission_at != null ? { admission_at: row.admission_at } : {}),
              ...(row.core_record_date != null ? { record_date: row.core_record_date } : {}),
              ...(row.admit != null ? { admit: row.admit } : {}),
              ...(row.source_import != null ? { source_import: row.source_import } : {}),
            },
          }))

        // Reconciliation decisions live in quality_record_responses, not inside
        // quality_records.core_data. Hydrate the per-indicator review status before
        // calculation so a ready logbook cannot bypass an outstanding mapping review.
        const profileById = new Map(activeProfiles.map(profile => [String(profile.id ?? ''), profile]))
        const reviewRows: IndicatorResponseReview[] = []
        if (profileById.size) {
          const recordIds = records.map(row => String(row.id))
          const batches: string[][] = []
          for (let from = 0; from < recordIds.length; from += 100) batches.push(recordIds.slice(from, from + 100))
          for (let from = 0; from < batches.length; from += 6) {
            if (signal.aborted) throw new Error('Permintaan dibatalkan.')
            const results = await Promise.all(batches.slice(from, from + 6).map(ids =>
              readAllPages<IndicatorResponseReview>((start, end) => q().from('quality_record_responses')
                .select('record_id,indicator_id,review_status,response_code,response_label,raw_value')
                .in('record_id', ids).order('record_id').order('indicator_id')
                .range(start, end).abortSignal(signal)),
            ))
            for (const rows of results) for (const row of rows) {
              if (profileById.has(String(row.indicator_id))) reviewRows.push(row)
            }
          }
        }
        const rowById = new Map<string, ResultRecord>()
        records.forEach((row) => rowById.set(String(row.id), row))
        const reviewByRecordProfile = new Map<string, string>()
        const normalizedResponseByKey = new Map<string, IndicatorResponseReview>()
        for (const item of reviewRows) {
          const key = String(item.record_id) + '|' + String(item.indicator_id)
          const status = String(item.review_status ?? 'pending').trim().toLowerCase() || 'pending'
          const existing = reviewByRecordProfile.get(key)
          const isApproved = (value: string) => value === 'classified' || value === 'not_required'
          if (!normalizedResponseByKey.has(key)) normalizedResponseByKey.set(key,item)
          // Any unknown/pending duplicate must never be downgraded by an approved row.
          if (!existing || (!isApproved(status) && isApproved(existing))) reviewByRecordProfile.set(key, status)
        }
        for (const [key, reviewStatus] of reviewByRecordProfile) {
          const separator = key.indexOf('|')
          const recordId = key.slice(0, separator)
          const indicatorId = key.slice(separator + 1)
          const row: any = rowById.get(recordId)
          const profile = profileById.get(indicatorId)
          if (!row || !profile) continue
          const values = { ...(row.core_data?.indicator_values ?? {}) }
          const codeKey = String(profile.code ?? '')
          const idKey = String(profile.id ?? '')
          const valueKey = Object.prototype.hasOwnProperty.call(values, codeKey) ? codeKey
            : Object.prototype.hasOwnProperty.call(values, idKey) ? idKey : ''
          if (!valueKey || !values[valueKey] || typeof values[valueKey] !== 'object') {
            const response=normalizedResponseByKey.get(key)
            if (!response) continue
            const raw=response.raw_value&&typeof response.raw_value==='object'?response.raw_value:{}
            if (!Object.keys(raw).length && response.response_label == null && response.response_code == null) continue
            values[codeKey]={...raw,answer:raw.answer??response.response_label??'',code:raw.code??response.response_code??null,review_status:reviewStatus}
          } else {
            values[valueKey] = { ...values[valueKey], review_status: reviewStatus }
          }
          row.core_data = { ...(row.core_data ?? {}), indicator_values: values }
        }
        if (signal.aborted) throw new Error('Permintaan dibatalkan.')

  return {profiles:activeProfiles,rows:records}
}
