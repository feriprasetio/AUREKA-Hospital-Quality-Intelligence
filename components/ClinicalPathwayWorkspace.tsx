'use client'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'
import { toUserFacingError } from '@/lib/ui/error-feedback'

import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { LiquidGlass, LiquidGlassButton } from '@/components/LiquidGlass'
import ClinicalPathwayTextMiningPanel from '@/components/ClinicalPathwayTextMiningPanel'
import type { ClinicalTextMiningItem, ClinicalTextMiningSuggestion } from '@/lib/clinical-pathway/text-mining'
import { aurekaConfirm } from '@/components/ui/aurekaConfirm'

type Policy = 'required' | 'conditional' | 'not_scheduled'
type CellStatus = 'done' | 'not_done' | 'not_applicable' | ''
type ScheduleCell = { day: string; policy: Policy }
type CPItem = {
  id: string; section: string; profession: string; choice: string; stage: string
  label: string; detail: string; schedule: ScheduleCell[]; oppe?: boolean
  substage?: string
  text_mining?: NonNullable<ClinicalTextMiningItem['text_mining']>
}
type PPANameField = { key: string; label: string; profession: string }
type Criterion = { id: string; label: string; type?: string; expected?: boolean }
type Template = {
  code: string; name: string; icd10: string; source_filename: string; status: string
  version: number; days: string[]; items: CPItem[]
  clinical_fields: { id: string; label: string; hint: string; code_label: string; additional_label: string; options?: string[] }[]
  source_notes: string[]
  scoring_rules: {
    completion_threshold_pct: number; compliance_target_pct: number
    completion_definition: string; compliance_definition: string; variation_required: boolean
    variation_definition: string; inclusion_mode: string; inclusion_criteria: Criterion[]
    source_section_d: { item: string; standard: string; source_result: string }[]
  }
}
type CellAnswer = {
  status?: CellStatus; performer_name?: string; performer_profession?: string
  performed_at?: string; evidence?: string; note?: string
}
type Answers = Record<string, Record<string, CellAnswer>>
type Variation = { id: string; date: string; item_id?: string; variation: string; reason: string; justification: string }
type VariationState = { reviewed: boolean; items: Variation[] }
type AuditForm = {
  id?: string; room_id: number | null; template: Template; patient_name: string
  medical_record_no: string; sex: string; date_of_birth: string; admission_date: string
  discharge_date: string; unit_name: string; dpjp: string; clinical_data: Record<string, string>
  ppa_names: Record<string, string>; selected_items_json: Record<string, boolean>; additional_phases_json: string[]
  inclusion_json: Record<string, boolean | undefined>; answers_json: Answers
  variations_json: VariationState; status: string
}
type AuditRow = {
  id: string; room_id: number; template_code: string; template_name: string
  patient_name: string; medical_record_no: string; admission_date: string | null
  status: string; calculation_json: Record<string, any>; created_at: string
  unit_name?: string
}
type Room = { id: number; name: string }
type StaffOption = { id: string; employee_code: string; display_name: string; profession_group: string; position_title: string; room_id: number; room_name: string }
type Props = { initialRoomId: number | null; rooms: Room[]; isAdmin: boolean; userName: string; onBack: () => void; lockRoomScope?: boolean }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '/AUREKA-Hospital-Quality-Intelligence'
const STATUS_LABEL: Record<string, string> = { draft: 'Draf', submitted: 'Diajukan', validated: 'Tervalidasi', archived: 'Diarsipkan' }

const CSS = ".cpRoot{display:grid;gap:14px;color:var(--ink)}.cpRoot .cpGlass{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.54),rgba(255,255,255,.22));border:1px solid rgba(255,255,255,.72);border-radius:24px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.78);backdrop-filter:blur(24px) saturate(165%);-webkit-backdrop-filter:blur(24px) saturate(165%)}.cpHead{padding:20px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.cpEyebrow{font-size:11px;font-weight:850;letter-spacing:.045em;color:var(--accent2);text-transform:none}.cpHead h3{font-size:28px;letter-spacing:-.045em;margin:7px 0 5px}.cpHead p{font-size:12px;color:var(--muted);margin:0;max-width:780px;line-height:1.6}.cpActions{display:flex;gap:8px;flex-wrap:wrap}.cpBtn{min-height:40px;border:1px solid rgba(255,255,255,.82);background:rgba(255,255,255,.5);color:#214a39;border-radius:13px;padding:9px 13px;font-size:11px;font-weight:850;cursor:pointer}.cpBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;border-color:transparent}.cpBtn:disabled{opacity:.5;cursor:not-allowed}.cpGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cpTile{padding:17px;text-align:left;width:100%;cursor:pointer;color:var(--ink);transition:transform .18s,border-color .18s}.cpTile:hover{transform:translateY(-2px);border-color:rgba(var(--accent-rgb),.35)}.cpTileTop{display:flex;justify-content:space-between;align-items:center;gap:8px}.cpTileIcon{width:39px;height:39px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent2);font-size:18px}.cpBadge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900;background:#e8f7ef;color:#216b49;white-space:nowrap}.cpBadge.draft{background:#fff4d8;color:#835c15}.cpBadge.retired{background:#eceeed;color:#69746e}.cpTile h4{font-size:16px;line-height:1.35;margin:14px 0 4px}.cpTile p{font-size:11px;color:var(--muted);line-height:1.55;margin:0}.cpTileFoot{border-top:1px solid rgba(26,69,48,.09);display:flex;justify-content:space-between;gap:8px;margin-top:15px;padding-top:12px;font-size:11px;font-weight:850;color:var(--accent2)}.cpKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cpKpi{padding:14px 16px}.cpKpi span{display:block;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.cpKpi strong{display:block;font-size:23px;margin-top:5px;letter-spacing:-.03em}.cpKpi small{font-size:11px;color:var(--muted)}.cpToolbar{display:flex;gap:10px;flex-wrap:wrap;padding:14px 16px;align-items:end}.cpField{display:grid;gap:6px;min-width:0}.cpField label,.cpLabel{font-size:11px;font-weight:900;color:#68786f;letter-spacing:.035em}.cpField input,.cpField select,.cpField textarea,.cpInput{width:100%;min-height:42px;border:1px solid rgba(25,60,45,.14);border-radius:12px;background:rgba(255,255,255,.7);padding:10px 12px;color:var(--ink);outline:none;font-size:12px}.cpField textarea{min-height:72px;resize:vertical}.cpField input:focus,.cpField select:focus,.cpField textarea:focus,.cpInput:focus{border-color:rgba(var(--accent-rgb),.6);box-shadow:0 0 0 3px rgba(var(--accent-rgb),.08)}.cpSearch{flex:1;min-width:210px}.cpSelect{min-width:170px}.cpNotice{padding:12px 15px;border-radius:14px;background:#fff7e5;border:1px solid #f2dfb4;color:#77591d;font-size:11px;line-height:1.55}.cpNotice.info{background:#edf7f3;border-color:#d6ebe1;color:#245d48}.cpNotice.error{background:#fff0ef;border-color:#f4d0cc;color:#8d332d}.cpPanel{padding:17px}.cpPanel h4{margin:0 0 12px;font-size:15px}.cpBack{border:0;background:transparent;color:var(--accent2);font-size:11px;font-weight:900;padding:6px 0;cursor:pointer}.cpRecordList{display:grid;gap:8px}.cpRecord{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border:1px solid rgba(25,60,45,.1);border-radius:14px;background:rgba(255,255,255,.42)}.cpRecord b{display:block;font-size:12px}.cpRecord small{display:block;font-size:11px;color:var(--muted);margin-top:4px}.cpRecordRight{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cpFormGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.cpFormGrid .span2{grid-column:span 2}.cpSectionHead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:18px 0 9px}.cpSectionHead h4{font-size:16px;margin:0}.cpSectionHead p{font-size:11px;color:var(--muted);margin:4px 0 0}.cpTableWrap{max-width:100%;overflow:auto;max-height:68vh;border:1px solid rgba(25,60,45,.12);border-radius:15px;background:rgba(255,255,255,.55)}table.cpTable{width:100%;min-width:1140px;border-collapse:separate;border-spacing:0;font-size:11px}table.cpTable th,table.cpTable td{padding:9px 10px;border-bottom:1px solid rgba(25,60,45,.1);border-right:1px solid rgba(25,60,45,.07);vertical-align:middle;text-align:left}table.cpTable th{position:sticky;top:0;z-index:3;background:rgba(246,250,247,.97);font-size:11px;color:#69796f;text-transform:uppercase;letter-spacing:.035em;white-space:nowrap}table.cpTable th.cpDayCol{text-align:center;min-width:72px}table.cpTable td:nth-child(1){min-width:150px;max-width:190px;white-space:normal}table.cpTable td:nth-child(2){min-width:140px;max-width:190px;white-space:normal}table.cpTable td:nth-child(3){min-width:240px;white-space:normal}table.cpTable td:nth-child(4){min-width:230px;white-space:normal;color:#607168}table.cpTable .cpGroup td{background:rgba(var(--accent-rgb),.1);color:var(--accent2);font-size:11px;font-weight:950;position:sticky;left:0;z-index:1}.cpCell{min-width:72px;text-align:center!important;padding:5px!important}.cpCell.required{background:rgba(145,203,81,.25)}.cpCell.conditional{background:rgba(255,225,53,.28)}.cpCell.not_scheduled{background:rgba(255,255,255,.24);color:#b0b8b3}.cpCellControls{display:flex;align-items:center;justify-content:center;gap:5px}.cpMark{height:28px;min-width:28px;border:1px solid rgba(15,118,86,.2);border-radius:8px;background:rgba(255,255,255,.65);font-size:14px;font-weight:900;color:var(--accent2);cursor:pointer}.cpMark.done{background:#dff3e6;border-color:#8bc6a4;color:#12683e}.cpMark.not_done{background:#fff0ef;border-color:#e9b5af;color:#ac3932}.cpMark.not_applicable{background:#ececfb;border-color:#cbcbee;color:#48478b;font-size:11px}.cpCellEdit{border:0;background:transparent;color:#718177;cursor:pointer;font-size:13px;padding:4px}.cpSubtle{font-size:11px;color:var(--muted)}.cpChoiceCell{min-width:145px;max-width:175px;text-align:left!important;white-space:normal}.cpChoiceToggle{display:flex;align-items:flex-start;gap:8px;font-size:11px;font-weight:750;line-height:1.45;cursor:pointer}.cpChoiceToggle input{margin-top:2px;width:16px;height:16px;flex:0 0 auto;accent-color:var(--accent2)}.cpChoiceHint{display:block;margin:4px 0 0 24px;font-size:11px;color:var(--muted);line-height:1.4}.cpChoiceDisabled{opacity:.48}.cpProfessionHead td{padding:0!important;background:rgba(var(--accent-rgb),.12);border-right:0!important}.cpProfessionToggle{width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:12px 14px;text-align:left;cursor:pointer;color:var(--accent2)}.cpProfessionToggle strong{font-size:12px;font-weight:850}.cpProfessionToggle small{margin-left:auto;font-size:11px;color:var(--muted);font-weight:650}.cpProfessionArrow{width:22px;height:22px;display:grid;place-items:center;border:1px solid rgba(var(--accent-rgb),.2);border-radius:7px;background:rgba(255,255,255,.65)}.cpStageHead td{background:rgba(255,255,255,.58);color:#52675c;font-size:11px;font-weight:850;padding:8px 12px!important;border-bottom:1px solid rgba(25,60,45,.1)}.cpItemLabel{font-size:11px;font-weight:800;line-height:1.5}.cpItemDetail{font-size:11px;color:var(--muted);line-height:1.5;margin-top:4px}.cpField label,.cpLabel{text-transform:none;letter-spacing:0}.cpCellDetail{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:10px;padding:14px;background:rgba(var(--accent-rgb),.06);border:1px solid rgba(var(--accent-rgb),.18);border-radius:15px;margin:10px 0}.cpCellDetail .cpWide{grid-column:1/-1}.cpScoreGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cpScore{padding:13px;border-radius:14px;background:rgba(255,255,255,.58);border:1px solid rgba(24,64,43,.1)}.cpScore span{display:block;font-size:11px;color:var(--muted);font-weight:850;text-transform:none}.cpScore strong{display:block;font-size:23px;margin:4px 0}.cpScore small{display:block;color:var(--muted);font-size:11px;line-height:1.45}.cpPass{background:#e8f7ef;color:#216b49}.cpFail{background:#fff0ef;color:#8d332d}.cpPending{background:#fff6dd;color:#805d18}.cpCriterionList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cpCriterion{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(24,64,43,.1);border-radius:13px;padding:11px 12px;background:rgba(255,255,255,.45)}.cpCriterion label{font-size:11px;font-weight:800}.cpToggleGroup{display:flex;gap:5px;flex-wrap:wrap}.cpToggle{border:1px solid rgba(25,60,45,.13);background:#fff;border-radius:9px;padding:7px 9px;font-size:11px;font-weight:850;cursor:pointer}.cpToggle.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent2)}.cpVarList{display:grid;gap:10px}.cpVar{border:1px solid rgba(25,60,45,.13);background:rgba(255,255,255,.4);border-radius:14px;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.cpVarHead{display:flex;justify-content:space-between;align-items:center;grid-column:1/-1}.cpVarHead b{font-size:11px}.cpVar .cpField.full{grid-column:1/-1}.cpFooter{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:14px 18px;border-top:1px solid rgba(25,60,45,.1)}.cpEmpty{padding:22px;text-align:center;color:var(--muted);font-size:11px}.cpBuilderTable{max-height:62vh}.cpBuilderInput{min-width:180px}.cpBuilderDay{min-width:115px}.cpOppe{display:flex;align-items:center;gap:6px;font-size:11px}.cpSourceNotes{display:grid;gap:6px}.cpTiny{font-size:11px;color:var(--muted)}.cpAuditWrap{overflow:auto;max-width:100%}table.cpTable.cpAuditTable{table-layout:fixed;width:max-content;min-width:0}table.cpTable.cpAuditTable th:nth-child(1),table.cpTable.cpAuditTable td.cpChoiceCell{width:180px;min-width:180px;max-width:180px}table.cpTable.cpAuditTable th:nth-child(2),table.cpTable.cpAuditTable td:nth-child(2){width:270px;min-width:270px;max-width:270px}table.cpTable.cpAuditTable th.cpDayCol,table.cpTable.cpAuditTable td.cpCell{width:84px;min-width:84px;max-width:84px;text-align:center}table.cpTable.cpAuditTable td:nth-child(n+3){min-width:0;max-width:none;white-space:normal}table.cpTable.cpAuditTable td.cpCell{padding:5px 3px!important}table.cpTable.cpAuditTable .cpCellControls{gap:3px}.cpPatientSummary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:14px;padding:14px;border:1px solid rgba(25,60,45,.11);border-radius:14px;background:rgba(255,255,255,.44)}.cpPatientSummary>div{display:grid;gap:4px;min-width:0}.cpPatientSummary small{font-size:11px;color:var(--muted)}.cpPatientSummary b{font-size:11px;overflow-wrap:anywhere}.cpCollapseBtn{white-space:nowrap}.cpBuilderLegend{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.cpBuilderLegend span{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#52675c;padding:6px 9px;border:1px solid rgba(25,60,45,.1);border-radius:9px;background:rgba(255,255,255,.46)}.cpLegendDot{width:10px;height:10px;border-radius:3px;display:inline-block}.cpLegendDot.required{background:rgba(145,203,81,.65)}.cpLegendDot.conditional{background:rgba(255,225,53,.8)}.cpLegendDot.not_scheduled{background:rgba(170,180,175,.3);border:1px solid rgba(25,60,45,.13)}.cpBuilderTable{max-height:65vh}table.cpTable.cpBuilderMatrix{table-layout:fixed;width:max-content;min-width:0}table.cpTable.cpBuilderMatrix th,table.cpTable.cpBuilderMatrix td{padding:7px 8px;vertical-align:top}table.cpTable.cpBuilderMatrix th:nth-child(1),table.cpTable.cpBuilderMatrix td:nth-child(1){width:170px;min-width:170px;max-width:170px}table.cpTable.cpBuilderMatrix th:nth-child(2),table.cpTable.cpBuilderMatrix td:nth-child(2){width:145px;min-width:145px;max-width:145px}table.cpTable.cpBuilderMatrix th:nth-child(3),table.cpTable.cpBuilderMatrix td:nth-child(3){width:180px;min-width:180px;max-width:180px}table.cpTable.cpBuilderMatrix th:nth-child(4),table.cpTable.cpBuilderMatrix td:nth-child(4){width:300px;min-width:300px;max-width:300px}table.cpTable.cpBuilderMatrix th.cpBuilderDayHead,table.cpTable.cpBuilderMatrix td.cpBuilderScheduleCell{width:90px;min-width:90px;max-width:90px}table.cpTable.cpBuilderMatrix td.cpBuilderScheduleCell{padding:5px!important}table.cpTable.cpBuilderMatrix td.cpBuilderScheduleCell.required{background:rgba(145,203,81,.3)}table.cpTable.cpBuilderMatrix td.cpBuilderScheduleCell.conditional{background:rgba(255,225,53,.34)}table.cpTable.cpBuilderMatrix td.cpBuilderScheduleCell.not_scheduled{background:rgba(255,255,255,.26)}.cpBuilderDayHead{display:grid;grid-template-columns:minmax(0,1fr) 24px;align-items:center;gap:4px}.cpBuilderDayName{width:100%;min-width:0;min-height:30px;border:1px solid rgba(25,60,45,.16);border-radius:7px;padding:4px 5px;text-align:center;background:#fff;color:var(--ink);font-size:11px;font-weight:800}.cpBuilderDayRemove{border:0;border-radius:6px;background:rgba(255,255,255,.65);color:#8c3c34;width:22px;height:24px;padding:0;font-size:15px}.cpBuilderPolicy{width:100%;min-width:0;min-height:36px;padding:5px 3px!important;font-size:11px!important;font-weight:800;border-radius:7px!important}.cpBuilderPolicy.required{background:#e5f2d9!important;border-color:#a6cd83!important;color:#345e22}.cpBuilderPolicy.conditional{background:#fff1ad!important;border-color:#e6d16b!important;color:#735a00}.cpBuilderPolicy.not_scheduled{background:rgba(255,255,255,.72)!important;border-color:rgba(25,60,45,.12)!important;color:#647168}.cpBuilderTextCell{display:grid;gap:6px}.cpBuilderTextCell .cpInput,.cpBuilderItemCell .cpInput{min-width:0;min-height:35px;padding:7px 8px;font-size:11px}.cpBuilderItemCell{display:grid;gap:6px}.cpBuilderItemCell textarea{min-height:58px;resize:vertical}.cpBuilderConfigList{display:grid;gap:9px}.cpBuilderConfigRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:8px;align-items:start;padding:10px;border:1px solid rgba(25,60,45,.1);border-radius:12px;background:rgba(255,255,255,.35)}.cpBuilderConfigRow .cpInput{min-width:0}.cpBuilderConfigRow .cpBuilderLong{grid-column:span 2}.cpBuilderDelete{min-height:35px}.cpBuilderSectionText{font-size:11px;color:var(--muted);line-height:1.5}.cpBuilderMatrix .cpOppe{justify-content:center}@media(max-width:760px){.cpPatientSummary{grid-template-columns:repeat(2,minmax(0,1fr))}.cpBuilderConfigRow{grid-template-columns:1fr}.cpBuilderConfigRow .cpBuilderLong{grid-column:auto}}@media(max-width:1080px){.cpGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.cpKpis,.cpScoreGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.cpFormGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.cpCellDetail{grid-template-columns:1fr 1fr}}@media(max-width:650px){.cpGrid,.cpKpis,.cpScoreGrid,.cpCriterionList,.cpFormGrid{grid-template-columns:1fr}.cpHead h3{font-size:23px}.cpFormGrid .span2{grid-column:auto}.cpCellDetail,.cpVar{grid-template-columns:1fr}.cpCellDetail .cpWide,.cpVar .cpField.full,.cpVarHead{grid-column:auto}.cpRecord{grid-template-columns:1fr}.cpRecordRight{justify-content:flex-start}.cpSectionHead{align-items:flex-start}}.cpPpaGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 14px}.cpPpaGrid .cpField{min-width:0}.cpPpaGrid .cpField label{line-height:1.4;color:#506359;font-size:11px;font-weight:850}.cpPpaGrid .cpField input{min-width:0}.cpAuditWrap{overflow:visible!important;max-height:none!important;max-width:100%;width:100%}table.cpTable.cpAuditTable{width:100%;min-width:0;max-width:100%;table-layout:fixed}table.cpTable.cpAuditTable th:nth-child(1),table.cpTable.cpAuditTable td.cpChoiceCell{width:auto!important;min-width:0!important;max-width:none!important}table.cpTable.cpAuditTable th:nth-child(2),table.cpTable.cpAuditTable td:nth-child(2){width:auto!important;min-width:0!important;max-width:none!important}table.cpTable.cpAuditTable th.cpDayCol,table.cpTable.cpAuditTable td.cpCell{width:auto!important;min-width:0!important;max-width:none!important;padding-left:1px!important;padding-right:1px!important;text-align:center}table.cpTable.cpAuditTable td.cpChoiceCell{padding:9px 8px!important}.cpChoiceToggle{white-space:nowrap;gap:6px;font-size:11px}.cpChoiceToggle input{width:14px;height:14px}.cpChoiceHint{margin-left:20px;font-size:11px}.cpCellControls{gap:1px!important;white-space:nowrap}.cpCell .cpMark{width:20px;min-width:20px;height:24px;padding:0;border-radius:6px;font-size:11px}.cpCell .cpCellEdit{width:11px;min-width:11px;padding:0;font-size:11px;line-height:1}.cpCell .cpTiny{font-size:11px}table.cpTable.cpAuditTable th.cpDayCol{font-size:11px;padding:7px 0!important;letter-spacing:0;text-transform:none}table.cpTable.cpAuditTable td.cpCell{font-size:11px}@media(max-width:900px){.cpPpaGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.cpPpaGrid{grid-template-columns:1fr}.cpChoiceToggle{white-space:normal}}.cpAdditionalPhase{background:rgba(255,255,255,.94)!important;color:#52675c!important}.cpAdditionalPhase .cpMark{background:rgba(255,255,255,.92);border-color:rgba(25,60,45,.19)}.cpAdditionalPhase .cpCellEdit{color:#6d7a72}.cpAdditionalPhasePanel{margin-top:16px;padding-top:8px;border-top:1px solid rgba(25,60,45,.1)}.cpPhaseToggleList{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.cpPhaseToggle{display:grid;grid-template-columns:16px minmax(0,1fr) auto;gap:8px;align-items:start;padding:10px;border:1px solid rgba(25,60,45,.13);border-radius:12px;background:rgba(255,255,255,.4);cursor:pointer}.cpPhaseToggle.active{background:rgba(255,255,255,.82);border-color:rgba(15,118,86,.35);box-shadow:inset 0 0 0 1px rgba(15,118,86,.06)}.cpPhaseToggle input{margin:2px 0 0;width:15px;height:15px;accent-color:var(--accent)}.cpPhaseToggle span{display:grid;gap:4px;min-width:0}.cpPhaseToggle strong{font-size:11px;color:#244d3b}.cpPhaseToggle small{font-size:11px;color:var(--muted);line-height:1.4}.cpPhaseToggle em{font-style:normal;font-size:11px;font-weight:850;color:#7b867f;white-space:nowrap}.cpPhaseToggle.active em{color:var(--accent2)}@media(max-width:760px){.cpPhaseToggleList{grid-template-columns:1fr}}.cpTextMining{display:grid;gap:12px}.cpTextMiningWarning{padding:11px 13px;border:1px solid #f1d7a6;background:#fff8e9;color:#76531a;border-radius:12px;font-size:11px;line-height:1.55}.cpTextMiningInput{min-height:180px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;line-height:1.55;white-space:pre-wrap}.cpTextMiningActions{align-items:center}.cpTextMiningStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cpTextMiningStats>div{display:grid;gap:3px;padding:10px 12px;border:1px solid rgba(25,60,45,.1);border-radius:12px;background:rgba(255,255,255,.48)}.cpTextMiningStats small{font-size:11px;color:var(--muted)}.cpTextMiningStats strong{font-size:19px}.cpTextMiningStats strong.ok{color:#167247}.cpTextMiningStats strong.warn{color:#a66c12}.cpTextMiningStats strong.bad{color:#a93630}.cpTextMiningFilters{display:flex;flex-wrap:wrap;gap:6px}.cpTextMiningFilter{border:1px solid rgba(25,60,45,.12);background:rgba(255,255,255,.55);border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;color:#52675c}.cpTextMiningFilter.active{background:var(--accent-soft);border-color:rgba(var(--accent-rgb),.35);color:var(--accent2)}.cpTextMiningResults{display:grid;gap:8px}.cpTextMiningResult{padding:12px;border:1px solid rgba(25,60,45,.11);border-radius:14px;background:rgba(255,255,255,.48);display:grid;gap:8px;min-width:0}.cpTextMiningResultHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.cpTextMiningBadge{display:inline-flex;align-items:center;white-space:nowrap;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900}.cpTextMiningBadge.completed{background:#e5f5e9;color:#17633d}.cpTextMiningBadge.planned{background:#fff4d9;color:#815b13}.cpTextMiningBadge.negated{background:#fde9e7;color:#963b34}.cpTextMiningBadge.uncertain{background:#eceff1;color:#4c5b63}.cpTextMiningEvidence{margin:0;padding:8px 10px;border-left:3px solid #b6c9bf;background:rgba(242,247,244,.85);border-radius:0 8px 8px 0;font-size:11px;line-height:1.55;color:#40544a;overflow-wrap:anywhere}.cpTextMiningResultFoot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cpTextMiningDay{width:auto;min-width:130px;min-height:34px!important;padding:6px 9px!important}.cpTextMiningDayTag{font-size:11px;font-weight:850;color:#426a55;background:#e8f4ec;padding:6px 9px;border-radius:8px}.cpTextMiningAccept{margin-left:auto;min-height:34px;padding:7px 10px}.cpTextMiningManual{margin-left:auto;font-size:11px;font-weight:800;color:#85601d}.cpTextMiningFooter{display:grid;gap:4px;padding-top:9px;border-top:1px solid rgba(25,60,45,.1);font-size:11px;color:var(--muted)}.cpSourceNotesPanel{display:grid;gap:7px;margin-top:12px;padding:12px 14px;background:rgba(255,248,233,.8);border:1px solid #efdfbf;border-radius:13px}.cpSourceNotesPanel b{font-size:11px;color:#76531a}.cpSourceNotesPanel ul{margin:0;padding-left:18px;display:grid;gap:5px}.cpSourceNotesPanel li{font-size:11px;line-height:1.5;color:#6e5a36}.cpBuilderAlias{min-height:48px!important;font-size:11px!important}.cpClinicalFieldGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cpClinicalField{display:grid;gap:5px;padding:10px;border:1px solid rgba(25,60,45,.1);border-radius:12px;background:rgba(255,255,255,.4)}.cpClinicalField small{font-size:11px;color:var(--muted)}@media(max-width:760px){.cpTextMiningStats{grid-template-columns:repeat(2,minmax(0,1fr))}.cpTextMiningResultHead{flex-direction:column}.cpTextMiningAccept,.cpTextMiningManual{margin-left:0}.cpClinicalFieldGrid{grid-template-columns:1fr}}"

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }
function n(value: unknown): number { const x = Number(value); return Number.isFinite(x) ? x : 0 }
function fmtDate(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
function toLocalDateTimeInput(value?: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function policyLabel(policy: Policy): string {
  return policy === 'required' ? 'Wajib' : policy === 'conditional' ? 'Kondisional' : 'Tidak dijadwalkan'
}
function humanizeProfession(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return 'PPA belum ditentukan'
  if (trimmed === trimmed.toLocaleUpperCase('id-ID')) {
    const lower = trimmed.toLocaleLowerCase('id-ID')
    if (/^(DPJP|PPA|KIE|IGD|ICU|NICU|CSSD|EKG|PA)$/i.test(trimmed)) return trimmed.toLocaleUpperCase('id-ID')
    return lower.replace(/^\p{L}/u, (m) => m.toLocaleUpperCase('id-ID'))
  }
  return trimmed
}
function ppaNameFields(template: Template): PPANameField[] {
  const fields: PPANameField[] = [{ key: 'dpjp', label: 'Dokter Penanggung Jawab Pelayanan (DPJP)', profession: 'Dokter' }]
  const seen = new Set<string>(['dpjp'])
  const add = (key: string, label: string, profession: string) => {
    if (seen.has(key)) return
    seen.add(key)
    fields.push({ key, label, profession })
  }
  const slug = (value: string) => value.toLocaleLowerCase('id-ID')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'ppa'
  const excluded = /(konsultasi.*edukasi|edukasi.*konsultasi|consultation.*education|education.*consultation|verifikasi.*pulang|discharge.*verification|outcome)/i
  const professions = Array.from(new Set(template.items.map((item) => String(item.profession || '').trim()).filter(Boolean)))
  for (const profession of professions) {
    const low = profession.toLocaleLowerCase('id-ID')
    if (excluded.test(low)) continue
    if (/(perawat|nurse)/i.test(low)) add('perawat_penanggung_jawab', 'Perawat Penanggung Jawab', profession)
    else if (/(apoteker|farmasi|pharmacist|farmakologi|pharmacology)/i.test(low)) add('apoteker', 'Apoteker', profession)
    else if (/(nutrisionis|nutrisi|gizi|dietisien|dietitian)/i.test(low)) add('nutrisionis', 'Nutrisionis', profession)
    else if (/(anestesi|anesthesi)/i.test(low)) add('ppa_' + slug(profession), 'Dokter Anestesi', profession)
    else if (/(dokter|dpjp|spesialis|physician|medical staff)/i.test(low)) continue
    else add('ppa_' + slug(profession), 'Penanggung Jawab ' + humanizeProfession(profession), profession)
  }
  const rank = (field: PPANameField) => {
    if (field.key === 'dpjp') return 0
    if (field.key === 'perawat_penanggung_jawab') return 10
    if (field.key === 'apoteker') return 20
    if (field.key === 'nutrisionis') return 30
    if (/anestesi/i.test(field.profession)) return 40
    if (/laboratorium|laboratory/i.test(field.profession)) return 50
    if (/radiologi|imaging|patologi|pathology/i.test(field.profession)) return 60
    return 80
  }
  return fields.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'id'))
}
function cellKey(itemId: string, day: string): string { return itemId + '|' + day }
function cellStatus(form: AuditForm, itemId: string, day: string): CellStatus {
  return (form.answers_json[itemId]?.[day]?.status || '') as CellStatus
}
type AdditionalPhase = { key: string; label: string; shortLabel: string; description: string }
function additionalPhaseOptions(template: Template): AdditionalPhase[] {
  const basis = (String(template.code || '') + ' ' + String(template.name || '')).toLocaleLowerCase('id-ID')
  if (/(stroke|iskemik|haemor|hemorag|hemorrh)/i.test(basis)) {
    return [{ key: 'phase_h0', label: 'H0 / fase akut', shortLabel: 'H0', description: 'Aktivitas fase akut pada awal kedatangan atau fase awal penanganan stroke.' }]
  }
  if (/(seksio sesarea|caesarean|cesarean|histerektomi|mastektomi|soft tissue tumor|\bstt\b)/i.test(basis)) {
    return [
      { key: 'phase_preop', label: 'Praoperasi', shortLabel: 'Pra-op', description: 'Persiapan sebelum tindakan operasi.' },
      { key: 'phase_intraop', label: 'Intraoperasi', shortLabel: 'Intra', description: 'Aktivitas selama tindakan operasi.' },
      { key: 'phase_postop_h0', label: 'Pascaoperasi H0 / POD0', shortLabel: 'POD0', description: 'Pemulihan segera pada hari operasi.' },
    ]
  }
  return []
}
function calcClient(form: AuditForm) {
  let expected = 0, filled = 0, done = 0, notDone = 0, na = 0, oppeCells = 0, oppeMissing = 0
  const selectedItemCount = form.template.items.filter((item) => form.selected_items_json?.[item.id] === true).length
  const activePhases = additionalPhaseOptions(form.template).filter((phase) => (form.additional_phases_json || []).includes(phase.key))
  form.template.items.forEach((item) => {
    if (form.selected_items_json?.[item.id] !== true) return
    item.schedule.forEach((sched) => {
      if (sched.policy !== 'not_scheduled') {
        expected++
        const ans = form.answers_json[item.id]?.[sched.day]
        if (ans?.status === 'done' || ans?.status === 'not_done' || ans?.status === 'not_applicable') {
          filled++
          if (ans.status === 'done') done++
          if (ans.status === 'not_done') notDone++
          if (ans.status === 'not_applicable') na++
        }
        if (item.oppe && ans && (ans.status === 'done' || ans.status === 'not_done')) {
          oppeCells++
          if (!String(ans.performer_name || '').trim()) oppeMissing++
        }
      }
    })
    activePhases.forEach((phase) => {
      expected++
      const ans = form.answers_json[item.id]?.[phase.key]
      if (ans?.status === 'done' || ans?.status === 'not_done' || ans?.status === 'not_applicable') {
        filled++
        if (ans.status === 'done') done++
        if (ans.status === 'not_done') notDone++
        if (ans.status === 'not_applicable') na++
      }
      if (item.oppe && ans && (ans.status === 'done' || ans.status === 'not_done')) {
        oppeCells++
        if (!String(ans.performer_name || '').trim()) oppeMissing++
      }
    })
  })
  const completion = expected ? Math.round((filled / expected) * 10000) / 100 : null
  const evaluation = done + notDone
  const compliance = evaluation ? Math.round((done / evaluation) * 10000) / 100 : null
  const criteria = form.template.scoring_rules.inclusion_criteria || []
  const inclusionReady = criteria.every((c) => typeof form.inclusion_json[c.id] === 'boolean')
  const included = inclusionReady && criteria.every((c) => form.inclusion_json[c.id] === (c.expected !== false))
  const variations = form.variations_json.items || []
  const variationsReviewed = form.variations_json.reviewed === true
  const variationRequired = form.template.scoring_rules.variation_required !== false
  const variationComplete = !variationRequired || (variationsReviewed && variations.every((v) =>
    !!v.date && !!String(v.variation || '').trim() && !!String(v.reason || '').trim() && !!String(v.justification || '').trim()))
  const threshold = n(form.template.scoring_rules.completion_threshold_pct || 85)
  const target = n(form.template.scoring_rules.compliance_target_pct || 100)
  const completionPass = completion !== null && completion >= threshold
  const compliancePass = compliance !== null && compliance >= target
  const sectionDPass = inclusionReady && included && completionPass && compliancePass && variationComplete
  return { expected, filled, done, notDone, na, completion, evaluation, compliance, criteria, inclusionReady, included, selectedItemCount,
    variationCount: variations.length, variationsReviewed, variationRequired, variationComplete, threshold, target,
    completionPass, compliancePass, sectionDPass, oppeCells, oppeMissing }
}

function fromDatabase(row: any, fallback: Template | null, roomName: string): AuditForm {
  const t = row.template_snapshot && row.template_snapshot.items ? row.template_snapshot as Template : fallback
  if (!t) throw new Error('Snapshot Clinical Pathway pada audit ini tidak tersedia dan master penggantinya belum dimuat.')
  return {
    id: row.id, room_id: Number(row.room_id), template: clone(t), patient_name: row.patient_name || '',
    medical_record_no: row.medical_record_no || '', sex: row.sex || '', date_of_birth: row.date_of_birth || '',
    admission_date: row.admission_date || '', discharge_date: row.discharge_date || '',
    unit_name: row.unit_name || roomName || '', dpjp: row.dpjp || '',
    clinical_data: row.clinical_data || {}, ppa_names: { dpjp: row.dpjp || '', ...(row.ppa_names || {}) },
    selected_items_json: row.selected_items_json || {}, additional_phases_json: Array.isArray(row.additional_phases_json) ? row.additional_phases_json : [], inclusion_json: row.inclusion_json || {},
    answers_json: row.answers_json || {}, variations_json: row.variations_json || { reviewed: false, items: [] },
    status: row.status || 'draft',
  }
}

export default function ClinicalPathwayWorkspace({ initialRoomId, rooms, isAdmin, userName, onBack, lockRoomScope = false }: Props) {
  void onBack
  const [templates, setTemplates] = useState<Template[]>([])
  const [masterReady, setMasterReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [importingMaster, setImportingMaster] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info')
  useEffect(() => {
    if (!message || typeof window === 'undefined') return
    const type = messageKind === 'error' || /gagal|belum|tidak dapat|periksa|wajib|kesalahan/i.test(message) ? 'error' : /berhasil|tersimpan|dikirim|dihapus|diperbarui/i.test(message) ? 'success' : 'info'
    window.dispatchEvent(new CustomEvent('aureka:notification', { detail: { message, type, module: 'Audit Clinical Pathway' } }))
  }, [message, messageKind])
  const [screen, setScreen] = useState<'library' | 'diagnosis' | 'audit' | 'builder'>('library')
  useEffect(() => {
    if (!loading && !masterReady && screen !== 'library' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aureka:notification', { detail: { message: 'Master Clinical Pathway belum tersedia di server. Audit belum dapat disimpan sampai master tersinkron.', type: 'error', module: 'Audit Clinical Pathway' } }))
    }
  }, [masterReady, loading, screen])
  const [selectedCode, setSelectedCode] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(initialRoomId)
  useEffect(() => { if (lockRoomScope && initialRoomId != null && selectedRoomId !== initialRoomId) setSelectedRoomId(initialRoomId) }, [lockRoomScope, initialRoomId, selectedRoomId])
  const [search, setSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; setSearch(String(detail?.query ?? '')) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [form, setForm] = useState<AuditForm | null>(null)
  const [focusedCell, setFocusedCell] = useState<{ itemId: string; day: string } | null>(null)
  const [collapsedProfessions, setCollapsedProfessions] = useState<Record<string, boolean>>({})
  const [builder, setBuilder] = useState<Template | null>(null)
  const [builderIsNew, setBuilderIsNew] = useState(false)
  const [builderReturnScreen, setBuilderReturnScreen] = useState<'library' | 'diagnosis'>('diagnosis')
  // Esc menutup popup editor format (dengan konfirmasi agar isian tidak hilang tanpa sengaja).
  useEffect(() => {
    if (screen !== 'builder') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving || event.defaultPrevented) return
      if (document.querySelector('.akConfirmText, [role="alertdialog"]')) return
      event.preventDefault()
      void (async () => {
        if (await aurekaConfirm('Tutup editor? Perubahan yang belum disimpan akan hilang.')) { setBuilder(null); setBuilderIsNew(false); setMessage(''); setScreen(builderReturnScreen) }
      })()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, saving, builderReturnScreen])
  const [patientPanelCollapsed, setPatientPanelCollapsed] = useState(false)
  const [teamStaff, setTeamStaff] = useState<StaffOption[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffAttributions, setStaffAttributions] = useState<Record<string, string>>({})
  const [savedStaffAttributions, setSavedStaffAttributions] = useState<Record<string, string>>({})

  const selectedTemplate = templates.find((x) => x.code === selectedCode) || null
  const roomNames = useMemo(() => new Map(rooms.map((r) => [Number(r.id), r.name])), [rooms])
  const score = useMemo(() => form ? calcClient(form) : null, [form])
  const activeAdditionalPhases = form ? additionalPhaseOptions(form.template).filter((phase) => (form.additional_phases_json || []).includes(phase.key)) : []
  const checklistDays = form ? [...activeAdditionalPhases.map((phase) => phase.key), ...form.template.days] : []
  const filteredTemplates = useMemo(() => templates
    .filter((t) => isAdmin || t.status === 'published')
    .filter((t) => (t.name + ' ' + t.icd10 + ' ' + t.code).toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => a.name.localeCompare(b.name, 'id')), [templates, search, isAdmin])

  const loadTeamStaff = useCallback(async () => {
    setStaffLoading(true)
    try {
      const { data: assignmentRows, error: assignmentError } = await q().from('staff_team_assignments')
        .select('staff_id,room_id')
        .eq('assignment_status', 'active')
        .eq('is_locked', true)
      if (assignmentError) throw assignmentError
      const roomByStaff = new Map<string, number>(
        ((assignmentRows || []) as Array<{staff_id: string; room_id: number}>).map((row) => [String(row.staff_id), Number(row.room_id)]),
      )
      const ids = Array.from(roomByStaff.keys())
      const next: StaffOption[] = []
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100)
        const { data, error } = await q().from('staff_directory')
          .select('id,employee_code,display_name,profession_group,position_title,directory_status')
          .eq('directory_status', 'available')
          .in('id', batch)
          .order('display_name')
        if (error) throw error
        next.push(...(data || []).map((row: any) => {
          const roomId = Number(roomByStaff.get(String(row.id)))
          return { ...row, id: String(row.id), room_id: roomId, room_name: roomNames.get(roomId) || '' }
        }).filter((staff: StaffOption) => staff.room_name))
      }
      setTeamStaff(next)
    } catch {
      setTeamStaff([])
      setMessage('Direktori tenaga belum dapat dimuat. Pemetaan identitas PPA dan pelaksana tetap dibatasi sampai roster tim tersedia.')
      setMessageKind('error')
    } finally {
      setStaffLoading(false)
    }
  }, [roomNames])

  useEffect(() => { void loadTeamStaff() }, [loadTeamStaff])

  const staffForProfession = useCallback((profession: string, roomId: number | null) => {
    const low = String(profession || '').toLocaleLowerCase('id-ID')
    const roster = teamStaff.filter((staff) => Number(staff.room_id) === Number(roomId))
    if (/dokter|dpjp|physician|spesialis/.test(low)) return roster.filter((staff) => /dokter/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    if (/perawat|nurse/.test(low)) return roster.filter((staff) => /perawat/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    if (/bidan|midwife/.test(low)) return roster.filter((staff) => /bidan/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    if (/apoteker|farmasi|pharmacist/.test(low)) return roster.filter((staff) => /kefarmasian|farmasi/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    if (/gizi|nutrisi|dietisien/.test(low)) return roster.filter((staff) => /gizi/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    if (/radiologi|radiographer/.test(low)) return roster.filter((staff) => /radiologi/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    if (/laboratorium|atlm|analis|laboratory/.test(low)) return roster.filter((staff) => /laboratorium/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    if (/fisioterapi|terapi okupasi/.test(low)) return roster.filter((staff) => /terapi|fisioterapi/.test(staff.profession_group.toLocaleLowerCase('id-ID')))
    const exact = roster.filter((staff) => staff.profession_group.toLocaleLowerCase('id-ID') === low)
    return exact.length ? exact : roster
  }, [teamStaff])

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setTemplates([])
    setMasterReady(false)
    setMessage('')
    try {
      // Supabase is the sole source of truth. Never restore deleted CPs from bundled assets.
      const { data, error } = await q().from('clinical_pathway_templates').select('*').order('name')
      if (error) throw error
      const mapRow = (row: any): Template => ({
        ...(row.template_json || {}),
        code: row.code, name: row.name, icd10: row.icd10 || '',
        status: row.status, version: row.version,
        source_filename: row.source_filename || row.template_json?.source_filename || '',
      })
      const shown = (data || [])
        .map(mapRow)
        .filter((template: Template) => template.status !== 'retired' || isAdmin)
        .sort((a: Template, b: Template) => a.name.localeCompare(b.name, 'id'))
      setTemplates(shown)
      setSelectedCode((current) => shown.some((template: Template) => template.code === current) ? current : '')
      setMasterReady(true)
      if (shown.length === 0) {
        setMessage(isAdmin
          ? 'Belum ada format Clinical Pathway tersimpan. Tambahkan format baru setelah dokumen pengganti siap.'
          : 'Belum ada format Clinical Pathway yang tersedia. Hubungi Super Admin setelah format baru diunggah.')
        setMessageKind('info')
      }
    } catch (e: any) {
      setTemplates([])
      setSelectedCode('')
      setMasterReady(false)
      setMessage('Format Clinical Pathway tidak dapat dimuat. Silakan muat ulang atau hubungi administrator. ' + toUserFacingError(e, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }))
      setMessageKind('error')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  async function importClinicalPathwaySourcePack(file: File | null) {
    if (!isAdmin || importingMaster || templates.length > 0) return
    if (!file) { setMessage('Pilih file JSON paket Clinical Pathway terlebih dahulu.'); setMessageKind('error'); return }
    if (!(await aurekaConfirm('Impor 8 format Clinical Pathway dari file yang dipilih?'))) return
    setImportingMaster(true)
    setMessage('')
    try {
      const auth = await sb.auth.getUser()
      if (auth.error || !auth.data.user) throw new Error('Sesi Super Admin tidak tersedia.')
      const current = await q().from('clinical_pathway_templates').select('code').limit(1)
      if (current.error) throw current.error
      if ((current.data || []).length > 0) throw new Error('Database sudah berisi master CP. Impor dibatalkan agar tidak menimpa format yang sudah ada.')
      if (!file.name.toLocaleLowerCase('id-ID').endsWith('.json')) throw new Error('Format file harus .json.')
      const source = JSON.parse(await file.text())
      const sourceTemplates = Array.isArray(source?.templates) ? source.templates : []
      const itemCount = sourceTemplates.reduce((total: number, template: any) => total + (Array.isArray(template.items) ? template.items.length : 0), 0)
      if (sourceTemplates.length !== 8 || itemCount !== 686) throw new Error('Validasi paket gagal. Ditemukan ' + sourceTemplates.length + ' format dan ' + itemCount + ' item; diharapkan 8 format dan 686 item.')
      const payload = sourceTemplates.map((template: any) => ({
        code: template.code,
        name: template.name,
        icd10: template.icd10 || '',
        status: template.status || 'published',
        version: Number(template.version || 1),
        template_json: template,
        source_filename: template.source_filename || '',
        created_by: auth.data.user.id,
        updated_by: auth.data.user.id,
      }))
      const { error } = await q().from('clinical_pathway_templates').insert(payload)
      if (error) throw error
      setImportFile(null)
      await loadTemplates()
      setMessage('Berhasil mengimpor 8 format Clinical Pathway.')
      setMessageKind('info')
    } catch (error: any) {
      setMessage('Impor master Clinical Pathway gagal: ' + toUserFacingError(error, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }))
      setMessageKind('error')
    } finally {
      setImportingMaster(false)
    }
  }

  const loadAudits = useCallback(async (code: string) => {
    if (!code) { setAudits([]); return }
    setAuditLoading(true)
    try {
      let req: any = q().from('clinical_pathway_audits')
        .select('id,room_id,template_code,template_name,patient_name,medical_record_no,admission_date,status,calculation_json,created_at,unit_name')
        .eq('template_code', code).neq('status', 'archived')
        .order('created_at', { ascending: false }).limit(500)
      if (selectedRoomId != null) req = req.eq('room_id', selectedRoomId)
      const { data, error } = await req
      if (error) throw error
      setAudits((data || []) as AuditRow[])
    } catch (e: any) {
      setMessage('Gagal memuat daftar audit CP: ' + toUserFacingError(e, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }))
      setMessageKind('error')
    } finally {
      setAuditLoading(false)
    }
  }, [selectedRoomId])

  useEffect(() => { void loadTemplates() }, [loadTemplates])
  useEffect(() => {
    if (screen === 'diagnosis' && selectedCode) void loadAudits(selectedCode)
  }, [screen, selectedCode, selectedRoomId, loadAudits])

  function chooseTemplate(t: Template) {
    setSelectedCode(t.code)
    setMessage('')
    setScreen('diagnosis')
  }

  function newAudit() {
    if (!selectedTemplate) return
    if (selectedTemplate.status !== 'published') { setMessage('Format Clinical Pathway ini belum diterbitkan. Super Admin perlu menerbitkannya sebelum digunakan untuk audit pasien.'); setMessageKind('error'); return }
    const roomId = selectedRoomId ?? (isAdmin ? null : initialRoomId)
    setForm({
      room_id: roomId, template: clone(selectedTemplate), patient_name: '', medical_record_no: '', sex: '',
      date_of_birth: '', admission_date: '', discharge_date: '',
      unit_name: roomNames.get(Number(roomId)) || (roomId == null ? '' : ''), dpjp: '',
      clinical_data: {}, ppa_names: { dpjp: '' }, selected_items_json: {}, additional_phases_json: [], inclusion_json: {}, answers_json: {},
      variations_json: { reviewed: false, items: [] }, status: 'draft',
    })
    setStaffAttributions({})
    setSavedStaffAttributions({})
    setFocusedCell(null)
    setPatientPanelCollapsed(false)
    setMessage('')
    setScreen('audit')
  }

  async function openAudit(row: AuditRow) {
    setSaving(true)
    setMessage('')
    try {
      const { data, error } = await q().from('clinical_pathway_audits').select('*').eq('id', row.id).single()
      if (error) throw error
      const fallback = templates.find((x) => x.code === row.template_code) || null
      setForm(fromDatabase(data, fallback, roomNames.get(Number(data.room_id)) || ''))
      const { data: links, error: linkError } = await q().from('staff_entity_attributions')
        .select('field_key,staff_id')
        .eq('entity_type', 'clinical_pathway_audit')
        .eq('entity_id', String(data.id))
      if (linkError) throw linkError
      const linked = Object.fromEntries((links || []).map((link: any) => [String(link.field_key), String(link.staff_id)]))
      setStaffAttributions(linked)
      setSavedStaffAttributions(linked)
      setSelectedCode(row.template_code)
      setFocusedCell(null)
      setPatientPanelCollapsed(false)
      setScreen('audit')
    } catch (e: any) {
      setMessage('Tidak dapat membuka audit: ' + toUserFacingError(e, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }))
      setMessageKind('error')
    } finally {
      setSaving(false)
    }
  }

  function patchForm(patch: Partial<AuditForm>) {
    setForm((current) => current ? { ...current, ...patch } : current)
  }

  function patchCell(item: CPItem, day: string, patch: Partial<CellAnswer>) {
    setForm((current) => {
      if (!current) return current
      const currentCell = current.answers_json[item.id]?.[day] || {}
      const nextCell = { ...currentCell, ...patch }
      const nextAnswers = { ...current.answers_json, [item.id]: { ...(current.answers_json[item.id] || {}), [day]: nextCell } }
      return { ...current, answers_json: nextAnswers }
    })
  }
  function acceptTextMiningSuggestion(suggestion: ClinicalTextMiningSuggestion, day: string) {
    if (!form || !form.template.days.includes(day) || suggestion.status !== 'completed') return
    if (!isAdmin && form.status === 'validated') return
    const item = form.template.items.find((entry) => entry.id === suggestion.item_id)
    if (!item) return
    setForm((current) => {
      if (!current) return current
      const existing = current.answers_json[item.id]?.[day] || {}
      return {
        ...current,
        selected_items_json: { ...(current.selected_items_json || {}), [item.id]: true },
        answers_json: {
          ...current.answers_json,
          [item.id]: {
            ...(current.answers_json[item.id] || {}),
            [day]: {
              ...existing,
              status: 'done',
              evidence: suggestion.evidence,
              performer_profession: existing.performer_profession || item.profession,
              note: [existing.note, 'Disarankan text mining dan diterima PIC; istilah: ' + suggestion.match_term + '; keyakinan pencocokan: ' + Math.round(suggestion.confidence * 100) + '%.'].filter(Boolean).join(' '),
            },
          },
        },
      }
    })
    setFocusedCell({ itemId: item.id, day })
  }

  function selectPpaStaff(field: PPANameField, staffId: string) {
    const fieldKey = 'ppa:' + field.key
    const staff = teamStaff.find((row) => row.id === staffId && Number(row.room_id) === Number(form?.room_id))
    setStaffAttributions((current) => {
      const next = { ...current }
      if (staff) next[fieldKey] = staff.id
      else delete next[fieldKey]
      return next
    })
    if (staff) {
      patchForm({
        ppa_names: { ...(form?.ppa_names || {}), [field.key]: staff.display_name },
        ...(field.key === 'dpjp' ? { dpjp: staff.display_name } : {}),
      })
    }
  }

  function selectPerformerStaff(item: CPItem, day: string, staffId: string) {
    const fieldKey = 'performer:' + item.id + ':' + day
    const staff = teamStaff.find((row) => row.id === staffId && Number(row.room_id) === Number(form?.room_id))
    setStaffAttributions((current) => {
      const next = { ...current }
      if (staff) next[fieldKey] = staff.id
      else delete next[fieldKey]
      return next
    })
    patchCell(item, day, {
      performer_name: staff?.display_name || '',
      performer_profession: staff?.profession_group || item.profession,
    })
  }

  function toggleItemChoice(item: CPItem, selected: boolean) {
    if (!form) return
    patchForm({ selected_items_json: { ...(form.selected_items_json || {}), [item.id]: selected } })
    if (!selected && focusedCell?.itemId === item.id) setFocusedCell(null)
  }

  function toggleCell(item: CPItem, day: string) {
    if (!form || form.selected_items_json?.[item.id] !== true) return
    const currentCell = form.answers_json[item.id]?.[day] || {}
    patchCell(item, day, currentCell.status === 'done' ? { status: '' } : {
      status: 'done', performed_at: currentCell.performed_at || new Date().toISOString(),
      performer_profession: currentCell.performer_profession || item.profession,
    })
  }

  function setInclusion(id: string, value: boolean) {
    patchForm({ inclusion_json: { ...(form?.inclusion_json || {}), [id]: value } })
  }

  function toggleAdditionalPhase(key: string, active: boolean) {
    if (!form) return
    const current = form.additional_phases_json || []
    const next = active ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key)
    patchForm({ additional_phases_json: next })
    if (!active && focusedCell?.day === key) setFocusedCell(null)
  }

  function setVariationsReviewed(value: boolean) {
    if (!form) return
    patchForm({ variations_json: { ...form.variations_json, reviewed: value, items: value ? form.variations_json.items : [] } })
  }

  function addVariation() {
    if (!form) return
    const v: Variation = { id: 'var-' + Date.now(), date: form.admission_date || '', item_id: '', variation: '', reason: '', justification: '' }
    patchForm({ variations_json: { reviewed: true, items: [...form.variations_json.items, v] } })
  }

  function patchVariation(id: string, patch: Partial<Variation>) {
    if (!form) return
    patchForm({ variations_json: { reviewed: true, items: form.variations_json.items.map((v) => v.id === id ? { ...v, ...patch } : v) } })
  }

  function removeVariation(id: string) {
    if (!form) return
    const items = form.variations_json.items.filter((v) => v.id !== id)
    patchForm({ variations_json: { reviewed: true, items } })
  }

  async function saveAudit(nextStatus: 'draft' | 'submitted' | 'validated') {
    if (!form) return
    if (!masterReady) { setMessage('Audit belum dapat disimpan. Format Clinical Pathway belum siap.'); setMessageKind('error'); return }
    if (!form.room_id) { setMessage('Pilih unit/ruangan sebelum menyimpan audit.'); setMessageKind('error'); return }
    if (!form.patient_name.trim()) { setMessage('Nama pasien wajib diisi.'); setMessageKind('error'); return }
    if (nextStatus === 'submitted' && !form.id && !staffAttributions['ppa:dpjp']) {
      setMessage('Pilih DPJP dari roster tenaga terkunci unit sebelum mengajukan audit Clinical Pathway baru.')
      setMessageKind('error')
      return
    }
    const allowedStaffIds = new Set(teamStaff.filter((staff) => Number(staff.room_id) === Number(form.room_id)).map((staff) => staff.id))
    const identityKeys = Array.from(new Set([...Object.keys(savedStaffAttributions), ...Object.keys(staffAttributions)]))
    const changedIdentityKeys = identityKeys.filter((key) => (savedStaffAttributions[key] || '') !== (staffAttributions[key] || ''))
    if (changedIdentityKeys.some((key) => {
      const staffId = staffAttributions[key]
      return !!staffId && !allowedStaffIds.has(staffId)
    })) {
      setMessage('Ada identitas PPA/pelaksana baru yang tidak berada pada roster terkunci unit. Segarkan roster atau minta Admin/PMKP memperbarui penetapan tim.')
      setMessageKind('error')
      return
    }
    if (!isAdmin && form.id && form.status === 'validated') { setMessage('Audit yang sudah tervalidasi hanya dapat diubah oleh Super Admin.'); setMessageKind('error'); return }
    if (!isAdmin && form.room_id !== initialRoomId) { setMessage('Anda hanya dapat menyimpan audit pada unit yang ditetapkan di akun.'); setMessageKind('error'); return }
    setSaving(true)
    setMessage('')
    try {
      const auth = await sb.auth.getUser()
      if (auth.error || !auth.data.user) throw new Error('Sesi login tidak tersedia. Silakan masuk kembali.')
      const payload: any = {
        room_id: form.room_id, template_code: form.template.code, template_name: form.template.name,
        template_version: form.template.version, template_snapshot: form.template,
        patient_name: form.patient_name.trim(), medical_record_no: form.medical_record_no.trim(),
        sex: form.sex, date_of_birth: form.date_of_birth || null,
        admission_date: form.admission_date || null, discharge_date: form.discharge_date || null,
        unit_name: form.unit_name || roomNames.get(Number(form.room_id)) || '',
        dpjp: form.ppa_names?.dpjp || form.dpjp || '', ppa_names: form.ppa_names || {},
        clinical_data: form.clinical_data || {}, selected_items_json: form.selected_items_json || {}, additional_phases_json: form.additional_phases_json || [],
        inclusion_json: form.inclusion_json || {}, answers_json: form.answers_json || {},
        variations_json: form.variations_json || { reviewed: false, items: [] },
        status: nextStatus, updated_by: auth.data.user.id,
      }
      let result: any
      if (form.id) {
        result = await q().from('clinical_pathway_audits').update(payload).eq('id', form.id).select('*').single()
      } else {
        payload.created_by = auth.data.user.id
        result = await q().from('clinical_pathway_audits').insert(payload).select('*').single()
      }
      if (result.error) throw result.error
      const auditId = String(result.data.id)
      let identityWarning = ''
      for (const fieldKey of changedIdentityKeys) {
        const { error: deleteLinkError } = await q().from('staff_entity_attributions')
          .delete().eq('entity_type', 'clinical_pathway_audit').eq('entity_id', auditId).eq('field_key', fieldKey)
        if (deleteLinkError) {
          identityWarning = 'Audit CP tersimpan, tetapi tautan identitas tenaga tidak dapat diperbarui: ' + toUserFacingError(deleteLinkError, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' })
          break
        }
        const staffId = staffAttributions[fieldKey]
        if (!staffId) continue
        const { error: insertLinkError } = await q().from('staff_entity_attributions').insert({
          entity_type: 'clinical_pathway_audit',
          entity_id: auditId,
          staff_id: staffId,
          field_key: fieldKey,
          attribution_type: fieldKey.startsWith('ppa:') ? 'responsible_provider' : 'involved_person',
          created_by: auth.data.user.id,
          updated_by: auth.data.user.id,
        })
        if (insertLinkError) {
          identityWarning = 'Audit CP tersimpan, tetapi tautan identitas tenaga gagal disimpan: ' + toUserFacingError(insertLinkError, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' })
          break
        }
      }
      if (!identityWarning) setSavedStaffAttributions({ ...staffAttributions })
      const fallback = templates.find((x) => x.code === result.data.template_code) || form.template
      setForm(fromDatabase(result.data, fallback, roomNames.get(Number(result.data.room_id)) || ''))
      setSelectedCode(result.data.template_code)
      setMessage(identityWarning || 'Audit Clinical Pathway berhasil disimpan.')
      setMessageKind(identityWarning ? 'error' : 'info')
      if (screen === 'diagnosis') await loadAudits(result.data.template_code)
    } catch (e: any) {
      setMessage('Audit Clinical Pathway belum berhasil disimpan: ' + toUserFacingError(e, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }))
      setMessageKind('error')
    } finally {
      setSaving(false)
    }
  }

  function beginBuilder(template: Template | null = selectedTemplate, returnTo: 'library' | 'diagnosis' = 'diagnosis') {
    if (!isAdmin || !template) return
    setBuilder(clone(template)); setBuilderIsNew(false); setBuilderReturnScreen(returnTo)
    setSelectedCode(template.code); setScreen('builder'); setMessage('')
  }

  function beginNewBuilder() {
    if (!isAdmin) return
    const code = 'cp-baru-' + Date.now(), days = ['H1', 'H2', 'H3']
    setBuilder({
      code, name: '', icd10: '', source_filename: 'Master Clinical Pathway baru', status: 'draft', version: 1, days,
      items: [{ id: code + '-item-1', section: 'A', profession: '', choice: '', stage: '', label: '', detail: '',
        schedule: days.map((day) => ({ day, policy: 'not_scheduled' as Policy })), oppe: false }],
      clinical_fields: [], source_notes: [],
      scoring_rules: {
        completion_threshold_pct: 85, compliance_target_pct: 100,
        completion_definition: 'Persentase kotak jadwal wajib dan kondisional pada item yang dipilih PPA dan telah diputuskan.',
        compliance_definition: 'Jumlah sel sesuai dibagi seluruh sel yang dinilai sesuai atau tidak sesuai, dikalikan 100%.',
        variation_required: true, variation_definition: 'Jika terjadi variasi, isi tanggal, ringkasan variasi, alasan, dan justifikasi.',
        inclusion_mode: 'all', inclusion_criteria: [], source_section_d: [],
      },
    })
    setBuilderIsNew(true); setBuilderReturnScreen('library'); setSelectedCode(code); setScreen('builder'); setMessage(''); setMessageKind('info')
  }
  function patchBuilder(patch: Partial<Template>) { setBuilder((current) => current ? { ...current, ...patch } : current) }
  function patchBuilderScoring(patch: Partial<Template['scoring_rules']>) {
    setBuilder((current) => current ? { ...current, scoring_rules: { ...current.scoring_rules, ...patch } } : current)
  }
  function addBuilderDay() {
    if (!builder) return
    let number = builder.days.length + 1, day = 'H' + number
    while (builder.days.includes(day)) { number += 1; day = 'H' + number }
    patchBuilder({ days: [...builder.days, day], items: builder.items.map((item) => ({ ...item, schedule: [...item.schedule, { day, policy: 'not_scheduled' as Policy }] })) })
  }
  function renameBuilderDay(oldDay: string, nextDay: string) {
    if (!builder || oldDay === nextDay) return
    if (nextDay && builder.days.some((day) => day !== oldDay && day.toLocaleLowerCase('id-ID') === nextDay.toLocaleLowerCase('id-ID'))) return
    patchBuilder({ days: builder.days.map((day) => day === oldDay ? nextDay : day), items: builder.items.map((item) => ({ ...item, schedule: item.schedule.map((cell) => cell.day === oldDay ? { ...cell, day: nextDay } : cell) })) })
  }
  async function removeBuilderDay(day: string) {
    if (!builder) return
    if (builder.days.length <= 1) { setMessage('Clinical Pathway harus memiliki sekurang-kurangnya satu hari atau tahap.'); setMessageKind('error'); return }
    if (!(await aurekaConfirm('Hapus kolom ' + (day || 'hari/tahap ini') + ' beserta seluruh jadwalnya dari master CP?', { danger: true }))) return
    patchBuilder({ days: builder.days.filter((item) => item !== day), items: builder.items.map((item) => ({ ...item, schedule: item.schedule.filter((cell) => cell.day !== day) })) })
  }
  function addBuilderCriterion() {
    if (!builder) return
    const id='inclusion-'+Date.now()
    patchBuilderScoring({ inclusion_criteria: [...(builder.scoring_rules.inclusion_criteria || []), { id, label:'', type:'boolean', expected:true }] })
  }
  function patchBuilderCriterion(id: string, patch: Partial<Criterion>) {
    if (builder) patchBuilderScoring({ inclusion_criteria: (builder.scoring_rules.inclusion_criteria || []).map((criterion) => criterion.id === id ? { ...criterion, ...patch } : criterion) })
  }
  function removeBuilderCriterion(id: string) {
    if (builder) patchBuilderScoring({ inclusion_criteria: (builder.scoring_rules.inclusion_criteria || []).filter((criterion) => criterion.id !== id) })
  }
  function addBuilderSectionD() {
    if (builder) patchBuilderScoring({ source_section_d: [...(builder.scoring_rules.source_section_d || []), { item:'', standard:'', source_result:'' }] })
  }
  function patchBuilderSectionD(index: number, patch: Partial<Template['scoring_rules']['source_section_d'][number]>) {
    if (builder) patchBuilderScoring({ source_section_d: (builder.scoring_rules.source_section_d || []).map((criterion, i) => i === index ? { ...criterion, ...patch } : criterion) })
  }
  function removeBuilderSectionD(index: number) {
    if (builder) patchBuilderScoring({ source_section_d: (builder.scoring_rules.source_section_d || []).filter((_, i) => i !== index) })
  }

  function patchBuilderItem(id: string, patch: Partial<CPItem>) {
    setBuilder((current) => current ? {
      ...current, items: current.items.map((it) => it.id === id ? { ...it, ...patch } : it),
    } : current)
  }

  function patchBuilderSchedule(id: string, day: string, policy: Policy) {
    setBuilder((current) => current ? {
      ...current, items: current.items.map((it) => it.id === id ? {
        ...it, schedule: it.schedule.map((s) => s.day === day ? { ...s, policy } : s),
      } : it),
    } : current)
  }

  function addBuilderItem() {
    if (!builder) return
    const id = builder.code + '-custom-' + Date.now()
    patchBuilder({ items: [...builder.items, {
      id, section: 'A', profession: '', choice: '', stage: '', label: '', detail: '',
      schedule: builder.days.map((day) => ({ day, policy: 'not_scheduled' })), oppe: false,
    }] })
  }

  async function removeBuilderItem(id: string) {
    if (!builder) return
    if (!(await aurekaConfirm('Hapus item ini dari format master CP baru? Audit yang sudah tersimpan tetap menggunakan versi lamanya.', { danger: true }))) return
    patchBuilder({ items: builder.items.filter((it) => it.id !== id) })
  }

  async function saveBuilder() {
    if (!isAdmin || !builder) return
    const normalizedDays=builder.days.map((day)=>day.trim())
    if (!builder.code.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(builder.code.trim())) { setMessage('Kode internal harus memakai huruf kecil, angka, dan tanda hubung tanpa spasi.');setMessageKind('error');return }
    if (builderIsNew && templates.some((item)=>item.code===builder.code.trim())) { setMessage('Kode CP tersebut sudah digunakan. Pilih kode internal lain.');setMessageKind('error');return }
    if (!builder.name.trim() || !builder.items.length || builder.items.some((item)=>!item.label.trim())) { setMessage('Nama CP wajib terisi dan setiap item harus mempunyai nama item/tindakan.');setMessageKind('error');return }
    if (!normalizedDays.length || normalizedDays.some((day)=>!day) || new Set(normalizedDays.map((day)=>day.toLocaleLowerCase('id-ID'))).size!==normalizedDays.length) { setMessage('Setiap hari/tahap harus memiliki nama yang terisi dan tidak boleh duplikat.');setMessageKind('error');return }
    const criteria=(builder.scoring_rules.inclusion_criteria||[]).filter((criterion)=>criterion.label.trim())
    if(criteria.some((criterion)=>!criterion.id.trim())||new Set(criteria.map((criterion)=>criterion.id.trim())).size!==criteria.length){setMessage('Setiap kriteria inklusi harus memiliki ID yang terisi dan unik.');setMessageKind('error');return}
    setSaving(true);setMessage('')
    try {
      const auth=await sb.auth.getUser()
      if(auth.error||!auth.data.user)throw new Error('Sesi login tidak tersedia.')
      const current=templates.find((item)=>item.code===builder.code.trim())
      const nextVersion=builderIsNew?Math.max(1,builder.version||1):Math.max(1,(current?.version||builder.version||1)+1)
      const normalizedItems=builder.items.map((item)=>({...item,schedule:normalizedDays.map((day)=>({day,policy:item.schedule.find((cell)=>cell.day.trim()===day)?.policy||'not_scheduled'}))}))
      const saved:Template={
        ...builder,code:builder.code.trim(),name:builder.name.trim(),icd10:builder.icd10.trim(),source_filename:builder.source_filename.trim(),
        days:normalizedDays,items:normalizedItems,clinical_fields:builder.clinical_fields.filter((field)=>field.label.trim()),
        source_notes:builder.source_notes.map((note)=>note.trim()).filter(Boolean),
        scoring_rules:{
          ...builder.scoring_rules,completion_threshold_pct:Math.min(100,Math.max(0,n(builder.scoring_rules.completion_threshold_pct))),
          compliance_target_pct:Math.min(100,Math.max(0,n(builder.scoring_rules.compliance_target_pct))),
          inclusion_criteria:criteria.map((criterion)=>({...criterion,id:criterion.id.trim(),label:criterion.label.trim()})),
          source_section_d:(builder.scoring_rules.source_section_d||[]).filter((criterion)=>criterion.item.trim()),
        },version:nextVersion,
      }
      const masterPayload:Record<string,any>={name:saved.name,icd10:saved.icd10,status:saved.status,version:saved.version,template_json:saved,source_filename:saved.source_filename||'',updated_by:auth.data.user.id}
      let result:any
      if(builderIsNew) result=await q().from('clinical_pathway_templates').insert({code:saved.code,...masterPayload,created_by:auth.data.user.id}).select('*').single()
      else result=await q().from('clinical_pathway_templates').update(masterPayload).eq('code',saved.code).select('*').single()
      if(result.error)throw result.error
      if(!result.data)throw new Error('Master CP tidak mengembalikan hasil simpan.')
      const normalized:Template={...(result.data.template_json||saved),code:result.data.code,name:result.data.name,icd10:result.data.icd10||'',status:result.data.status,version:result.data.version,source_filename:result.data.source_filename||saved.source_filename||''}
      setTemplates((old)=>[...old.filter((item)=>item.code!==normalized.code),normalized].sort((a,b)=>a.name.localeCompare(b.name,'id')))
      setMasterReady(true);setSelectedCode(normalized.code);setBuilder(null);setBuilderIsNew(false);setScreen(builderReturnScreen)
      setMessage((builderIsNew?'Clinical Pathway baru':'Format CP')+' versi '+nextVersion+' berhasil disimpan. Audit terdahulu tetap memakai snapshot versi sebelumnya.');setMessageKind('info')
    } catch(e:any){setMessage('Gagal menyimpan format CP: '+toUserFacingError(e, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }));setMessageKind('error')}
    finally{setSaving(false)}
  }

  const roomOption = (room: Room) => <option key={room.id} value={room.id}>{room.name}</option>
  const sectionCount = selectedTemplate?.items.length || 0
  const currentScore = score

  function renderScore() {
    if (!form || !currentScore) return null
    const c = currentScore
    const pct = (v: number | null) => v == null ? '-' : v.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%'
    const passClass = (pass: boolean) => pass ? 'cpPass' : 'cpFail'
    return <div className="cpRoot">
      <div className="cpScoreGrid">
        <div className="cpGlass cpScore"><span>Keterisian CP</span><strong>{pct(c.completion)}</strong><small>{c.filled}/{c.expected} kotak harian dari {c.selectedItemCount} pilihan aktif sudah diputuskan · standar ≥{c.threshold}%</small><div className={'cpBadge ' + (c.completionPass ? '' : 'draft')}>{c.completionPass ? 'Memenuhi' : 'Belum memenuhi'}</div></div>
        <div className="cpGlass cpScore"><span>Kepatuhan CP</span><strong>{pct(c.compliance)}</strong><small>{c.done} sesuai dari {c.evaluation} sel yang dinilai · target {c.target}%</small><div className={'cpBadge ' + (c.compliancePass ? '' : 'draft')}>{c.compliancePass ? 'Memenuhi' : 'Belum memenuhi'}</div></div>
        <div className="cpGlass cpScore"><span>Inklusi penilaian</span><strong>{c.inclusionReady ? (c.included ? 'Ya' : 'Tidak') : '-'}</strong><small>{c.criteria.length} kriteria dari Bagian D harus diputuskan</small><div className={'cpBadge ' + (c.inclusionReady ? (c.included ? '' : 'draft') : 'draft')}>{!c.inclusionReady ? 'Belum lengkap' : c.included ? 'Layak dinilai' : 'Di luar inklusi'}</div></div>
        <div className="cpGlass cpScore"><span>Variasi pelayanan</span><strong>{c.variationCount}</strong><small>{c.variationRequired ? 'Justifikasi diperlukan untuk setiap variasi' : 'Tidak dipersyaratkan pada master CP'}</small><div className={'cpBadge ' + (c.variationComplete ? '' : 'draft')}>{!c.variationRequired ? 'Tidak diwajibkan' : c.variationComplete ? 'Terdokumentasi' : 'Belum lengkap'}</div></div>
      </div>
      <div className="cpPanel cpGlass">
        <div className="cpSectionHead"><div><h4>Bagian D · Kepatuhan Clinical Pathway</h4></div><span className={'cpBadge ' + (c.sectionDPass ? '' : 'draft')}>{c.sectionDPass ? 'Memenuhi seluruh kriteria' : 'Belum memenuhi seluruh kriteria'}</span></div>
        <div className="cpNotice info">{form.template.scoring_rules.completion_definition} {form.template.scoring_rules.compliance_definition}</div>
        <WorkspaceTableViewport label="Checklist dan format Clinical Pathway" className="cpTableWrap" style={{ maxHeight: 'none', marginTop: 12 }}>
          <table className="cpTable" style={{ minWidth: 760 }}>
            <thead><tr><th>Item Penilaian</th><th>Standar pada dokumen sumber</th><th>Hasil otomatis</th></tr></thead>
            <tbody>
              {(form.template.scoring_rules.source_section_d || []).map((item, i) => {
                let result = '-'
                if (/inklu|pasien dinyatakan/i.test(item.item)) result = c.inclusionReady ? (c.included ? 'Memenuhi' : 'Tidak memenuhi') : 'Belum dinilai'
                else if (/terisi/i.test(item.item) && /clinical pathway/i.test(item.item)) result = pct(c.completion) + ' (' + c.filled + '/' + c.expected + ')'
                else if (/kepatuhan pasien/i.test(item.item)) result = pct(c.compliance)
                else if (/variasi pelayanan/i.test(item.item)) result = !c.variationRequired ? 'Tidak diwajibkan' : c.variationComplete ? 'Terisi / lengkap' : 'Belum lengkap'
                return <tr key={item.item + i}><td>{item.item}</td><td>{item.standard}</td><td>{result}</td></tr>
              })}
            </tbody>
          </table>
        </WorkspaceTableViewport>
        <p className="cpTiny">Catatan: sel kosong berarti belum dinilai; bukan otomatis “tidak patuh”. Sel kondisional dapat diputuskan “Tidak berlaku”. Variasi yang terdokumentasi tidak otomatis mengubah item tidak sesuai menjadi patuh.</p>
      </div>
    </div>
  }

  if (loading) return <div className="cpRoot"><style>{CSS}</style><div className="cpGlass cpHead"><div><span className="cpEyebrow">AUREKA · Audit Clinical Pathway</span><h3>Menyiapkan master Clinical Pathway…</h3></div></div></div>

  // Editor format CP tampil sebagai popup di atas layar asal (pustaka/diagnosis).
  const view = screen === 'builder' ? builderReturnScreen : screen
  const closeBuilder = () => { setBuilder(null); setBuilderIsNew(false); setMessage(''); setScreen(builderReturnScreen) }
  return <div className="cpRoot">
    <style>{CSS}</style>
    <WorkspaceModuleHeader
      className="cpHead"
      title={view === 'library' ? 'Pustaka diagnosis & format CP' : view === 'diagnosis' ? (selectedTemplate?.name || 'Clinical Pathway') : screen === 'builder' ? (builderIsNew ? 'Tambah Clinical Pathway' : 'Edit Format CP') : 'Audit Pasien · ' + (form?.template.name || '')}
      actions={<div className="cpActions">
        {/* Tombol kembali ke Audit Indikator Mutu dihapus: Clinical Pathway kini menu tersendiri di Peningkatan Kinerja Klinis (Blueprint v2). */}
        {view !== 'library' && <button type="button" className="cpBtn" onClick={() => { setMessage(''); setScreen(view === 'audit' ? 'diagnosis' : 'library'); setFocusedCell(null); setForm(null); setBuilder(null); setBuilderIsNew(false) }}>← Kembali</button>}
        {view === 'diagnosis' && isAdmin && <button type="button" className="cpBtn" onClick={() => beginBuilder(selectedTemplate, 'diagnosis')}>⚙ Edit Form CP</button>}
        {view === 'diagnosis' && isAdmin && <button type="button" className="cpBtn" onClick={beginNewBuilder}>＋ Tambah CP baru</button>}
        {view === 'diagnosis' && <button type="button" className="cpBtn primary" onClick={newAudit}>＋ Audit pasien baru</button>}
        {screen === 'audit' && <button type="button" className="cpBtn" onClick={() => window.print()}>Cetak / PDF</button>}
      </div>}
    />

    {message && screen !== 'builder' && <div className={'cpNotice ' + (messageKind === 'error' ? 'error' : 'info')} role={messageKind === 'error' ? 'alert' : 'status'} aria-live={messageKind === 'error' ? 'assertive' : 'polite'}>{message}</div>}
    {!masterReady && view !== 'library' && <div className="cpNotice error">Format Clinical Pathway belum lengkap. Audit belum dapat disimpan.</div>}

    {view === 'library' && <>
      <div className="cpGlass cpLibBar">
        <div className="cpLibStats" aria-label="Ringkasan master Clinical Pathway">
          <span><b>{templates.filter((t) => t.status === 'published').length}</b> format CP aktif</span>
          <span><b>{templates.filter((t) => t.status === 'published').reduce((a, t) => a + t.items.length, 0).toLocaleString('id-ID')}</b> item master</span>
          <span><b>{isAdmin ? rooms.length : (initialRoomId ? 1 : 0)}</b> unit</span>
        </div>
        <div className="cpLibTools">
          <div className="cpField cpSearch cpLocalSearch"><label>Cari diagnosis / kode ICD-10</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Contoh: stroke, mastektomi, I63…" /></div>
          {isAdmin && !lockRoomScope && <label className="cpLibSel" title="Unit untuk audit baru"><span>Unit audit</span><select value={selectedRoomId == null ? '' : String(selectedRoomId)} onChange={(e) => setSelectedRoomId(e.target.value ? Number(e.target.value) : null)}><option value="">Semua unit (pilih saat audit)</option>{rooms.map(roomOption)}</select></label>}
          {isAdmin && <label className="cpLibSel" title="Super Admin: pilih format untuk langsung membuka editor"><span>Edit format</span><select value={selectedCode} onChange={(e) => { const code = e.target.value; setSelectedCode(code); const t = templates.find((x) => x.code === code); if (t) beginBuilder(t, 'library') }}><option value="">Pilih format untuk diedit…</option>{templates.map((template) => <option key={template.code} value={template.code}>{template.name} · {template.status === 'published' ? 'Aktif' : template.status === 'draft' ? 'Draf' : 'Tidak aktif'} · v{template.version}</option>)}</select></label>}
          {isAdmin && <button type="button" className="cpBtn primary" onClick={beginNewBuilder}>＋ CP baru</button>}
          <button type="button" className="cpBtn cpIconBtn" title="Muat ulang master" aria-label="Muat ulang master" onClick={() => void loadTemplates()}>↻</button>
        </div>
            {isAdmin && templates.length === 0 && <div className="cpField" style={{minWidth:260}}>
            <label htmlFor="cp-source-json">Paket JSON Clinical Pathway (8 format)</label>
            <input id="cp-source-json" className="cpInput" type="file" accept=".json,application/json" disabled={importingMaster} onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
            {importFile && <small className="cpTiny">{importFile.name} · {(importFile.size / 1024).toFixed(0)} KB</small>}
            <button type="button" className="cpBtn primary" disabled={importingMaster || !importFile} onClick={() => void importClinicalPathwaySourcePack(importFile)}>{importingMaster ? 'Mengimpor paket…' : '↓ Impor 8 format CP sumber baru'}</button>
          </div>}
      </div>
      <div className="cpGrid cpTiles">
        {filteredTemplates.map((t) => <button key={t.code} type="button" className="cpGlass cpTile" onClick={() => chooseTemplate(t)}>
          <span className="cpTileTop"><span className={'cpBadge ' + (t.status === 'draft' ? 'draft' : t.status === 'retired' ? 'retired' : '')}>{t.status === 'published' ? 'Aktif' : t.status === 'draft' ? 'Draf' : 'Tidak aktif'}</span></span>
          <h4>{t.name}</h4><p>{t.icd10 ? 'ICD-10: ' + t.icd10 : 'Kode ICD-10 belum dicantumkan pada dokumen sumber'} · Versi {t.version}</p>
          <div className="cpTileFoot"><span>{t.items.length} item · {t.days.length} hari/tahap</span><span>Buka diagnosis</span></div>
        </button>)}
      </div>
      {filteredTemplates.length === 0 && <div className="cpGlass cpEmpty">Tidak ada CP yang cocok dengan pencarian.</div>}
      
    </>}

    {view === 'diagnosis' && selectedTemplate && <>
      <div className="cpGrid">
        <LiquidGlass className="cpKpi"><span>Item dalam format</span><strong>{selectedTemplate.items.length}</strong><small>Baris checklist dari sumber</small></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Hari / tahap</span><strong>{selectedTemplate.days.length}</strong><small>{selectedTemplate.days.join(' · ')}</small></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Standar keterisian</span><strong>≥{selectedTemplate.scoring_rules.completion_threshold_pct}%</strong></LiquidGlass>
        <LiquidGlass className="cpKpi"><span>Target kepatuhan</span><strong>{selectedTemplate.scoring_rules.compliance_target_pct}%</strong></LiquidGlass>
      </div>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Audit pasien · {selectedTemplate.name}</h4></div><span className="cpBadge">{audits.length} rekam audit</span></div>
        {isAdmin && !lockRoomScope && <div className="cpField cpSelect" style={{ marginBottom: 12 }}><label>Filter unit / ruangan</label><select value={selectedRoomId == null ? '' : String(selectedRoomId)} onChange={(e) => setSelectedRoomId(e.target.value ? Number(e.target.value) : null)}><option value="">Semua unit</option>{rooms.map(roomOption)}</select></div>}
        {auditLoading ? <div className="cpEmpty">Memuat audit…</div> : audits.length === 0 ? <div className="cpEmpty">Belum ada rekam audit untuk diagnosis ini pada ruang lingkup akses Anda.</div> :
          <div className="cpRecordList">{audits.map((a) => {
            const c = a.calculation_json || {}
            return <div key={a.id} className="cpRecord"><div><b>{a.patient_name || 'Pasien tanpa nama'} <span className="cpSubtle">· RM {a.medical_record_no || '-'}</span></b><small>{roomNames.get(Number(a.room_id)) || a.unit_name || 'Unit'} · Masuk {fmtDate(a.admission_date)} · Dibuat {fmtDate(a.created_at)}</small><small>Keterisian {c.completion_pct == null ? '-' : c.completion_pct + '%'} · Kepatuhan {c.compliance_pct == null ? '-' : c.compliance_pct + '%'} · Bagian D {c.section_d_pass ? 'Memenuhi' : 'Belum memenuhi'}</small></div><div className="cpRecordRight"><span className={'cpBadge ' + (a.status === 'draft' ? 'draft' : '')}>{STATUS_LABEL[a.status] || a.status}</span><button type="button" className="cpBtn" onClick={() => void openAudit(a)}>Buka / Edit</button></div></div>
          })}</div>}
      </div>
      {isAdmin && <div className="cpGlass cpPanel"><h4>Pengelolaan master</h4><div className="cpActions"><button type="button" className="cpBtn" onClick={() => beginBuilder(selectedTemplate, 'diagnosis')}>⚙ Edit format ini</button><button type="button" className="cpBtn primary" onClick={beginNewBuilder}>＋ Tambah CP baru</button></div></div>}
    </>}

    {screen === 'audit' && form && <>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Identitas pasien dan episode perawatan</h4></div>
          <div className="cpActions"><span className={'cpBadge ' + (form.status === 'draft' ? 'draft' : '')}>{STATUS_LABEL[form.status] || form.status}</span><button type="button" className="cpBtn cpCollapseBtn" aria-expanded={!patientPanelCollapsed} onClick={() => setPatientPanelCollapsed((value) => !value)}>{patientPanelCollapsed ? 'Tampilkan data' : 'Ringkas data'}</button></div>
        </div>
        {patientPanelCollapsed ? <div className="cpPatientSummary">
          <div><small>Nama pasien</small><b>{form.patient_name || 'Belum diisi'}</b></div>
          <div><small>Nomor rekam medis</small><b>{form.medical_record_no || 'Belum diisi'}</b></div>
          <div><small>Unit / ruangan</small><b>{form.unit_name || roomNames.get(Number(form.room_id)) || 'Belum dipilih'}</b></div>
          <div><small>Episode perawatan</small><b>{fmtDate(form.admission_date)} – {fmtDate(form.discharge_date)}</b></div>
          <div><small>Penanggung jawab PPA</small><b>{ppaNameFields(form.template).filter((field) => String(form.ppa_names?.[field.key] || '').trim()).length} dari {ppaNameFields(form.template).length} terisi</b></div>
        </div> : <>
        <div className="cpFormGrid">
          <div className="cpField span2"><label>Nama pasien *</label><input value={form.patient_name} onChange={(e) => patchForm({ patient_name: e.target.value })} placeholder="Nama sesuai rekam medis" /></div>
          <div className="cpField"><label>Nomor rekam medis</label><input value={form.medical_record_no} onChange={(e) => patchForm({ medical_record_no: e.target.value })} /></div>
          <div className="cpField"><label>Jenis kelamin</label><select value={form.sex} onChange={(e) => patchForm({ sex: e.target.value })}><option value="">Pilih</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option><option value="Tidak diketahui">Tidak diketahui</option></select></div>
          <div className="cpField"><label>Tanggal lahir</label><input type="date" value={form.date_of_birth} onChange={(e) => patchForm({ date_of_birth: e.target.value })} /></div>
          <div className="cpField"><label>Tanggal masuk</label><input type="date" value={form.admission_date} onChange={(e) => patchForm({ admission_date: e.target.value })} /></div>
          <div className="cpField"><label>Tanggal keluar</label><input type="date" value={form.discharge_date} onChange={(e) => patchForm({ discharge_date: e.target.value })} /></div>
          <div className="cpField"><label>Unit / ruangan</label>{isAdmin && !lockRoomScope ? <select value={form.room_id == null ? '' : String(form.room_id)} onChange={(e) => patchForm({ room_id: e.target.value ? Number(e.target.value) : null, unit_name: roomNames.get(Number(e.target.value)) || '' })}><option value="">Pilih unit</option>{rooms.map(roomOption)}</select> : <input value={form.unit_name || roomNames.get(Number(form.room_id)) || ''} readOnly />}</div>
          <div className="cpField"><label>Status audit</label><select value={form.status} onChange={(e) => patchForm({ status: e.target.value })} disabled={!isAdmin && form.status === 'validated'}><option value="draft">Draf</option><option value="submitted">Diajukan</option>{isAdmin && <option value="validated">Tervalidasi</option>}</select></div>
        </div>
        <div className="cpSectionHead"><div><h4>Penanggung jawab PPA</h4><p>Isi nama penanggung jawab sesuai profesi yang terdapat pada clinical pathway diagnosis ini.</p></div></div>
        <div className="cpFormGrid cpPpaGrid">
          {ppaNameFields(form.template).map((field) => {
            const fieldKey = 'ppa:' + field.key
            const options = staffForProfession(field.profession, form.room_id)
            const linkedId = staffAttributions[fieldKey] || ''
            const savedName = form.ppa_names?.[field.key] || ''
            return <div key={field.key} className="cpField">
              <label>{field.label}</label>
              <select value={linkedId} disabled={!form.room_id || staffLoading || (!isAdmin && form.status === 'validated')} onChange={(event) => selectPpaStaff(field, event.target.value)}>
                <option value="">Pilih dari roster terkunci {field.profession ? '(' + humanizeProfession(field.profession) + ')' : ''}…</option>
                {options.map((staff) => <option key={staff.id} value={staff.id}>{staff.display_name}, {staff.employee_code}</option>)}
              </select>
              
            </div>
          })}
        </div>
        </>}
      </div>

      <ClinicalPathwayTextMiningPanel
        items={form.template.items as ClinicalTextMiningItem[]}
        days={form.template.days}
        admissionDate={form.admission_date}
        disabled={!isAdmin && form.status === 'validated'}
        onAccept={acceptTextMiningSuggestion}
      />

      {form.template.clinical_fields?.length > 0 && <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Data klinis khusus format ini</h4></div><span className="cpBadge">{form.template.clinical_fields.filter((field) => !!String(form.clinical_data?.[field.id] || '').trim()).length} dari {form.template.clinical_fields.length} terisi</span></div>
        <div className="cpClinicalFieldGrid">{form.template.clinical_fields.map((field) => <div className="cpClinicalField" key={field.id}>
          <label>{field.label}</label>
          {field.options?.length ? <select className="cpInput" value={form.clinical_data?.[field.id] || ''} disabled={!isAdmin && form.status === 'validated'} onChange={(event) => patchForm({ clinical_data: { ...(form.clinical_data || {}), [field.id]: event.target.value } })}>
            <option value="">Pilih sesuai dokumen sumber…</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select> : <input className="cpInput" value={form.clinical_data?.[field.id] || ''} disabled={!isAdmin && form.status === 'validated'} onChange={(event) => patchForm({ clinical_data: { ...(form.clinical_data || {}), [field.id]: event.target.value } })} placeholder="Isi sesuai dokumentasi pasien" />}
          {field.hint && <small>{field.hint}</small>}
        </div>)}</div>
      </div>}

      {form.template.source_notes?.length > 0 && <div className="cpSourceNotesPanel">
        <b>Catatan dari dokumen sumber</b>
        <ul>{form.template.source_notes.map((note, index) => <li key={'source-note-' + index}>{note}</li>)}</ul>
      </div>}

      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Inklusi penilaian</h4><p>Kriteria berbeda mengikuti dokumen masing-masing diagnosis. Belum diputuskan tidak dianggap memenuhi.</p></div><span className={'cpBadge ' + (currentScore?.inclusionReady && currentScore.included ? '' : 'draft')}>{currentScore?.inclusionReady ? (currentScore.included ? 'Termasuk inklusi' : 'Di luar inklusi') : 'Belum diputuskan'}</span></div>
        <div className="cpCriterionList">{form.template.scoring_rules.inclusion_criteria.map((c) => <div key={c.id} className="cpCriterion"><label>{c.label}</label><div className="cpToggleGroup"><button type="button" className={'cpToggle ' + (form.inclusion_json[c.id] === true ? 'active' : '')} onClick={() => setInclusion(c.id, true)}>Ya / Memenuhi</button><button type="button" className={'cpToggle ' + (form.inclusion_json[c.id] === false ? 'active' : '')} onClick={() => setInclusion(c.id, false)}>Tidak</button></div></div>)}</div>
        {additionalPhaseOptions(form.template).length > 0 && <div className="cpAdditionalPhasePanel">
          <div className="cpSectionHead"><div><h4>Fase tambahan (opsional)</h4></div><span className="cpBadge">{activeAdditionalPhases.length} dari {additionalPhaseOptions(form.template).length} aktif</span></div>
          <div className="cpPhaseToggleList">{additionalPhaseOptions(form.template).map((phase) => {
            const active = (form.additional_phases_json || []).includes(phase.key)
            return <label key={phase.key} className={'cpPhaseToggle ' + (active ? 'active' : '')} title={phase.description}>
              <input type="checkbox" checked={active} onChange={(e) => toggleAdditionalPhase(phase.key, e.target.checked)} />
              <span><strong>{phase.label}</strong><small>{phase.description}</small></span>
              <em>{active ? 'Aktif' : 'Tidak aktif'}</em>
            </label>
          })}</div>
        </div>}
      </div>

      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Checklist pelaksanaan clinical pathway · {form.template.name}{form.patient_name.trim() ? ' · ' + form.patient_name.trim() : ''}</h4></div><span className="cpBadge">{form.template.items.length} item · {checklistDays.length} hari / fase</span></div>
        {focusedCell && (() => {
          const item = form.template.items.find((it) => it.id === focusedCell.itemId)
          const phase = additionalPhaseOptions(form.template).find((entry) => entry.key === focusedCell.day && (form.additional_phases_json || []).includes(entry.key))
          const sched = item?.schedule.find((s) => s.day === focusedCell.day) || (item && phase ? { day: phase.key, policy: 'not_scheduled' as Policy } : undefined)
          const answer = form.answers_json[focusedCell.itemId]?.[focusedCell.day] || {}
          if (!item || !sched) return null
          return <div className="cpCellDetail">
            <div className="cpWide"><b>{item.label}</b><div className="cpTiny">{item.profession} · {item.stage} · {phase?.label || focusedCell.day} · {phase ? 'Fase tambahan aktif' : policyLabel(sched.policy)}</div></div>
            <div className="cpField"><label>Status pelaksanaan</label><select value={answer.status || ''} onChange={(e) => {
              const st = e.target.value as CellStatus
              patchCell(item, focusedCell.day, {
                status: st,
                performed_at: st && !answer.performed_at ? new Date().toISOString() : answer.performed_at,
                performer_profession: answer.performer_profession || item.profession,
              })
            }}><option value="">Belum dinilai</option><option value="done">Sesuai standar</option><option value="not_done">Tidak sesuai / tidak dilakukan</option>{(sched.policy === 'conditional' || !!phase) && <option value="not_applicable">Tidak berlaku (kondisional / fase tambahan)</option>}</select></div>
            <div className="cpField"><label>Petugas pelaksana {item.oppe ? '· bukti OPPE' : ''}</label><select value={staffAttributions['performer:' + item.id + ':' + focusedCell.day] || ''} disabled={!form.room_id || staffLoading || (!isAdmin && form.status === 'validated')} onChange={(e) => selectPerformerStaff(item, focusedCell.day, e.target.value)}><option value="">Pilih petugas dari roster terkunci unit…</option>{staffForProfession(answer.performer_profession || item.profession, form.room_id).map((staff) => <option key={staff.id} value={staff.id}>{staff.display_name}, {staff.employee_code} · {staff.profession_group}</option>)}</select></div>
            <div className="cpField"><label>Profesi pelaksana</label><input value={answer.performer_profession || item.profession || ''} onChange={(e) => patchCell(item, focusedCell.day, { performer_profession: e.target.value })} /></div>
            <div className="cpField"><label>Waktu pelaksanaan</label><input type="datetime-local" value={toLocalDateTimeInput(answer.performed_at)} onChange={(e) => patchCell(item, focusedCell.day, { performed_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></div>
            <div className="cpField"><label>Bukti / referensi</label><input value={answer.evidence || ''} onChange={(e) => patchCell(item, focusedCell.day, { evidence: e.target.value })} placeholder="Nomor dokumen / catatan" /></div>
            <div className="cpField cpWide"><label>Catatan item / alasan ketidaksesuaian</label><textarea value={answer.note || ''} onChange={(e) => patchCell(item, focusedCell.day, { note: e.target.value })} placeholder="Catatan pelaksanaan; untuk variasi, isi pula Bagian Variasi di bawah." /></div>
            <div className="cpWide" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="cpBtn" onClick={() => setFocusedCell(null)}>Tutup rincian</button>{item.oppe && !String(answer.performer_name || '').trim() && <span className="cpNotice">Item ini dipetakan ke OPPE; isi nama pelaksana agar bukti dapat diatribusikan.</span>}</div>
          </div>
        })()}
        <WorkspaceTableViewport label="Checklist pelayanan Clinical Pathway per hari" className="cpTableWrap cpAuditWrap">
          <table className="cpTable cpAuditTable" style={{ '--cp-audit-width': `${460 + checklistDays.length * 84}px`, width: '100%', minWidth: 0, tableLayout: 'fixed' } as CSSProperties}>
            <colgroup><col style={{ width: ((100 - checklistDays.length * 4) * 0.4) + '%' }} /><col style={{ width: ((100 - checklistDays.length * 4) * 0.6) + '%' }} />{checklistDays.map((day) => <col key={day} style={{ width: '4%' }} />)}</colgroup>
            <thead><tr><th>Pilihan PPA</th><th>Item / tindakan dan keterangan</th>{checklistDays.map((day) => { const phase = activeAdditionalPhases.find((item) => item.key === day); return <th key={day} className="cpDayCol" title={phase?.label || day}>{phase?.shortLabel || day}</th> })}</tr></thead>
            <tbody>{(() => {
              const professionMap = new Map<string, CPItem[]>()
              form.template.items.forEach((item) => {
                const key = String(item.profession || 'PPA belum ditentukan').trim() || 'PPA belum ditentukan'
                professionMap.set(key, [...(professionMap.get(key) || []), item])
              })
              const rows: any[] = []
              Array.from(professionMap.entries()).forEach(([profession, items]) => {
                const collapsed = !!collapsedProfessions[profession]
                const chosenCount = items.filter((item) => form.selected_items_json?.[item.id] === true).length
                rows.push(<tr key={'profession-' + profession} className="cpProfessionHead">
                  <td colSpan={2 + checklistDays.length}>
                    <button type="button" className="cpProfessionToggle" aria-expanded={!collapsed} onClick={() => setCollapsedProfessions((old) => ({ ...old, [profession]: !old[profession] }))}>
                      <span className="cpProfessionArrow" aria-hidden="true">{collapsed ? '＋' : '−'}</span>
                      <strong>{humanizeProfession(profession)}</strong>
                      <small>{chosenCount} dari {items.length} pilihan diaktifkan</small>
                    </button>
                  </td>
                </tr>)
                if (collapsed) return
                const stages = new Map<string, { key: string; title: string; items: CPItem[] }>()
                items.forEach((item) => {
                  const titleParts = [item.section ? 'Bagian ' + humanizeProfession(item.section) : '', item.stage ? humanizeProfession(item.stage) : ''].filter(Boolean)
                  const title = titleParts.join(' · ') || 'Kelompok tindakan'
                  const key = title.toLocaleLowerCase('id-ID')
                  const existing = stages.get(key)
                  if (existing) existing.items.push(item)
                  else stages.set(key, { key, title, items: [item] })
                })
                Array.from(stages.values()).forEach((stage) => {
                  rows.push(<tr key={'stage-' + profession + '-' + stage.key} className="cpStageHead"><td colSpan={2 + checklistDays.length}>{stage.title}</td></tr>)
                  stage.items.forEach((item) => {
                    const selected = form.selected_items_json?.[item.id] === true
                    rows.push(<tr key={item.id}>
                      <td className={'cpChoiceCell ' + (!selected ? 'cpChoiceDisabled' : '')}>
                        <label className="cpChoiceToggle">
                          <input type="checkbox" checked={selected} onChange={(e) => toggleItemChoice(item, e.target.checked)} aria-label={'Pilih ' + (item.choice || item.label) + ' untuk ' + humanizeProfession(profession)} />
                          <span>{item.choice || 'Pilih item ini'}</span>
                        </label>
                        {!item.choice && <small className="cpChoiceHint">Aktifkan untuk mengisi hari perawatan.</small>}
                      </td>
                      <td><div className="cpItemLabel">{item.label || 'Nama item belum diisi'}</div>{item.substage && <div className="cpTiny">{item.substage}</div>}{item.detail && <div className="cpItemDetail">{item.detail}</div>}{item.oppe && <div className="cpTiny">Bukti OPPE</div>}</td>
                      {checklistDays.map((day) => {
                        const phase = activeAdditionalPhases.find((item) => item.key === day)
                        const sched = item.schedule.find((s) => s.day === day) || { day, policy: 'not_scheduled' as Policy }
                        const status = selected ? cellStatus(form, item.id, day) : ''
                        return <td key={day} className={'cpCell ' + (phase ? 'cpAdditionalPhase' : sched.policy)}>
                          <div className="cpCellControls">
                            <button type="button" className={'cpMark ' + (status || '')} disabled={!selected} onClick={() => toggleCell(item, day)} aria-label={(status === 'done' ? 'Hapus tanda sesuai' : 'Tandai sesuai') + ' · ' + item.label + ' · ' + (phase?.label || day)} title={!selected ? 'Aktifkan pilihan terlebih dahulu' : status === 'done' ? 'Klik untuk menghapus tanda sesuai' : status === 'not_done' ? 'Klik untuk menghapus tanda tidak sesuai' : 'Klik untuk menandai sesuai'}>{status === 'done' ? '✓' : status === 'not_done' ? '×' : status === 'not_applicable' ? 'N/A' : '□'}</button>
                            <button type="button" className="cpCellEdit" disabled={!selected} onClick={() => setFocusedCell({ itemId: item.id, day })} aria-label={'Rincian ' + item.label + ' ' + (phase?.label || day)} title={!selected ? 'Aktifkan pilihan terlebih dahulu' : 'Rincian petugas, waktu, bukti, atau ketidaksesuaian'}>⋯</button>
                          </div>
                        </td>
                      })}
                    </tr>)
                  })
                })
              })
              return rows
            })()}</tbody>
          </table>
        </WorkspaceTableViewport>
        <div className="cpSectionHead"><div><h4>Ringkasan hasil</h4></div></div>
        {renderScore()}
      </div>

      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Variasi perawatan / pelayanan</h4><p>Bagian D meminta variasi dan Justification For An Exception To Fair Opportunity diisi bila terjadi penyimpangan.</p></div><span className={'cpBadge ' + (currentScore?.variationComplete ? '' : 'draft')}>{currentScore?.variationComplete ? 'Terdokumentasi' : 'Belum lengkap'}</span></div>
        <div className="cpToggleGroup" style={{ marginBottom: 12 }}>
          <button type="button" className={'cpToggle ' + (form.variations_json.reviewed && form.variations_json.items.length === 0 ? 'active' : '')} onClick={() => patchForm({ variations_json: { reviewed: true, items: [] } })}>Tidak ada variasi</button>
          <button type="button" className={'cpToggle ' + (form.variations_json.items.length > 0 ? 'active' : '')} onClick={() => { if (!form.variations_json.items.length) addVariation(); else patchForm({ variations_json: { ...form.variations_json, reviewed: true } }) }}>Ada variasi</button>
          <button type="button" className="cpBtn" onClick={addVariation}>＋ Tambah variasi</button>
        </div>
        {form.variations_json.items.length > 0 ? <div className="cpVarList">{form.variations_json.items.map((v, i) => <div className="cpVar" key={v.id}>
          <div className="cpVarHead"><b>Variasi {i + 1}</b><button type="button" className="cpBtn" onClick={() => removeVariation(v.id)}>Hapus</button></div>
          <div className="cpField"><label>Tanggal</label><input type="date" value={v.date} onChange={(e) => patchVariation(v.id, { date: e.target.value })} /></div>
          <div className="cpField"><label>Item CP terkait (opsional)</label><select value={v.item_id || ''} onChange={(e) => patchVariation(v.id, { item_id: e.target.value })}><option value="">Pilih item</option>{form.template.items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}</select></div>
          <div className="cpField full"><label>Ringkasan variasi *</label><textarea value={v.variation} onChange={(e) => patchVariation(v.id, { variation: e.target.value })} /></div>
          <div className="cpField full"><label>Alasan *</label><textarea value={v.reason} onChange={(e) => patchVariation(v.id, { reason: e.target.value })} /></div>
          <div className="cpField full"><label>Justification For An Exception To Fair Opportunity *</label><textarea value={v.justification} onChange={(e) => patchVariation(v.id, { justification: e.target.value })} /></div>
        </div>)}</div> : <div className="cpNotice info">Pilih “Tidak ada variasi” secara eksplisit bila memang tidak ditemukan variasi. Jika ada variasi, setiap catatan harus memiliki tanggal, ringkasan, alasan, dan justifikasi.</div>}
      </div>

      <div className="cpGlass cpFooter">
        <div><span className="cpTiny">Pengisi: {userName} · Petugas pelaksana dicatat pada rincian tiap item bila diperlukan.</span></div>
        <div className="cpActions"><button type="button" className="cpBtn" disabled={saving} onClick={() => void saveAudit('draft')}>{saving ? 'Menyimpan…' : 'Simpan draf'}</button><button type="button" className="cpBtn primary" disabled={saving} onClick={() => void saveAudit(isAdmin && form.status !== 'draft' ? 'validated' : 'submitted')}>{saving ? 'Menyimpan…' : isAdmin && form.status === 'submitted' ? 'Simpan & validasi' : form.status === 'validated' ? 'Perbarui audit tervalidasi' : 'Simpan / ajukan audit'}</button></div>
      </div>
    </>}

    {screen === 'builder' && builder && isAdmin && <div className="cpBuilderOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) void (async () => { if (await aurekaConfirm('Tutup editor? Perubahan yang belum disimpan akan hilang.')) closeBuilder() })() }}>
      <div className="cpBuilderModal" role="dialog" aria-modal="true" aria-labelledby="cpBuilderTitle">
      <div className="cpBuilderModalHead"><div><span className="cpEyebrow">Master Clinical Pathway</span><h3 id="cpBuilderTitle">{builderIsNew ? 'Tambah Clinical Pathway baru' : 'Edit format · ' + builder.name}</h3></div><button type="button" className="cpBuilderClose" aria-label="Tutup editor" disabled={saving} onClick={() => void (async () => { if (await aurekaConfirm('Tutup editor? Perubahan yang belum disimpan akan hilang.')) closeBuilder() })()}>✕</button></div>
      <div className="cpBuilderModalBody">
      {message && <div className={'cpNotice ' + (messageKind === 'error' ? 'error' : 'info')} role={messageKind === 'error' ? 'alert' : 'status'}>{message}</div>}
      
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Identitas format Clinical Pathway</h4><p>Lengkapi identitas diagnosis, status publikasi, ambang penilaian, dan definisi perhitungan.</p></div><span className="cpBadge">{builderIsNew ? 'Master baru' : 'Versi ' + builder.version}</span></div>
        <div className="cpFormGrid">
          <div className="cpField"><label>Kode internal</label><input aria-label="Kode internal" value={builder.code} readOnly={!builderIsNew} onChange={(e) => patchBuilder({ code: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-') })} placeholder="mis. cp-diagnosis-baru" /><small className="cpTiny">Huruf kecil, angka, dan tanda hubung. Kode format lama dikunci untuk menjaga tautan audit.</small></div>
          <div className="cpField span2"><label>Nama diagnosis / Clinical Pathway *</label><input aria-label="Nama diagnosis atau Clinical Pathway" value={builder.name} onChange={(e) => patchBuilder({ name: e.target.value })} placeholder="Nama diagnosis atau tindakan" /></div>
          <div className="cpField"><label>Kode ICD-10</label><input aria-label="Kode ICD-10" value={builder.icd10} onChange={(e) => patchBuilder({ icd10: e.target.value })} placeholder="Kode ICD-10" /></div>
          <div className="cpField"><label>Status master</label><select aria-label="Status master" value={builder.status} onChange={(e) => patchBuilder({ status: e.target.value })}><option value="draft">Draf</option><option value="published">Aktif / diterbitkan</option><option value="retired">Tidak aktif</option></select></div>
          <div className="cpField span2"><label>Nama dokumen sumber / rujukan</label><input aria-label="Nama dokumen sumber" value={builder.source_filename} onChange={(e) => patchBuilder({ source_filename: e.target.value })} placeholder="Nama dokumen atau sumber penyusunan" /></div>
          <div className="cpField"><label>Standar keterisian (%)</label><input aria-label="Standar keterisian persen" type="number" min="0" max="100" value={builder.scoring_rules.completion_threshold_pct} onChange={(e) => patchBuilderScoring({ completion_threshold_pct: n(e.target.value) })} /></div>
          <div className="cpField"><label>Target kepatuhan (%)</label><input aria-label="Target kepatuhan persen" type="number" min="0" max="100" value={builder.scoring_rules.compliance_target_pct} onChange={(e) => patchBuilderScoring({ compliance_target_pct: n(e.target.value) })} /></div>
          <div className="cpField span2"><label>Definisi persentase keterisian</label><textarea aria-label="Definisi persentase keterisian" rows={2} value={builder.scoring_rules.completion_definition} onChange={(e) => patchBuilderScoring({ completion_definition: e.target.value })} /></div>
          <div className="cpField span2"><label>Definisi persentase kepatuhan</label><textarea aria-label="Definisi persentase kepatuhan" rows={2} value={builder.scoring_rules.compliance_definition} onChange={(e) => patchBuilderScoring({ compliance_definition: e.target.value })} /></div>
          <div className="cpField"><label>Variasi pelayanan wajib diisi?</label><select aria-label="Variasi pelayanan wajib diisi" value={builder.scoring_rules.variation_required === false ? 'false' : 'true'} onChange={(e) => patchBuilderScoring({ variation_required: e.target.value === 'true' })}><option value="true">Ya, wajib dinyatakan</option><option value="false">Tidak diwajibkan</option></select></div>
          <div className="cpField span2"><label>Ketentuan variasi pelayanan</label><textarea aria-label="Ketentuan variasi pelayanan" rows={2} value={builder.scoring_rules.variation_definition} onChange={(e) => patchBuilderScoring({ variation_definition: e.target.value })} /></div>
        </div>
      </div>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Checklist item / tindakan dan jadwal</h4><p>Atur kolom pilihan PPA, profesi, kelompok, item, keterangan, dan status jadwal per hari. Hijau = wajib, kuning = kondisional, putih = tidak dijadwalkan.</p></div><div className="cpActions"><span className="cpBadge">{builder.items.length} item · {builder.days.length} hari/tahap</span><button type="button" className="cpBtn" onClick={addBuilderDay}>＋ Tambah hari / tahap</button><button type="button" className="cpBtn primary" onClick={addBuilderItem}>＋ Tambah item</button></div></div>
        <div className="cpBuilderLegend"><span><i className="cpLegendDot required" /> Jadwal wajib</span><span><i className="cpLegendDot conditional" /> Jadwal kondisional</span><span><i className="cpLegendDot not_scheduled" /> Tidak dijadwalkan</span></div>
        <WorkspaceTableViewport label="Checklist dan format Clinical Pathway · 3" className="cpTableWrap cpBuilderTable">
          <table className="cpTable cpBuilderMatrix" style={{ width: 951 + builder.days.length * 90, minWidth: 951 + builder.days.length * 90, tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: 170 }} /><col style={{ width: 145 }} /><col style={{ width: 180 }} /><col style={{ width: 300 }} />{builder.days.map((day,index)=><col key={'builder-col-'+index} style={{ width: 90 }} />)}<col style={{ width: 76 }} /><col style={{ width: 80 }} /></colgroup>
            <thead><tr><th>Profesi / bagian</th><th>Pilihan PPA</th><th>Kelompok / tahap</th><th>Item / tindakan dan keterangan</th>
              {builder.days.map((day,index)=><th key={'builder-day-'+index} className="cpBuilderDayHead"><input aria-label="Nama hari atau tahap" className="cpBuilderDayName" value={day} onChange={(e)=>renameBuilderDay(day,e.target.value)} aria-label={'Nama hari atau tahap '+(index+1)} title="Ubah nama hari/tahap"/><button type="button" className="cpBuilderDayRemove" disabled={builder.days.length<=1} onClick={()=>removeBuilderDay(day)} title="Hapus hari/tahap" aria-label={'Hapus '+day}>×</button></th>)}
              <th>Bukti OPPE</th><th>Hapus</th></tr></thead>
            <tbody>{builder.items.map((item)=><tr key={item.id}>
              <td className="cpBuilderTextCell"><input aria-label="Profesi atau bagian" className="cpInput" value={item.profession} onChange={(e)=>patchBuilderItem(item.id,{profession:e.target.value})} placeholder="Profesi / kelompok PPA" aria-label="Profesi PPA"/><input aria-label="Bagian" className="cpInput" value={item.section} onChange={(e)=>patchBuilderItem(item.id,{section:e.target.value})} placeholder="Bagian (A, B, C…)" aria-label="Bagian pathway"/></td>
              <td><input aria-label="Pilihan PPA" className="cpInput" value={item.choice} onChange={(e)=>patchBuilderItem(item.id,{choice:e.target.value})} placeholder="Pilih item ini" aria-label="Label pilihan PPA"/></td>
              <td><input aria-label="Kelompok atau tahap" className="cpInput" value={item.stage} onChange={(e)=>patchBuilderItem(item.id,{stage:e.target.value})} placeholder="Kelompok / tahap" aria-label="Kelompok atau tahap"/></td>
              <td className="cpBuilderItemCell"><input aria-label="Item tindakan" className="cpInput" value={item.label} onChange={(e)=>patchBuilderItem(item.id,{label:e.target.value})} placeholder="Nama item / tindakan *" aria-label="Nama item atau tindakan"/><textarea aria-label="Keterangan item" className="cpInput" value={item.detail} onChange={(e)=>patchBuilderItem(item.id,{detail:e.target.value})} placeholder="Keterangan, dosis, atau detail" aria-label="Keterangan atau dosis"/><textarea aria-label="Kata kunci text mining" className="cpInput cpBuilderAlias" value={(item.text_mining?.aliases || []).join(', ')} onChange={(e)=>patchBuilderItem(item.id,{text_mining:{...(item.text_mining || {}),aliases:e.target.value.split(',').map((value)=>value.trim()).filter(Boolean)}})} placeholder="Sinonim / alias text mining (pisahkan dengan koma)" aria-label="Sinonim text mining"/></td>
              {builder.days.map((day,index)=>{const policy=item.schedule.find((cell)=>cell.day===day)?.policy||'not_scheduled';return <td key={item.id+'-schedule-'+index} className={'cpCell cpBuilderScheduleCell '+policy}><select aria-label="Aturan jadwal" className={'cpInput cpBuilderPolicy '+policy} value={policy} onChange={(e)=>patchBuilderSchedule(item.id,day,e.target.value as Policy)} aria-label={'Jadwal '+day+' · '+item.label}><option value="required">Wajib · hijau</option><option value="conditional">Kondisional · kuning</option><option value="not_scheduled">Tidak dijadwalkan</option></select></td>})}
              <td><label className="cpOppe"><input type="checkbox" checked={!!item.oppe} onChange={(e)=>patchBuilderItem(item.id,{oppe:e.target.checked})}/>Ya</label></td><td><button type="button" className="cpBtn cpBuilderDelete" onClick={()=>removeBuilderItem(item.id)}>Hapus</button></td>
            </tr>)}</tbody>
          </table>
        </WorkspaceTableViewport>
        <div className="cpTiny" style={{marginTop:10}}>Nama hari/tahap dapat diedit pada judul kolom. Saat dihapus, semua aturan jadwal pada kolom tersebut ikut dihapus dari master.</div>
      </div>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Inklusi penilaian</h4><p>Tambahkan kriteria sesuai dokumen atau keputusan klinis yang telah disahkan. Kriteria ini digunakan dalam penilaian Bagian D.</p></div><div className="cpActions"><span className="cpBadge">{(builder.scoring_rules.inclusion_criteria||[]).length} kriteria</span><button type="button" className="cpBtn" onClick={addBuilderCriterion}>＋ Tambah kriteria</button></div></div>
        <div className="cpBuilderConfigList">{(builder.scoring_rules.inclusion_criteria||[]).map((criterion)=><div className="cpBuilderConfigRow" key={criterion.id}><input className="cpInput" value={criterion.id} onChange={(e)=>patchBuilderCriterion(criterion.id,{id:e.target.value})} placeholder="ID kriteria" aria-label="ID kriteria inklusi"/><input className="cpInput cpBuilderLong" value={criterion.label} onChange={(e)=>patchBuilderCriterion(criterion.id,{label:e.target.value})} placeholder="Kriteria inklusi yang harus diputuskan" aria-label="Label kriteria inklusi"/><select className="cpInput" value={criterion.expected===false?'false':'true'} onChange={(e)=>patchBuilderCriterion(criterion.id,{expected:e.target.value==='true'})} aria-label="Jawaban yang memenuhi inklusi"><option value="true">Memenuhi jika Ya</option><option value="false">Memenuhi jika Tidak</option></select><button type="button" className="cpBtn cpBuilderDelete" onClick={()=>removeBuilderCriterion(criterion.id)}>Hapus</button></div>)}</div>
        {(builder.scoring_rules.inclusion_criteria||[]).length===0&&<div className="cpEmpty">Belum ada kriteria inklusi. Tanpa kriteria, inklusi otomatis tidak membatasi penilaian.</div>}
      </div>
      <div className="cpGlass cpPanel">
        <div className="cpSectionHead"><div><h4>Kriteria dan rincian Bagian D</h4></div><div className="cpActions"><span className="cpBadge">{(builder.scoring_rules.source_section_d||[]).length} butir</span><button type="button" className="cpBtn" onClick={addBuilderSectionD}>＋ Tambah butir</button></div></div>
        <div className="cpBuilderConfigList">{(builder.scoring_rules.source_section_d||[]).map((criterion,index)=><div className="cpBuilderConfigRow" key={'section-d-'+index}><input className="cpInput" value={criterion.item} onChange={(e)=>patchBuilderSectionD(index,{item:e.target.value})} placeholder="Item penilaian" aria-label="Item penilaian Bagian D"/><textarea className="cpInput cpBuilderLong" value={criterion.standard} onChange={(e)=>patchBuilderSectionD(index,{standard:e.target.value})} placeholder="Standar pada dokumen sumber" aria-label="Standar penilaian"/><input className="cpInput" value={criterion.source_result} onChange={(e)=>patchBuilderSectionD(index,{source_result:e.target.value})} placeholder="Hasil / catatan sumber" aria-label="Hasil sumber"/><button type="button" className="cpBtn cpBuilderDelete" onClick={()=>removeBuilderSectionD(index)}>Hapus</button></div>)}</div>
        {(builder.scoring_rules.source_section_d||[]).length===0&&<div className="cpEmpty">Belum ada butir dari dokumen sumber.</div>}
      </div>
      <div className="cpGlass cpFooter">
        <div><span className="cpTiny">Format ini dapat dipublikasikan setelah ditinjau dan disahkan. Pilihan jadwal berwarna hijau/kuning akan tampil pada checklist audit.</span><div className="cpTiny">{builder.items.length} item · {builder.days.length} hari/tahap</div></div>
        <div className="cpActions"><button type="button" className="cpBtn" onClick={closeBuilder}>Batal</button><button type="button" className="cpBtn primary" disabled={saving} onClick={()=>void saveBuilder()}>{saving?'Menyimpan…':builderIsNew?'Simpan Clinical Pathway baru':'Simpan versi master baru'}</button></div>
      </div>
      </div>
      </div>
    </div>}

  </div>
}
