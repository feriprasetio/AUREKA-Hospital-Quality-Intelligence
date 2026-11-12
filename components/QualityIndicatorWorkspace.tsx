'use client'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'

import {Fragment,useCallback,useEffect,useMemo,useRef,useState} from 'react'
import dynamic from 'next/dynamic'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import {createPortal} from 'react-dom'
import {useAccessibleDialog} from '@/components/layout/useAccessibleDialog'













import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { compareToTarget, isWithinVisitWindow, resolveMeasurementKind } from '@/lib/aureka/indicator-engine'
import { buildIndicatorDropdownOptions, findIndicatorDropdownSelection, shouldUseIndicatorDropdown } from '@/lib/aureka/indicator-dropdown'
import { getOutpatientDoctorsForClinic } from '@/lib/aureka/outpatient-logbook'
import { calculateInclusiveDurationDays, matchLogbookOption } from '@/lib/aureka/complaint-logbook'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {toUserFacingError} from '@/lib/ui/error-feedback'
import {readAllPages} from '@/lib/aureka/pagination'
import {LiquidGlass,LiquidGlassButton} from '@/components/LiquidGlass'
import qualityAuditLayout2026 from '@/data/quality-audit-layout-2026.json'
const ClinicalDeathAuditWorkspace=dynamic(()=>import('@/components/ClinicalDeathAuditWorkspace'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Audit Klinis dan Kematian" compact/>})

const ComplaintExcelImportDialog=dynamic(()=>import('@/components/ComplaintExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Pengaduan" compact/>})
const ItExcelImportDialog=dynamic(()=>import('@/components/ItExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Informatika dan Teknologi" compact/>})
const AmbulanceExcelImportDialog=dynamic(()=>import('@/components/AmbulanceExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Ambulans" compact/>})
const IbsExcelImportDialog=dynamic(()=>import('@/components/IbsExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Bedah Sentral" compact/>})
const PharmacyExcelImportDialog=dynamic(()=>import('@/components/PharmacyExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Farmasi" compact/>})
const GiziExcelImportDialog=dynamic(()=>import('@/components/GiziExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Gizi" compact/>})
const LaboratoryExcelImportDialog=dynamic(()=>import('@/components/LaboratoryExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Laboratorium" compact/>})
const IgdExcelImportDialog=dynamic(()=>import('@/components/IgdExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor IGD" compact/>})
const IgdConsultationAuditPanel=dynamic(()=>import('@/components/IgdConsultationAuditPanel'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Audit Konsultasi DPJP" compact/>})
const OutpatientExcelImportDialog=dynamic(()=>import('@/components/OutpatientExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Rawat Jalan" compact/>})
const RehabMedikExcelImportDialog=dynamic(()=>import('@/components/RehabMedikExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Rehabilitasi Medik" compact/>})
const IcuExcelImportDialog=dynamic(()=>import('@/components/IcuExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor ICU" compact/>})
const PerinatologyExcelImportDialog=dynamic(()=>import('@/components/PerinatologyExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Perinatologi" compact/>})
const NicuExcelImportDialog=dynamic(()=>import('@/components/NicuExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor NICU" compact/>})
const NifasExcelImportDialog=dynamic(()=>import('@/components/NifasExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Nifas" compact/>})
const PonekExcelImportDialog=dynamic(()=>import('@/components/PonekExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor PONEK" compact/>})
const PediatricInpatientExcelImportDialog=dynamic(()=>import('@/components/PediatricInpatientExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Rawat Inap Anak" compact/>})
const SurgicalInpatientExcelImportDialog=dynamic(()=>import('@/components/SurgicalInpatientExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Rawat Inap Bedah" compact/>})
const IsolasiInpatientExcelImportDialog=dynamic(()=>import('@/components/IsolasiInpatientExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Rawat Inap Isolasi" compact/>})
const SarafInpatientExcelImportDialog=dynamic(()=>import('@/components/SarafInpatientExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Rawat Inap Saraf" compact/>})
const PenyakitDalamInpatientExcelImportDialog=dynamic(()=>import('@/components/PenyakitDalamInpatientExcelImportDialog'),{ssr:false,loading:()=> <AsyncStatePanel state="loading" title="Memuat Impor Rawat Inap Penyakit Dalam" compact/>})

const sb=aurekaSupabase
const q=()=>sb.schema('aureka_quality')
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const CONTAINERS=['Audit Indikator Mutu','Audit Clinical Pathway','Audit Klinis dan Kematian'] as const
const YEARS=[2025,2026,2027,2028,2029]

type ImportDialogKey='complaint'|'it'|'ambulance'|'ibs'|'pharmacy'|'gizi'|'laboratory'|'igd'|'outpatient'|'rehab'|'icu'|'perinatology'|'nicu'|'nifas'|'ponek'|'pediatric-inpatient'|'surgical-inpatient'|'isolasi-inpatient'|'saraf-inpatient'|'penyakit-dalam-inpatient'
type Room={id:number;name:string};type Profile=Record<string,any>;type TeamStaffOption={id:string;employee_code:string;display_name:string;profession_group:string;position_title:string;directory_status:'available';room_id:number};type AuditLayout={roomId:number;fields:string[];indicators:string[];measurementGrain?:string;providerGroups?:{clinic:string;doctors:string[]}[];fieldOptions?:Record<string,string[]>;indicatorOptions?:Record<string,string[]>;fieldTypes?:Record<string,'select'|'date'|'datetime-local'|'time'|'number'|'textarea'|'text'>;indicatorControl?:'select'|'radio'};type Resp={answer?:string;occurrence?:string;time?:string;start?:string;end?:string;minutes?:number|null;value?:number|null;numerator?:number|null;denominator?:number|null;noncompliant?:number|null;evidence?:string;reference?:string;notes?:string;code?:number|null;source_value?:string;source_label?:string;source_option?:boolean;review_required?:boolean;free_text?:string};type Patient=Record<string,any>

const CSS=`
.aq{display:grid;gap:14px}.aqInlineEditor{display:grid;gap:0;overflow:visible;border-radius:18px;box-shadow:0 8px 28px rgba(19,48,36,.08);background:rgba(255,255,255,.82)}.aqInlineEditor .aqDHead{padding:17px 19px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.aqInlineEditor .aqDHead h4{font-size:22px;margin:4px 0;letter-spacing:-.04em}.aqInlineEditor .aqBody{padding:16px 19px;max-height:none;overflow:visible}.aqInlineEditor .aqFoot{position:sticky;bottom:0;z-index:4;padding:12px 19px;border-top:1px solid var(--line);background:rgba(248,251,249,.96);backdrop-filter:blur(10px);display:flex;justify-content:space-between;align-items:center;gap:10px;border-radius:0 0 18px 18px}.aqInlineEditorRow td{padding:12px!important;background:rgba(var(--accent-rgb),.045)!important;white-space:normal!important}.aqInlineEditorRow:hover td{background:rgba(var(--accent-rgb),.045)!important}.aq .glass{position:relative;min-width:0;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 3px rgba(19,48,36,.045)}.aqHead{padding:20px 22px;display:flex;justify-content:space-between;gap:18px}.aqHead h3{margin:5px 0;font-size:29px;letter-spacing:-.055em}.aqHead p{margin:0;max-width:760px;color:var(--muted);font-size:12px;line-height:1.55}.aqActions{display:flex;gap:8px;flex-wrap:wrap}.aqBtn{min-height:42px;border:1px solid rgba(255,255,255,.78);background:rgba(255,255,255,.44);color:#264237;border-radius:13px;padding:10px 13px;font-size:11px;font-weight:900}.aqBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}.aqTabs{padding:6px;display:flex;gap:7px;flex-wrap:wrap}.aqTab{border:1px solid var(--line);background:#fff;color:#52625b;padding:9px 13px;border-radius:10px;font-size:12px;font-weight:750;min-height:40px}.aqTab.active{background:var(--accent-soft);border-color:rgba(var(--accent-rgb),.24);color:var(--accent2)}.aqFilters{padding:17px 18px}.aqGrid{display:grid;grid-template-columns:1fr .55fr .75fr 1.8fr;gap:10px}.aqField span,.aqLabel{display:block;font-size:10px;color:#6f7d75;font-weight:900;text-transform:none;letter-spacing:.055em;margin:0 0 6px 2px}.aqField input,.aqField select,.aqField textarea,.aqCat input,.aqCat select{width:100%;border:1px solid rgba(35,63,50,.12);border-radius:14px;background:rgba(255,255,255,.56);padding:11px 13px;font-size:13px;color:var(--ink);outline:none;min-height:46px}.aqField textarea{min-height:88px;resize:vertical}.aqMonths{display:grid;grid-template-columns:repeat(13,minmax(70px,1fr));gap:7px;overflow:auto;margin-top:6px}.aqMonths button{border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.34);border-radius:13px;padding:10px 8px;color:#506059;font-weight:850;font-size:11px;white-space:nowrap}.aqMonths .active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}.aqKpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.aqKpi .glass{padding:16px 17px}.aqKpi span{font-size:10px;color:#6c7a73;font-weight:900;text-transform:none}.aqKpi strong{display:block;font-size:27px;margin-top:5px}.aqKpi small{color:var(--muted);font-size:10px}.aqTable{overflow:hidden}.aqTableHead{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line)}.aqTableHead h4{margin:0;font-size:18px}.aqTableHead p{margin:4px 0 0;color:var(--muted);font-size:11px}.aqMeta{display:flex;gap:7px;flex-wrap:wrap}.aqPill{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.66);font-size:10px;font-weight:850}.aqPill.green{background:var(--accent-soft);color:var(--accent2);border:0}.aqNotice{padding:10px 17px;background:#fff8e7;color:#7b5d25;font-size:11px}.aqWrap{overflow:auto;max-height:calc(100vh - 330px);max-width:100%;width:100%;min-width:0;overscroll-behavior:contain}table.aqData{width:100%;max-width:100%;min-width:0;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:12px}table.aqData th,table.aqData td{padding:10px 9px;border-bottom:1px solid var(--line);text-align:left;white-space:normal;overflow-wrap:anywhere;word-break:normal;vertical-align:top}table.aqData th{position:sticky;top:0;background:rgba(249,252,250,.94);font-size:9px;color:#748078;text-transform:none;z-index:3}table.aqData tbody tr{cursor:pointer}.aqName{font-weight:900;color:var(--accent2)}.aqSub{font-size:10px;color:var(--muted)}.aqStatus{padding:6px 9px;border-radius:999px;font-size:9px;font-weight:900;background:#eef1ef}.aqStatus.aktif{background:#e8f7ef;color:#216b49}.aqStatus.ready-for-review{background:#edf2ff;color:#4c5f98}.aqStatus.validated{background:var(--accent-soft);color:var(--accent2)}.aqLos,.aqFilled{font-weight:900;color:var(--accent2)}.aqHideStatus th:nth-last-child(2),.aqHideStatus td:nth-last-child(2){display:none}.aqValidatorLogbook th:last-child,.aqValidatorLogbook td:last-child{display:none}.aqEmpty{min-height:120px;display:grid;place-items:center;color:var(--muted);font-size:11px}.aqBack{position:fixed;inset:0;z-index:100;background:rgba(11,22,17,.24);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}.aqDrawer{height:100%;width:min(950px,96vw);background:rgba(248,251,249,.98);box-shadow:-24px 0 65px rgba(0,0,0,.18);display:flex;flex-direction:column}.aqWide{width:min(1180px,97vw)}.aqDHead{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:20px}.aqDHead h4{font-size:24px;margin:4px 0}.aqDHead p{margin:0;color:var(--muted);font-size:11px}.aqClose{width:38px;height:38px;border:0;background:#eceeed;border-radius:12px;font-size:22px}.aqBody{padding:18px 22px;overflow:auto;min-height:0;flex:1}.aqEpisode{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.aqDerived{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:13px 0}.aqDerived div{padding:11px 13px;background:#fff;border:1px solid var(--line);border-radius:14px}.aqDerived span{font-size:9px;color:var(--muted)}.aqDerived strong{display:block;margin-top:4px;font-size:13px}.aqGuard{padding:11px 13px;border-radius:14px;background:#e9f7ef;color:#1e6c43;font-size:11px;line-height:1.5}.aqSection{display:flex;justify-content:space-between;align-items:end;margin:15px 0 8px}.aqSection h5{margin:0;font-size:17px}.aqSection span{font-size:10px;color:var(--muted)}.aqInd{background:#fff;border:1px solid var(--line);border-radius:17px;margin:11px 0;overflow:hidden}.aqInd.hit{border-color:rgba(var(--accent-rgb),.3)}.aqIHead{padding:14px 15px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px}.aqIHead strong{font-size:13px;line-height:1.42}.aqMetaText{font-size:9px;color:var(--muted);margin-top:4px}.aqMatch{font-size:9px;background:var(--accent-soft);color:var(--accent2);padding:5px 7px;border-radius:999px;font-weight:900;white-space:nowrap}.aqIBody{padding:15px}.aqQ{font-size:16px;font-weight:900;line-height:1.42;margin-bottom:9px}.aqTwo{display:grid;grid-template-columns:1fr 1fr;gap:10px}.aqAuto{padding:11px 13px;background:#eef8f4;border:1px solid #dcefe7;border-radius:13px}.aqAuto span,.aqAuto small{display:block;font-size:9px;color:var(--muted)}.aqAuto strong{display:block;font-size:18px;color:var(--accent2)}.aqRadio{display:flex;gap:8px;flex-wrap:wrap}.aqRadio label{display:inline-flex;align-items:center;gap:7px;border:1px solid #d8dadc;background:#fff;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:800}.aqEvidence{border-top:1px dashed #d9dcda;margin-top:12px;padding-top:11px}.aqFoot{padding:13px 22px;border-top:1px solid var(--line);background:rgba(255,255,255,.82);display:flex;justify-content:space-between;align-items:center;gap:10px}.aqCat{padding:18px 22px;overflow:auto}.aqCatFilters{display:grid;grid-template-columns:1fr 1fr 1.5fr auto;gap:9px;margin-bottom:12px}.aqCatWrap{overflow:auto;max-height:calc(100vh - 220px)}table.aqCatalog{width:100%;min-width:1100px;border-collapse:separate;border-spacing:0}table.aqCatalog th,table.aqCatalog td{font-size:10px;padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}table.aqCatalog th{font-size:8px;color:#748078;position:sticky;top:0;background:#f8fbf9}table.aqCatalog td:nth-child(4){white-space:normal;min-width:390px}.aqCatalog td:nth-child(8),.aqCatalog td:nth-child(9){white-space:normal;min-width:320px;max-width:520px}@media(max-width:1180px){.aqGrid{grid-template-columns:1fr 1fr 1fr}.aqGrid label:last-child{grid-column:1/-1}.aqEpisode{grid-template-columns:1fr 1fr}.aqCatFilters{grid-template-columns:1fr 1fr}.aqMonths{grid-template-columns:repeat(13,86px)}}@media(max-width:850px){.aqHead{display:block}.aqActions{margin-top:12px}.aqGrid{grid-template-columns:1fr 1fr}.aqKpi{grid-template-columns:1fr}.aqWrap{max-height:calc(100vh - 350px)}.aqDrawer,.aqWide{width:100%}.aqDerived{grid-template-columns:1fr}.aqTwo{grid-template-columns:1fr}.aqEpisode{grid-template-columns:1fr 1fr}.aqFoot{display:block}.aqCatFilters{grid-template-columns:1fr 1fr}}@media(max-width:560px){.aqGrid{grid-template-columns:1fr}.aqGrid label:last-child{grid-column:auto}.aqEpisode{grid-template-columns:1fr}.aqIHead{display:block}.aqMatch{display:inline-flex;margin-top:7px}.aqCatFilters{grid-template-columns:1fr}.aqMeta{margin-top:8px}}

/* Audit Indikator Mutu — balanced enterprise workspace */
.aqAuditWorkspace{gap:10px;min-width:0}
.aqAuditWorkspace .aqFilters{padding:11px 13px;border-radius:13px;background:#fff;border-color:#e5ece7;box-shadow:0 1px 2px rgba(20,48,34,.035)}
.aqAuditWorkspace .aqGrid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(95px,120px) minmax(150px,200px);grid-template-areas:"unit year month" "actions actions actions";gap:10px;align-items:end}
.aqAuditWorkspace .aqGrid>.aqField:nth-of-type(1){grid-area:unit;min-width:0}
.aqAuditWorkspace .aqGrid>.aqField:nth-of-type(2){grid-area:year;min-width:0}
.aqAuditWorkspace .aqGrid>.aqField:nth-of-type(3){grid-area:month;min-width:0}
.aqAuditWorkspace .aqField.aqLocalSearch{display:none!important}
.aqAuditWorkspace .aqField span{font-size:9px;font-weight:750;letter-spacing:.025em;color:#738178;margin-bottom:4px}
.aqAuditWorkspace .aqField select,.aqAuditWorkspace .aqField input{height:38px;min-height:38px;padding:7px 10px;border:1px solid #e1e9e3;border-radius:9px;background:#fff;color:#26372d;font-size:12px;box-shadow:none}
.aqAuditWorkspace .aqField select:focus,.aqAuditWorkspace .aqField input:focus{outline:2px solid rgba(22,128,92,.14);border-color:#8bb9a0}
.aqAuditWorkspace .aqDataBar{display:flex;align-items:center;flex-wrap:wrap;gap:0;min-width:0;margin:0;padding:6px 8px;border:1px solid #e4ebe6;border-radius:11px;background:#fff;box-shadow:0 1px 2px rgba(20,48,34,.025);overflow:visible}
.aqAuditWorkspace .aqDataBar>div{display:flex;align-items:baseline;gap:6px;min-width:0;padding:3px 10px;border-right:1px solid #edf1ee}
.aqAuditWorkspace .aqDataBar>div span{font-size:9px;color:#75837a;font-weight:650;white-space:nowrap}
.aqAuditWorkspace .aqDataBar>div strong{font-size:12px;color:#26372d;font-weight:800;font-variant-numeric:tabular-nums}
.aqAuditWorkspace .aqFilterActions{grid-column:1/-1;grid-row:2;display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;white-space:normal;flex-wrap:wrap}
.aqAuditWorkspace .aqFilterActions>button{flex:0 0 auto;width:auto;min-width:max-content;max-width:100%;white-space:nowrap}
.aqAuditWorkspace .aqFilterActions:empty{display:none!important}
.aqAuditWorkspace .aqFilterActions .aqImportButton{min-height:32px;padding:6px 10px;border-radius:8px;font-size:10px;white-space:nowrap;background:#fff;border:1px solid #dfe8e2;color:#50675a}
.aqAuditWorkspace .aqFilterActions .aqAddButton{min-height:32px;padding:6px 11px;border-radius:8px;font-size:10px;white-space:nowrap;background:#137653;color:#fff;border:1px solid #137653}
.aqAuditWorkspace .aqTable{border-radius:12px;border-color:#e3ebe5;box-shadow:0 1px 3px rgba(20,48,34,.035);min-width:0}
.aqAuditWorkspace .aqWrap{width:100%;max-width:100%;min-width:0;max-height:calc(100dvh - 350px);min-height:220px;overflow:auto;border-radius:0 0 12px 12px}
.aqAuditWorkspace table.aqData{width:100%;min-width:1050px;table-layout:auto;font-size:11px;border-collapse:separate;border-spacing:0}
.aqAuditWorkspace table.aqData th,.aqAuditWorkspace table.aqData td{padding:10px 11px;min-width:90px;max-width:250px;white-space:normal;overflow-wrap:break-word;line-height:1.4}
.aqAuditWorkspace table.aqData th{font-size:9px;font-weight:800;letter-spacing:.015em;color:#617268;background:#f5f8f6}
.aqAuditWorkspace table.aqData th:first-child,.aqAuditWorkspace table.aqData td:first-child{position:sticky;left:0;z-index:2;min-width:42px;width:42px;background:#fff}
.aqAuditWorkspace table.aqData th:first-child{z-index:4;background:#f5f8f6}
.aqAuditWorkspace table.aqData tbody tr:hover td{background:#f8fbf9}
.aqAuditWorkspace table.aqData tbody tr:hover td:first-child{background:#f8fbf9}
.aqAuditWorkspace .aqBtn{min-height:32px;padding:6px 10px;border-radius:8px;font-size:10px;font-weight:750}
.aqAuditWorkspace .aqBtn.primary{background:#137653;border-color:#137653;color:#fff}
.aqAuditWorkspace .aqStatus{display:inline-flex;align-items:center;padding:4px 8px;font-size:9px}
.aqAuditWorkspace .aqBack.aqEditorBack{align-items:center;justify-content:center;padding:20px;background:rgba(12,25,18,.42);backdrop-filter:blur(5px)}
.aqAuditWorkspace .aqEditorDialog{display:flex;flex-direction:column;width:min(1120px,calc(100vw - 40px));max-height:calc(100dvh - 40px);min-height:0;overflow:hidden;border:1px solid #e1e9e3;border-radius:18px;background:#fff;box-shadow:0 24px 80px rgba(9,25,16,.24);outline:none}
.aqAuditWorkspace .aqEditorDialog>.aqInlineEditor{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;max-height:calc(100dvh - 40px);overflow:hidden;border:0;border-radius:18px;box-shadow:none;background:#fff}
.aqAuditWorkspace .aqEditorDialog .aqDHead{flex:0 0 auto;padding:16px 20px;background:#fff}
.aqAuditWorkspace .aqEditorDialog .aqDHead h4{font-size:19px;letter-spacing:-.025em}
.aqAuditWorkspace .aqEditorDialog .aqBody{flex:1 1 auto;min-height:0;overflow:auto;padding:16px 20px}
.aqAuditWorkspace .aqEditorDialog .aqEpisode{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.aqAuditWorkspace .aqEditorDialog .aqFoot{flex:0 0 auto;padding:11px 20px;background:#fbfcfb}
@media(max-width:1050px){
 .aqAuditWorkspace .aqGrid{grid-template-columns:minmax(0,1.4fr) minmax(95px,120px) minmax(150px,200px);grid-template-areas:"unit year month" "actions actions actions"}
 .aqAuditWorkspace .aqWrap{max-height:calc(100dvh - 390px)}
}
@media(max-width:760px){
 .aqAuditWorkspace .aqGrid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"unit unit" "year month" "actions actions"}
 .aqAuditWorkspace .aqFilterActions{grid-column:1/-1;grid-row:3;justify-content:flex-start;flex-wrap:wrap}
 .aqAuditWorkspace .aqDataBar{gap:4px;padding:7px}
 .aqAuditWorkspace .aqDataBar>div{flex:1 1 28%;padding:3px 6px;border-right:0}
 .aqAuditWorkspace .aqDataBar .aqImportButton{margin-left:0}
 .aqAuditWorkspace .aqDataBar .aqAddButton{margin-left:0}
 .aqAuditWorkspace .aqWrap{max-height:calc(100dvh - 420px);min-height:180px}
 .aqAuditWorkspace .aqEditorDialog{width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}
 .aqAuditWorkspace .aqEditorDialog>.aqInlineEditor{max-height:calc(100dvh - 20px)}
 .aqAuditWorkspace .aqEditorDialog .aqEpisode{grid-template-columns:repeat(2,minmax(0,1fr))}
 .aqAuditWorkspace .aqEditorDialog .aqBody{padding:12px}
 .aqAuditWorkspace .aqEditorDialog .aqDHead,.aqAuditWorkspace .aqEditorDialog .aqFoot{padding:12px}
}
@media(max-width:480px){
 .aqAuditWorkspace .aqGrid{grid-template-columns:1fr;grid-template-areas:"unit" "year" "month" "actions"}
 .aqAuditWorkspace .aqFilterActions{grid-column:1/-1;grid-row:4;justify-content:flex-start;flex-wrap:wrap}
 .aqAuditWorkspace .aqDataBar>div{flex:1 1 42%}
 .aqAuditWorkspace .aqEditorDialog .aqEpisode{grid-template-columns:1fr}
 .aqAuditWorkspace .aqBack.aqEditorBack{padding:8px}
 .aqAuditWorkspace .aqEditorDialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}
 .aqAuditWorkspace .aqEditorDialog>.aqInlineEditor{max-height:calc(100dvh - 16px)}
}


/* Win against legacy workspace-wide density rules without changing other modules. */
.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqGrid{display:grid!important;grid-template-columns:minmax(0,1.4fr) minmax(95px,120px) minmax(150px,200px)!important;grid-template-areas:"unit year month" "actions actions actions"!important;grid-auto-flow:row!important;gap:10px!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqField.aqLocalSearch{display:none!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqDataBar{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:0!important;min-height:0!important;overflow:visible!important;white-space:normal!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqDataBar>div{display:flex!important;flex:0 1 auto!important;align-items:baseline!important;padding:3px 10px!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqDataBar>div span{display:inline!important;font-size:9px!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqDataBar>div strong{font-size:12px!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions{grid-column:1/-1!important;grid-row:2!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;min-width:0!important;white-space:normal!important;flex-wrap:wrap!important}.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions>button{flex:0 0 auto!important;width:auto!important;min-width:max-content!important;max-width:100%!important;white-space:nowrap!important}\n.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions:empty{display:none!important}\n.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions .aqImportButton,.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions .aqAddButton{min-height:32px!important;font-size:10px!important;padding:6px 10px!important;margin:0!important;white-space:nowrap!important}\n.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions .aqImportButton{background:#fff!important;border:1px solid #dfe8e2!important;color:#50675a!important}\n.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions .aqAddButton{background:#137653!important;border:1px solid #137653!important;color:#fff!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqTable .aqWrap{min-width:0!important;width:100%!important;overflow:auto!important}
.moduleEnter>.aq.aqAuditWorkspace>.aqTable table.aqData{min-width:1050px!important;table-layout:auto!important}
@media(max-width:760px){
 .moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-areas:"unit unit" "year month" "actions actions"!important}
 .moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions{grid-column:1/-1!important;grid-row:3!important;justify-content:flex-start!important;flex-wrap:wrap!important}
 .moduleEnter>.aq.aqAuditWorkspace>.aqDataBar{flex-wrap:wrap!important;overflow:visible!important}
 .moduleEnter>.aq.aqAuditWorkspace>.aqDataBar>div{flex:1 1 28%!important}
}
@media(max-width:480px){.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqGrid{grid-template-columns:1fr!important;grid-template-areas:"unit" "year" "month" "actions"!important}.moduleEnter>.aq.aqAuditWorkspace>.aqFilters .aqFilterActions{grid-column:1/-1!important;grid-row:4!important;justify-content:flex-start!important;flex-wrap:wrap!important}}

/* Compact professional indicator assessment — shared by every unit using this editor. */
.aqAuditWorkspace .aqIndicatorSection{min-width:0}
.aqAuditWorkspace .aqIndicatorSection>.aqSection{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:5px 1px 9px}
.aqAuditWorkspace .aqIndicatorSection>.aqSection h5{font-size:16px;font-weight:750;letter-spacing:-.02em;color:#24382d;margin:0}
.aqAuditWorkspace .aqIndicatorSection>.aqSection>span{font-size:10px;color:#718078;white-space:nowrap}
.aqAuditWorkspace .aqIndicatorList{display:grid;gap:9px}
.aqAuditWorkspace .aqInd{margin:0;border:1px solid #e0e9e2;border-radius:13px;box-shadow:0 1px 3px rgba(25,59,39,.035);transition:border-color 160ms ease,box-shadow 160ms ease}
.aqAuditWorkspace .aqInd:hover{border-color:#cbded0;box-shadow:0 5px 16px rgba(25,59,39,.055)}
.aqAuditWorkspace .aqIHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 14px;background:linear-gradient(180deg,#f7faf6 0%,#f4f8f3 100%);border-bottom:1px solid #e5ece5}
.aqAuditWorkspace .aqIndicatorHeadMain{min-width:0;flex:1}
.aqAuditWorkspace .aqIndicatorHeading{display:flex;align-items:baseline;gap:8px;min-width:0}
.aqAuditWorkspace .aqIndicatorCode{flex:0 0 auto;padding:3px 6px;border-radius:5px;background:#e8f1e9;color:#416b50;font-size:9px;font-weight:800;letter-spacing:.035em;font-variant-numeric:tabular-nums}
.aqAuditWorkspace .aqIndicatorHeading strong{font-size:13px;line-height:1.4;font-weight:750;color:#1d3025;letter-spacing:-.01em;overflow-wrap:anywhere}
.aqAuditWorkspace .aqIndicatorMeta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px}
.aqAuditWorkspace .aqMetaTag{display:inline-flex;align-items:center;min-height:21px;padding:3px 7px;border:1px solid #e3ebe4;border-radius:5px;background:#fff;color:#68796e;font-size:9px;font-weight:650;line-height:1.25}
.aqAuditWorkspace .aqMetaTag.aqMetaCategory{border-color:#dce9df;background:#edf5ef;color:#3f6e50}
.aqAuditWorkspace .aqIHead .aqMatch{align-self:flex-start;flex:0 0 auto;margin-top:1px}
.aqAuditWorkspace .aqIBody{display:grid;gap:10px;padding:13px 14px}
.aqAuditWorkspace .aqQ{margin:0;font-size:13px;line-height:1.45;font-weight:700;letter-spacing:-.01em;color:#26372d}
.aqAuditWorkspace .aqChoiceField{display:block;max-width:100%;margin:0}
.aqAuditWorkspace .aqChoiceField select{width:100%;min-height:39px;height:39px;padding:7px 11px;border:1px solid #dce7df;border-radius:8px;background:#fff;color:#26372d;font-size:11px;box-shadow:none}
.aqAuditWorkspace .aqChoiceField select:focus{outline:2px solid rgba(22,128,92,.16);border-color:#87b69a}
.aqAuditWorkspace .aqResultSummary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:0!important;padding:9px 11px;border:1px solid #e0eee5;border-radius:9px;background:#f1f8f4}
.aqAuditWorkspace .aqResultSummary>span{font-size:9px;font-weight:700;color:#6e8075}
.aqAuditWorkspace .aqResultSummary>strong{font-size:13px;line-height:1.3;color:#1e5c40}
.aqAuditWorkspace .aqResultSummary>small{margin-left:auto;font-size:9px;color:#748278}
.aqAuditWorkspace .aqUnmatchedInd .aqIHead{background:#f8f9f7}
.aqAuditWorkspace .aqUnmatchedInd .aqIndicatorCode{background:#eef0ed;color:#69746c}
@media(max-width:600px){
 .aqAuditWorkspace .aqIHead{padding:11px 12px}
 .aqAuditWorkspace .aqIBody{padding:12px}
 .aqAuditWorkspace .aqIndicatorHeading{align-items:flex-start;gap:6px}
 .aqAuditWorkspace .aqIndicatorHeading strong{font-size:12px}
 .aqAuditWorkspace .aqResultSummary>small{margin-left:0;flex-basis:100%}
}

`
function ymd(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getFullYear()}
function mon(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getMonth()+1}
function fmt(v:string){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
function fmtDateTime(v:string){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function los(a:string,b:string){if(!a)return 0;const x=new Date(a).getTime(),y=(b?new Date(b):new Date()).getTime();return Number.isFinite(x)&&Number.isFinite(y)?Math.max(1,Math.ceil((y-x)/86400000)):0}
function tm(v:string){if(!/^\d\d:\d\d$/.test(v))return null;const[a,b]=v.split(':').map(Number);return a<24&&b<60?a*60+b:null}
function diff(a:string,b:string){const x=tm(a),y=tm(b);return x==null||y==null?null:y>=x?y-x:y+1440-x}
function hit(p:Profile,dx:string){const h=`${p.indicator_type} ${p.title}`.toLowerCase(),d=dx.toLowerCase();if(!h.includes('audit medis'))return false;const rules=[[/stroke|iskemik/,/stroke/],[/stemi|infark/,/stemi|killip|ekg/],[/tuberkulosis|tbc/,/tuberkulosis|sitb|oat/],[/sirosis/,/sirosis|varises/],[/ginjal|ckd|gagal ginjal/,/ginjal|dialisis|kt\/v/],[/diabetes|dm /,/diabetes|pedis|ankle|kaki/],[/carcinoma|kanker|mammae/,/mammae|mastektomi|imunohistokimia|tnm/],[/asfiksia|neonatus/,/asfiksia|apgar|vtp/],[/sectio|seksio|persalinan/,/sectio|menyusui|hemostasis/]];return rules.some(([a,b])=>(a as RegExp).test(d)&&(b as RegExp).test(h))}
function kind(p:Profile){return resolveMeasurementKind(p)}
function optionsFor(p:Profile){return Array.isArray(p.options_json)?p.options_json.filter((x:any)=>x&&x.label):[]}
function indicatorChoicesFor(p:Profile,layout:AuditLayout|undefined,response?:Resp){const header=String(p.schema_json?.header_label??'').trim()||String(p.title??'').trim();const sourceLabels=[...(layout?.indicatorOptions?.[header]??[])];const sourceValue=String(response?.source_value??response?.source_label??'').trim();const canonical=(value:string)=>value.replace(/\s*\(code\s*\d+\)\s*$/i,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID');if(sourceValue&&!sourceLabels.some(value=>canonical(value)===canonical(sourceValue))&&!optionsFor(p).some((value:any)=>canonical(String(value.label))===canonical(sourceValue)))sourceLabels.push(sourceValue);return buildIndicatorDropdownOptions(p,sourceLabels)}
function responseComplete(p:Profile,r:Resp|undefined){
 if(!r)return false
 if(String(p.schema_json?.input_mode??'')==='free_text_event'){
   if(r.code===1)return true
   return r.code===3&&!!String(r.free_text??'').trim()
 }
 const k=kind(p),opts=optionsFor(p)
 if(k==='ratio')return r.numerator!=null&&r.denominator!=null&&Number.isFinite(Number(r.numerator))&&Number.isFinite(Number(r.denominator))&&Number(r.numerator)>=0&&Number(r.denominator)>0&&Number(r.numerator)<=Number(r.denominator)
 if(k==='visit')return !!r.answer&&!!r.time
 if(k==='door')return !!r.start&&!!r.end&&diff(r.start,r.end)!=null
 if(k==='minutes')return r.minutes!=null&&Number(r.minutes)>=0
 if(k==='numeric')return r.value!=null&&Number.isFinite(Number(r.value))
 if(opts.length>0){
   if(!r.answer)return false
   const o=opts.find((x:any)=>String(x.label)===String(r.answer))
   return o?.code!=null||r.source_option===true||r.review_required===true||!!r.notes||!!r.evidence
 }
 if(k==='occurrence')return !!r.occurrence
 return !!r.answer
}
function filled(r:Resp|undefined){return!!r&&(!!r.answer||!!r.occurrence||!!r.time||!!r.start||!!r.end||r.minutes!=null||r.value!=null||(r.numerator!=null&&r.denominator!=null&&Number(r.denominator)>0))}
function empty(p:Profile):Resp{
 if(String(p.schema_json?.input_mode??'')==='free_text_event')return{free_text:'',answer:'Tidak terjadi kekosongan obat',code:1}
 const k=kind(p);return k==='ratio'?{numerator:null,denominator:null}:k==='occurrence'?{occurrence:''}:k==='numeric'?{value:null}:k==='minutes'?{minutes:null}:k==='door'?{start:'',end:'',minutes:null}:k==='visit'?{time:'',answer:''}:{answer:''}
}
function targetMet(p:Profile,r:Resp|undefined){
 if(!r)return null
 const measurement=kind(p)
 if(measurement==='visit')return isWithinVisitWindow(p,String(r.time??''))
 if(measurement==='ratio'){
   if(r.numerator==null||r.denominator==null||Number(r.denominator)<=0||Number(r.numerator)<0||Number(r.numerator)>Number(r.denominator))return null
   const rate=Number(r.numerator)/Number(r.denominator)*100
   return compareToTarget(p,rate)
 }
 if(measurement==='door'){
   const duration=diff(String(r.start??''),String(r.end??''))
   return compareToTarget(p,duration,'<=')
 }
 if(measurement==='minutes')return compareToTarget(p,r.minutes,'<=')
 if(measurement==='numeric')return compareToTarget(p,r.value)
 return null
}
function displayTitle(p:Profile){return String(p.schema_json?.header_label??'').trim()||String(p.title??'').trim()||`Indikator ${p.code}`}
function normalizePastedDate(value:string):string|null{
 const v=String(value??'').trim()
 if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
  const d=new Date(v+'T00:00:00Z')
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v?v:null
 }
 const dmy=v.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/)
 if(dmy){
  const d=Number(dmy[1]),m=Number(dmy[2]),y=Number(dmy[3]),date=new Date(Date.UTC(y,m-1,d))
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):null
 }
 if(/^\d{5}$/.test(v)){
  const serial=Number(v)
  if(serial>=20000&&serial<=80000)return new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10)
 }
 return null
}
function normalizePastedDateTime(value:string):string|null{
 const v=String(value??'').trim()
 if(!v)return null
 const serial=Number(v.replace(',','.'))
 if(/^\d+(?:[.,]\d+)?$/.test(v)&&Number.isFinite(serial)&&serial>=20000&&serial<=80000){
  const d=new Date(Date.UTC(1899,11,30)+serial*86400000)
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,16)
 }
 const iso=v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
 const dmy=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
 let datePart='',hour=0,minute=0,second=0
 if(iso){datePart=iso[1];hour=Number(iso[2]??0);minute=Number(iso[3]??0);second=Number(iso[4]??0)}
 else if(dmy){const dd=Number(dmy[1]),mm=Number(dmy[2]),yyyy=Number(dmy[3]);datePart=String(yyyy)+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0');hour=Number(dmy[4]??0);minute=Number(dmy[5]??0);second=Number(dmy[6]??0)}
 else return null
 if(!normalizePastedDate(datePart)||hour<0||hour>23||minute<0||minute>59||second<0||second>59)return null
 return datePart+'T'+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')
}
function parsePastedNumber(value:string):number|null{
 let v=String(value??'').trim().replace(/\s/g,'')
 if(!v)return null
 if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v))v=v.replace(/\./g,'').replace(',','.')
 else v=v.replace(',','.')
 const n=Number(v)
 return Number.isFinite(n)?n:null
}
function parsePastedIndicator(p:Profile,raw:string):{response:Resp;matched:boolean}{
 const base=empty(p),norm=normalizeExactHeader(raw),opts=optionsFor(p)
 if(String(p.schema_json?.input_mode??'')==='free_text_event'){
   const name=String(raw??'').trim()
   return {response:{...base,free_text:name,answer:name?'Terjadi kekosongan obat':'Tidak terjadi kekosongan obat',code:name?3:1},matched:true}
 }
 const logbookOption=matchLogbookOption(raw,opts)
 if(logbookOption)return {response:{...base,answer:String(logbookOption.label),code:validResponseCode(logbookOption.code)},matched:true}
 const exact=opts.find((o:any)=>normalizeExactHeader(o.label)===norm)
 if(exact)return {response:{...base,answer:String(exact.label),code:validResponseCode(exact.code)},matched:true}
 const coded=opts.filter((o:any)=>o.code!=null&&String(o.code)===raw.trim())
 if(coded.length===1)return {response:{...base,answer:String(coded[0].label),code:validResponseCode(coded[0].code)},matched:true}
 const k=kind(p)
 if(k==='ratio'){
  const m=raw.trim().match(/^([\d.,]+)\s*\/\s*([\d.,]+)$/)
  if(m){const numerator=parsePastedNumber(m[1]),denominator=parsePastedNumber(m[2]);if(numerator!=null&&denominator!=null&&denominator>0&&numerator>=0&&numerator<=denominator)return {response:{...base,numerator,denominator},matched:true}}
 }else if(k==='door'){
  const m=raw.trim().match(/(\d{1,2}:\d{2})\s*(?:-|–|—|→|to)\s*(\d{1,2}:\d{2})/i)
  if(m&&tm(m[1])!=null&&tm(m[2])!=null)return {response:{...base,start:m[1].padStart(5,'0'),end:m[2].padStart(5,'0')},matched:true}
 }else if(k==='visit'){
  if(/^\d{1,2}:\d{2}$/.test(raw.trim())&&tm(raw.trim())!=null)return {response:{...base,time:raw.trim().padStart(5,'0'),answer:'Ya',code:1},matched:true}
 }else if(k==='minutes'){
  const n=parsePastedNumber(raw);if(n!=null&&n>=0)return {response:{...base,minutes:n},matched:true}
 }else if(k==='numeric'){
  const n=parsePastedNumber(raw);if(n!=null)return {response:{...base,value:n},matched:true}
 }else if(k==='occurrence'){
  if(/^(terjadi|ya|ada|ditemukan)$/.test(norm))return {response:{...base,occurrence:'Terjadi',code:3},matched:true}
  if(/^(tidak terjadi|tidak|nihil|tidak ada|tidak ditemukan)$/.test(norm))return {response:{...base,occurrence:'Tidak terjadi',code:1},matched:true}
 }else{
  if(/^(sesuai|memenuhi|patuh|ya)$/.test(norm))return {response:{...base,answer:'Sesuai',code:1},matched:true}
  if(/^(tidak sesuai|tidak memenuhi|tidak patuh|tidak)$/.test(norm))return {response:{...base,answer:'Tidak sesuai',code:3},matched:true}
  if(/^(pengecualian|exception|alasan sah)$/.test(norm))return {response:{...base,answer:'Exception',code:2},matched:true}
 }
 return {response:{...base,notes:'Nilai sumber Excel perlu diverifikasi manual: '+raw},matched:false}
}
function validResponseCode(value:unknown):number|null{
 const n=Number(value)
 return Number.isInteger(n)&&n>=1&&n<=3?n:null
}
const QUALITY_AUDIT_LAYOUTS=qualityAuditLayout2026 as AuditLayout[]
function getLayout(roomId:number|null|undefined){return roomId==null?undefined:QUALITY_AUDIT_LAYOUTS.find(x=>Number(x.roomId)===Number(roomId))}
function normHeader(v:unknown){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function getLayoutForRoom(roomId:number|null|undefined,roomName?:string|null){
 const unit=normHeader(roomName)
 if(unit==='informasi dan pengaduan')return QUALITY_AUDIT_LAYOUTS.find(layout=>layout.fields.some(field=>normHeader(field)==='tanggal aduan'))??getLayout(roomId)
 if(unit==='informatika dan teknologi')return QUALITY_AUDIT_LAYOUTS.find(layout=>layout.fields.some(field=>normHeader(field)==='gangguan it'))??getLayout(roomId)
 return getLayout(roomId)
}
function profileMatchesHeader(header:string,p:Profile){
 const label=String(p.schema_json?.header_label??'').trim()||String(p.title??'').trim()
 const h=normHeader(header),l=normHeader(label)
 if(!h||!l)return false
 if(h===l)return true
 const stripDomain=(s:string)=>s.replace(/^(stemi|snh)\s*/,'').trim()
 if(stripDomain(h)===stripDomain(l))return true
 if(/kekosongan.*bhp.*linen|kekosongan.*linen.*bhp/.test(h)&&/kekosongan (linen|obat)/.test(l))return true
 return false
}
function unmatchedHeaders(all:Profile[],layout:AuditLayout|undefined){
 if(!layout)return []
 return layout.indicators.filter(header=>!all.some(p=>Number(p.room_id)===Number(layout.roomId)&&profileMatchesHeader(header,p)))
}
function layoutProfiles(all:Profile[],layout:AuditLayout|undefined){
 const mapped=layout
  ? all.filter(p=>(layout.indicators??[]).some(h=>profileMatchesHeader(h,p)))
  : all
 const dynamic=all.filter(p=>p.is_active===true&&p.status==='published'&&p.schema_json?.oppe_dynamic===true)
 const result=[...mapped]
 const seen=new Set(result.map(p=>String(p.id??p.code)))
 dynamic.forEach(p=>{const id=String(p.id??p.code);if(!seen.has(id)){result.push(p);seen.add(id)}})
 return result
}
function isComputedField(field:string,layout:AuditLayout|undefined){
 const n=normHeader(field)
 if(/^(length of stay|lenght of stay|los|lamanya tindak lanjut|kecepatan respon menit)$/.test(n))return true
 return (n==='umur'||n==='usia')&&!!layout?.fields.some(x=>normHeader(x)==='tanggal lahir')
}
function inputKind(field:string,layout:AuditLayout|undefined){
 if(isComputedField(field,layout))return'computed'
 const declared=layout?.fieldTypes?.[field]
 if(declared)return declared
 if(layout?.fieldOptions?.[field]?.length)return'select'
 const n=normHeader(field)
 if(layout?.providerGroups?.length&&['klinik','dokter'].includes(n))return'select'
 if(n.startsWith('tanggal ')||n.includes('jatuh tempo')||n.includes('deadline'))return'date'
 if(n.startsWith('waktu ')||n.startsWith('jam '))return'time'
 if(/kronologi|kronologis|rencana|uraian|rekomendasi|kendala|catatan|keterangan|tindakan yang segera|evaluasi tindak lanjut|penyelesaian aduan|instruksi|masalah/.test(n))return'textarea'
 if(/^(umur|usia|berat badan|tinggi badan|biaya akhir|estimasi ina cbgs)$/.test(n)&&!(n==='umur'&&layout?.fields.some(x=>normHeader(x)==='tanggal lahir')))return'number'
 return'text'
}
function recordDateFrom(formData:Record<string,any>,layout:AuditLayout|undefined,fallback=''){
 const priorities=['Tanggal Masuk','Tanggal Aduan','Tanggal Permintaan','Tanggal Keluhan','Tanggal Dilayani','Tanggal Audit','Tanggal Lapor','Tanggal Kunjungan','Tanggal Berkunjung','Tanggal Visite','Tanggal Pertemuan','Tanggal Mulai Praktek','Tanggal Pelaporan','Tanggal Insiden','Tanggal']
 for(const label of priorities)if(layout?.fields.includes(label)&&formData?.[label])return String(formData[label])
 const alternative=layout?.fields.find(label=>/tanggal|date/i.test(label)&&formData?.[label]&&!isComputedField(label,layout))
 return alternative?String(formData[alternative]):fallback
}
function dateDiffDays(a:unknown,b:unknown){
 if(!a||!b)return null
 const x=new Date(String(a)).getTime(),y=new Date(String(b)).getTime()
 return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,Math.floor((y-x)/86400000)):null
}
function ageFromDob(dob:unknown,at:unknown){
 if(!dob)return null
 const d=new Date(String(dob)),end=at?new Date(String(at)):new Date()
 if(Number.isNaN(d.getTime())||Number.isNaN(end.getTime()))return null
 let age=end.getFullYear()-d.getFullYear()
 if(end.getMonth()<d.getMonth()||(end.getMonth()===d.getMonth()&&end.getDate()<d.getDate()))age--
 return Math.max(0,age)
}
function computedField(field:string,formData:Record<string,any>,layout:AuditLayout|undefined){
 const n=normHeader(field)
 if(/^(length of stay|lenght of stay|los)$/.test(n)){
  const start=formData?.['Tanggal Masuk']??formData?.['Tanggal Masuk Rumah Sakit']
  const end=formData?.['Tanggal Keluar']??''
  return start?los(String(start),String(end)):null
 }
 if(n==='lamanya tindak lanjut')return calculateInclusiveDurationDays(formData?.['Tanggal Aduan'],formData?.['Tanggal Tindak Lanjut'])
 if(n==='kecepatan respon menit'){
  const start=String(formData?.['Waktu Permintaan']??''),end=String(formData?.['Waktu Diantar']??'')
  if(!start||!end)return null
  const startMinutes=tm(start),endMinutes=tm(end)
  if(startMinutes==null||endMinutes==null)return null
  if(endMinutes>=startMinutes)return endMinutes-startMinutes
  const explicitOvernight=formData?.['__kecepatan_respon_overnight']===true||formData?.['__kecepatan_respon_overnight']==='true'
  return explicitOvernight?endMinutes+1440-startMinutes:null
 }
 if((n==='umur'||n==='usia')&&layout?.fields.some(x=>normHeader(x)==='tanggal lahir')){
  return ageFromDob(formData?.['Tanggal Lahir'],formData?.['Tanggal Masuk']??formData?.['Tanggal Lapor'])
 }
 return null
}
function fieldValue(p:Patient,field:string,layout:AuditLayout|undefined){
 const f=p.formData&&typeof p.formData==='object'?p.formData:{}
 if(isComputedField(field,layout)){
  const v=computedField(field,f,layout)
  if(v==null)return'—'
  if(normHeader(field)==='lamanya tindak lanjut')return `${v} hari`
  if(normHeader(field)==='kecepatan respon menit')return `${v} menit`
  if(/length of stay|lenght of stay|los/i.test(field))return `${v} hari`
  return v
 }
 if(f[field]!==undefined&&f[field]!==null&&f[field]!==''){if(inputKind(field,layout)==='date')return fmt(String(f[field]));if(inputKind(field,layout)==='datetime-local')return fmtDateTime(String(f[field]));return f[field]}
 const n=normHeader(field)
 if(n==='nama pasien')return p.name??''
 if(n==='nama mahasiswa')return p.name??''
 if(n==='nama mpp')return p.name??''
 if(n==='no rm'||n==='no rekam medis')return p.rm??''
 if(n==='tanggal masuk')return p.admit??''
 if(n==='tanggal keluar')return p.discharge??''
 if(/diagnos/.test(n))return p.diagnosis??''
 if(n==='dpjp'||n==='dpjp')return p.dpjp??''
 if(n==='umur'||n==='usia')return p.age??''
 return''
}
function inputFieldValue(p:Patient,field:string,layout:AuditLayout|undefined){
 const form=p.formData&&typeof p.formData==='object'?p.formData:{}
 if(isComputedField(field,layout))return computedField(field,form,layout)??''
 if(inputKind(field,layout)==='datetime-local')return normalizePastedDateTime(String(form[field]??fieldValue(p,field,layout)??''))??''
 if(Object.prototype.hasOwnProperty.call(form,field)&&form[field]!==null&&form[field]!==undefined)return form[field]
 const n=normHeader(field)
 if(n==='nama pasien'||n==='nama mahasiswa'||n==='nama mpp')return p.name??''
 if(n==='no rm'||n==='no rekam medis')return p.rm??''
 if(n==='tanggal masuk'||n==='tanggal masuk rumah sakit')return String(p.admit??'').slice(0,10)
 if(n==='tanggal keluar')return String(p.discharge??'').slice(0,10)
 if(/diagnos/.test(n))return p.diagnosis??''
 if(n==='dpjp'||n==='dpjp')return p.dpjp??''
 if(n==='jenis kelamin')return p.sex??''
 if(n==='umur'||n==='usia')return p.age??''
 if(inputKind(field,layout)==='date'){
  const raw=fieldValue(p,field,layout)
  const d=new Date(String(raw))
  return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)
 }
 if(inputKind(field,layout)==='datetime-local')return normalizePastedDateTime(String(form[field]??fieldValue(p,field,layout)??''))??''
 return fieldValue(p,field,layout)??''
}
function recordTitle(p:Patient){
 const f=p.formData&&typeof p.formData==='object'?p.formData:{}
 const provider=String(f['Dokter']??'').trim(),clinic=String(f['Klinik']??'').trim()
 return String(p.name??'').trim()||String(f['Nama Mahasiswa']??'').trim()||String(f['Nama MPP']??'').trim()||String(f['Gangguan IT']??'').trim()||String(f['Insiden yang Terjadi']??'').trim()||String(f['Nama Pertemuan Ilmiah']??'').trim()||(provider&&clinic?`${provider} · ${clinic}`:'')||String(f['Alur layanan']??'').trim()||'Catatan logbook'
}
function primaryDateField(layout:AuditLayout|undefined){
 return layout?.fields.find(f=>/tanggal masuk|tanggal aduan|tanggal permintaan|tanggal keluhan|tanggal dilayani|tanggal audit|tanggal lapor|tanggal kunjungan|tanggal berkunjung|tanggal visite|tanggal pertemuan|tanggal mulai praktek|tanggal pelaporan/i.test(f))??layout?.fields.find(f=>/tanggal|date/i.test(f))
}
function dominantGrain(profiles:Profile[],layout:AuditLayout|undefined){
 if(layout?.measurementGrain)return layout.measurementGrain
 const matched=layoutProfiles(profiles,layout)
 const counts=new Map<string,number>()
 matched.forEach(p=>counts.set(String(p.measurement_grain||'event'),(counts.get(String(p.measurement_grain||'event'))||0)+1))
 const winner=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]
 if(winner)return winner
 return layout?.fields.some(f=>normHeader(f)==='tanggal masuk')?'patient_episode':'event'
}

function grainLabel(grain:string){
 if(grain==='patient_episode')return'Per episode pasien'
 if(grain==='provider_day')return'Per dokter per hari'
 if(grain==='daily_metric')return'Angka harian'
 if(grain==='event')return'Per kejadian'
 if(grain==='activity')return'Per aktivitas'
 if(grain==='aggregate')return'Agregat'
 return'Catatan logbook'
}
function indicatorTypeLabel(value:unknown){
 const raw=String(value??'').trim().replace(/\s+/g,' ')
 if(!raw)return''
 return raw.replace(/^INM\s*/i,'').trim()||'INM'
}
function normalizeRoomIdValue(value:unknown):number|null{
 const raw=String(value??'').trim()
 if(!raw)return null
 const parsed=Number(raw)
 return Number.isSafeInteger(parsed)&&parsed>0?parsed:null
}
function defaultAuditRoomId(rooms:Room[],initialRoomId:number|null,isAdmin:boolean):number|null{
 const initial=normalizeRoomIdValue(initialRoomId)
 if(initial!=null)return initial
 if(isAdmin){
  const firstQualityRoom=rooms.find(room=>/informasi\s+dan\s+pengaduan/i.test(String(room.name??'')))
  return normalizeRoomIdValue(firstQualityRoom?.id)??normalizeRoomIdValue(rooms[0]?.id)
 }
 return normalizeRoomIdValue(rooms[0]?.id)
}
// Samarkan identitas pasien di daftar (detail tetap lengkap saat baris dibuka).
function maskIdentity(field:string,value:string){const f=field.trim().toLowerCase();if(!value||value==='—')return value;if(/^nama (pasien|mpp|mahasiswa)$/.test(f)){const w=value.trim().split(/\s+/);return w[0].slice(0,2)+'***'+(w.length>1?' '+w.slice(1).map(x=>x[0]+'.').join(' '):'')}if(/^no\.? ?(rekam medis|rm)$/.test(f)){const v=value.trim();return v.length<=3?'***':'***'+v.slice(-3)}return value}
function statusLabel(status:unknown){
 const s=String(status??'')
 if(s==='ready'||s==='Ready for Review')return'Siap ditinjau'
 if(s==='validated'||s==='Validated')return'Tervalidasi'
 if(s==='reopened'||s==='Reopened')return'Perlu perbaikan'
 if(s==='draft'||s==='Draft')return'Draf'
 if(s==='Aktif')return'Aktif'
 return s||'Draf'
}
export default function QualityIndicatorWorkspace({initialRoomId,rooms,isAdmin,isValidator=false,canViewAllRooms=false,onRoomChange,initialContainer,showContainerTabs=true,patientRegistryMode=false,hidePatientEpisodeEntry=false,lockRoomScope=false}:{initialRoomId:number|null;rooms:Room[];isAdmin:boolean;isValidator?:boolean;canViewAllRooms?:boolean;onRoomChange?:(roomId:number|null)=>void;initialContainer?:(typeof CONTAINERS)[number];showContainerTabs?:boolean;patientRegistryMode?:boolean;hidePatientEpisodeEntry?:boolean;lockRoomScope?:boolean}){
 const [container,setContainer]=useState<(typeof CONTAINERS)[number]>(initialContainer&&CONTAINERS.includes(initialContainer)?initialContainer:CONTAINERS[0])
 const [year,setYear]=useState(2026)
 const [roomId,setRoomId]=useState<number|null>(()=>defaultAuditRoomId(rooms,initialRoomId,isAdmin))
 useEffect(()=>{
  const incoming=normalizeRoomIdValue(initialRoomId)
  if(incoming!=null&&incoming!==roomId)setRoomId(incoming)
 },[initialRoomId])
 const canImportWorkbook=isAdmin||canViewAllRooms
 const canImportOutpatientWorkbook=canImportWorkbook||(!isValidator&&Number(initialRoomId)===11)
 useEffect(()=>{
  if(roomId==null&&rooms.length){
   const initial=defaultAuditRoomId(rooms,initialRoomId,isAdmin)
   if(initial!=null)setRoomId(initial)
  }
 },[roomId,rooms,initialRoomId,isAdmin])
 useEffect(()=>{
  if(roomId!=null&&(initialRoomId!=null||!isAdmin))onRoomChange?.(roomId)
 },[roomId,onRoomChange,initialRoomId,isAdmin])
 const [monthFilter,setMonthFilter]=useState(0)
 const [reviewMonth,setReviewMonth]=useState(()=>new Date().getMonth()+1)
 const [monthlyReview,setMonthlyReview]=useState<any>(null)
 const [monthlyReviewBusy,setMonthlyReviewBusy]=useState(false)
 const [search,setSearch]=useState('')
 useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent<{query?:string}>).detail;setSearch(String(detail?.query??''))};window.addEventListener('aureka:workspace-search',receive);return()=>window.removeEventListener('aureka:workspace-search',receive)},[])
 const [currentUserId,setCurrentUserId]=useState('')
 useEffect(()=>{let cancelled=false;void sb.auth.getUser().then(({data,error})=>{if(!cancelled&&!error)setCurrentUserId(String(data.user?.id??''))});return()=>{cancelled=true}},[])
 const [profiles,setProfiles]=useState<Profile[]>([])
 const [staffOptions,setStaffOptions]=useState<TeamStaffOption[]>([])
 const [patients,setPatients]=useState<Patient[]>([])
 const [selected,setSelected]=useState<Patient|null>(null)
 const [draft,setDraft]=useState<Record<string,Resp>>({})
 const [message,setMessage]=useState('')
 useEffect(()=>{
  if(!message||typeof window==='undefined')return
  const type= /^(Gagal|Belum|Data tidak dapat|Catatan belum|Kolom|Tanggal|Pilih|Akun validator)/i.test(message)?'error':/berhasil disimpan|berhasil dihapus/i.test(message)?'success':'info'
  window.dispatchEvent(new CustomEvent('aureka:notification',{detail:{message,type,module:'Audit Indikator Mutu'}}))
 },[message])
 const [busy,setBusy]=useState(false)
 const [source,setSource]=useState('Memuat…')
 const [showIdentity,setShowIdentity]=useState(false);
 const [patientOpen,setPatientOpen]=useState(false),[pendingArchive,setPendingArchive]=useState<Patient|null>(null)
 // Form logbook tampil sebagai jendela pop-up (bukan di bawah baris tabel). Saat ditutup sebelum disimpan, ditanya dulu agar isian tidak hilang.
 const [confirmCloseEditor,setConfirmCloseEditor]=useState(false)
 const editorSnapshot=useRef<{id:string,json:string}|null>(null)
 useEffect(()=>{if(!patientOpen||typeof document==='undefined')return;const prev=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=prev}},[patientOpen])
 const [loadedImportDialogs,setLoadedImportDialogs]=useState<Set<ImportDialogKey>>(()=>new Set())
 const [complaintImportOpen,setComplaintImportOpen]=useState(false)
 const [itImportOpen,setItImportOpen]=useState(false)
 const [ambulanceImportOpen,setAmbulanceImportOpen]=useState(false)
 const [ibsImportOpen,setIbsImportOpen]=useState(false)
 const [pharmacyImportOpen,setPharmacyImportOpen]=useState(false)
 const [giziImportOpen,setGiziImportOpen]=useState(false)
 const [laboratoryImportOpen,setLaboratoryImportOpen]=useState(false),[igdImportOpen,setIgdImportOpen]=useState(false),[outpatientImportOpen,setOutpatientImportOpen]=useState(false)
 const [rehabImportOpen,setRehabImportOpen]=useState(false)
 const [icuImportOpen,setIcuImportOpen]=useState(false)
 const [perinatologyImportOpen,setPerinatologyImportOpen]=useState(false)
 const [nicuImportOpen,setNicuImportOpen]=useState(false)
 const [nifasImportOpen,setNifasImportOpen]=useState(false)
 const [ponekImportOpen,setPonekImportOpen]=useState(false)
 const [pediatricInpatientImportOpen,setPediatricInpatientImportOpen]=useState(false)
 const [surgicalInpatientImportOpen,setSurgicalInpatientImportOpen]=useState(false)
 const [isolasiInpatientImportOpen,setIsolasiInpatientImportOpen]=useState(false)
 const [sarafInpatientImportOpen,setSarafInpatientImportOpen]=useState(false)
 const [penyakitDalamInpatientImportOpen,setPenyakitDalamInpatientImportOpen]=useState(false)
 const openImportDialog=(key:ImportDialogKey)=>{
  setLoadedImportDialogs(current=>{if(current.has(key))return current;const next=new Set(current);next.add(key);return next})
  if(key==='complaint')setComplaintImportOpen(true)
  else if(key==='it')setItImportOpen(true)
  else if(key==='ambulance')setAmbulanceImportOpen(true)
  else if(key==='ibs')setIbsImportOpen(true)
  else if(key==='pharmacy')setPharmacyImportOpen(true)
  else if(key==='gizi')setGiziImportOpen(true)
  else if(key==='laboratory')setLaboratoryImportOpen(true)
  else if(key==='igd')setIgdImportOpen(true)
  else if(key==='outpatient')setOutpatientImportOpen(true)
  else if(key==='rehab')setRehabImportOpen(true)
  else if(key==='icu')setIcuImportOpen(true)
  else if(key==='perinatology')setPerinatologyImportOpen(true)
  else if(key==='nicu')setNicuImportOpen(true)
  else if(key==='nifas')setNifasImportOpen(true)
  else if(key==='ponek')setPonekImportOpen(true)
  else if(key==='pediatric-inpatient')setPediatricInpatientImportOpen(true)
  else if(key==='surgical-inpatient')setSurgicalInpatientImportOpen(true)
  else if(key==='isolasi-inpatient')setIsolasiInpatientImportOpen(true)
  else if(key==='saraf-inpatient')setSarafInpatientImportOpen(true)
  else if(key==='penyakit-dalam-inpatient')setPenyakitDalamInpatientImportOpen(true)
 }
 const [unitPickerOpen,setUnitPickerOpen]=useState(false)
 const [unitPickerRoomId,setUnitPickerRoomId]=useState('')

 const roomMap=useMemo(()=>new Map(rooms.map(r=>[Number(r.id),r.name])),[rooms])
 const activeLayout=useMemo(()=>getLayout(roomId),[roomId])
 const activeGrain=useMemo(()=>dominantGrain(profiles,activeLayout),[profiles,activeLayout])
 const selectedLayout=useMemo(()=>selected?(selected.layoutOverride as AuditLayout|undefined)??getLayoutForRoom(Number(selected.roomId),String(selected.unit??'')):activeLayout,[selected,activeLayout])
 const patientProfiles=useMemo(()=>layoutProfiles(profiles,activeLayout).filter(p=>!(Number(activeLayout?.roomId)===11&&/waktu tunggu rawat jalan/i.test(displayTitle(p)))),[profiles,activeLayout])
 const summaryFields=useMemo(()=>{
   if(Number(activeLayout?.roomId)===5)return [
     'Tanggal pengamatan',
     'Alur layanan',
     'Jumlah Copy Resep yang Ditulis Oleh Farmasi / Jumlah Resep yang Dilayani Farmasi',
     'Jumlah Obat yang Tidak Dilabeli High Alert / Jumlah Obat yang Harusnya Dilabeli',
     'Jumlah Resep yang Patuh Dengan Formularium Nasional / Jumlah Resep yang Dilayani Farmasi',
     'Jumlah Resep yang Patuh Dengan Formularium Rumah Sakit / Jumlah Resep yang Dilayani Farmasi',
   ]
   const fields=activeLayout?.fields??['Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Diagnosa Tegak','DPJP']
   const patterns=[/nama pasien|nama mahasiswa|nama mpp|nama pelapor|nama tenaga|uraian temuan|insiden yang terjadi/i,/no\.? rekam medis|no\.? rm|kode laporan|kode insiden/i,/tanggal masuk|tanggal audit|tanggal aduan|tanggal kunjungan|tanggal permintaan|tanggal kejadian|tanggal laporan/i,/tanggal keluar|tanggal selesai/i,/diagnosa|diagnosis|jenis kejadian|jenis layanan|klinik|unit kerja|ruangan/i,/dpjp|dokter|petugas|penanggung jawab/i]
   const picked:string[]=[]
   for(const pattern of patterns){const match=fields.find(field=>pattern.test(field)&&!picked.includes(field));if(match&&picked.length<5)picked.push(match)}
   for(const field of fields){if(picked.length>=5)break;if(!picked.includes(field))picked.push(field)}
   return picked.slice(0,5)
 },[activeLayout])
 const summaryCellValue=(p:Patient,field:string)=>{
   if(Number(p.roomId)===5){
     const byField=[
       ['Jumlah Copy Resep yang Ditulis Oleh Farmasi / Jumlah Resep yang Dilayani Farmasi','5.2'],
       ['Jumlah Obat yang Tidak Dilabeli High Alert / Jumlah Obat yang Harusnya Dilabeli','5.3'],
       ['Jumlah Resep yang Patuh Dengan Formularium Nasional / Jumlah Resep yang Dilayani Farmasi','5.4'],
       ['Jumlah Resep yang Patuh Dengan Formularium Rumah Sakit / Jumlah Resep yang Dilayani Farmasi','5.5'],
     ]
     const match=byField.find(item=>item[0]===field)
     if(match){
       const code=match[1]
       const value=p.indicatorValues?.[code] as Resp|undefined
       if(!value||value.denominator==null||value.numerator==null||Number(value.denominator)<=0)return '—'
       const inputN=code==='5.3'?(value.noncompliant??Number(value.denominator)-Number(value.numerator)):value.numerator
       return Number(inputN).toLocaleString('id-ID')+' / '+Number(value.denominator).toLocaleString('id-ID')
     }
   }
   return fieldValue(p,field,getLayout(Number(p.roomId)))
 }

 const load=useCallback(async()=>{
   setBusy(true)
   setMessage('')
   // Remove legacy PHI caches without reading or restoring their contents.
   if(typeof window!=='undefined'){try{window.localStorage.removeItem('aureka-quality-episode-cache-v3');window.localStorage.removeItem('aureka-quality-audit-v3')}catch{}}
   try{
     if(roomId==null){setProfiles([]);setStaffOptions([]);setPatients([]);setSource('Unit belum dipilih');setMessage('Unit kerja belum tersedia. Pilih unit pertama yang tersedia sebelum membuka logbook.');return}
     // Profil, roster tenaga, dan catatan dimuat paralel (sebelumnya berurutan sehingga terasa lama).
     const profilesTask=(async()=>{
       const {data:pd,error:pe}=await q().from('indicator_profiles').select('*').eq('room_id',roomId).eq('profile_year',year).eq('status','published').eq('is_active',true).order('code')
       if(pe) throw pe
       setProfiles(pd??[])
     })()
     // Personnel fields are linked only to the locked roster for the current unit.
     const staffTask=(async()=>{
       const assignedPairs=await readAllPages<{staff_id:string;room_id:number}>((from,to)=>q().from('staff_team_assignments')
         .select('staff_id,room_id')
         .eq('room_id',roomId)
         .eq('assignment_status','active')
         .order('staff_id',{ascending:true})
         .range(from,to))
       const roomByStaff=new Map<string,number>(assignedPairs.map((a:any)=>[String(a.staff_id),Number(a.room_id)]))
       const assignedStaffIds=Array.from(roomByStaff.keys())
       const batches:string[][]=[]
       for(let offset=0;offset<assignedStaffIds.length;offset+=100)batches.push(assignedStaffIds.slice(offset,offset+100))
       const results=await Promise.all(batches.map(async batch=>{
         const {data:sd,error:staffError}=await q().from('staff_directory')
           .select('id,employee_code,display_name,profession_group,position_title,directory_status')
           .eq('directory_status','available')
           .in('id',batch)
           .order('display_name')
         if(staffError) throw staffError
         return (sd??[]).map((s:any)=>({...s,id:String(s.id),room_id:Number(roomByStaff.get(String(s.id)))})) as TeamStaffOption[]
       }))
       setStaffOptions(results.flat())
     })()
     const recordsTask=(async()=>{
       const out:any[]=[]
       let from=0
       while(true){
         let rq=q().from('quality_records').select('*').eq('room_id',roomId).eq('profile_year',year).order('created_at',{ascending:false}).range(from,from+499)
         if(patientRegistryMode)rq=rq.eq('measurement_grain','patient_episode')
         const {data,error}=await rq
         if(error) throw error
         out.push(...(data??[]))
         if((data??[]).length<500) break
         from+=500
       }
       return out
     })()
     const [,,rows]=await Promise.all([profilesTask,staffTask,recordsTask])
     const attributionByRecord=new Map<string,Record<string,string>>()
     const databaseRecordIds=rows.map((r:any)=>String(r.id)).filter(Boolean)
     const attrBatches:string[][]=[]
     for(let offset=0;offset<databaseRecordIds.length;offset+=100)attrBatches.push(databaseRecordIds.slice(offset,offset+100))
     // Atribusi tenaga dimuat paralel per kelompok (maks. 6 permintaan bersamaan).
     for(let i=0;i<attrBatches.length;i+=6){
       await Promise.all(attrBatches.slice(i,i+6).map(async batch=>{
         let attrFrom=0
         while(true){
           const {data:attributions,error:attributionError}=await q().from('quality_record_staff_attributions')
             .select('record_id,staff_id,field_key')
             .in('record_id',batch)
             .range(attrFrom,attrFrom+499)
           if(attributionError) throw attributionError
           ;(attributions??[]).forEach((a:any)=>{
             const key=String(a.record_id)
             if(!attributionByRecord.has(key)) attributionByRecord.set(key,{})
             attributionByRecord.get(key)![String(a.field_key)]=String(a.staff_id)
           })
           if(!attributions||attributions.length<500) break
           attrFrom+=500
         }
       }))
     }
     const db=rows.filter(r=>r.status!=='archived').map((r:any)=>{
       const c=r.core_data??r.subject_json??{}
       const formData=(c.form_fields??c.form_data??{}) as Record<string,any>
       const rowRoom=Number(r.room_id??c.room_id??0)||null
       const rowLayout=getLayout(rowRoom)
       const unit=String(c.unit_name??roomMap.get(Number(rowRoom))??'')
       const admit=String(c.admission_at??c.admit??recordDateFrom(formData,rowLayout,String(r.record_date??''))??'')
       const discharge=String(c.discharge_at??c.discharge??formData['Tanggal Keluar']??'')
       const name=String(c.patient_name??formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??formData['Gangguan IT']??formData['Insiden yang Terjadi']??formData['Nama Pertemuan Ilmiah']??c.subject??'')
       const rm=String(c.medical_record_no??c.rm??formData['No. Rekam Medis']??formData['No. RM']??'')
       const diagnosis=String(c.diagnosis??formData['Diagnosa Tegak']??formData['Diagnosa']??formData['Diagnosa IGD']??formData['Diagnosa Pasien']??formData['Diagnosis Medis']??formData['Diagnosa Operasi']??c.dx??'')
       const dpjp=String(c.dpjp??formData['DPJP']??formData['Dpjp']??'')
       return {id:String(r.id),recordId:String(r.id),enteredBy:String(r.entered_by??''),roomId:rowRoom,unit,name,rm,sex:String(c.sex??formData['Jenis Kelamin']??''),age:c.age==null||c.age===''?null:Number(c.age),admit,discharge,diagnosis,dpjp,status:r.status==='ready'?'Ready for Review':r.status==='validated'?'Validated':r.status==='reopened'?'Reopened':r.status==='draft'?'Draft':String(c.workflow_status??c.status??(discharge?'Ready for Review':'Aktif')),databaseStatus:String(r.status??'draft'),reviewRequired:!!r.review_required,validationNote:String(r.validation_note??''),validatedBy:r.validated_by??null,validatedAt:r.validated_at??null,indicatorValues:(c.indicator_values??{}),formData,allowCrossYear:c.source_import?.allow_cross_year===true,excludeFromYearMetrics:c.source_import?.exclude_from_profile_year_metrics===true,staffIdByField:attributionByRecord.get(String(r.id))??{},measurementGrain:String(r.measurement_grain??c.measurement_grain??'event'),source:'database',updatedAt:String(r.updated_at??r.created_at??'')}
     })
     setPatients(db.filter((row:Patient)=>String(row.databaseStatus??'')!=='archived'))
     setSource('Supabase')
   }catch(e){
     setPatients([])
     setProfiles([])
     setSource('Supabase tidak tersedia')
     setMessage(`Data tidak dapat dimuat dari server. Tidak ada draf pasien yang dipulihkan dari browser. ${toUserFacingError(e,{fallback:'Periksa koneksi dan hak akses, lalu coba kembali.'})}`.trim())
   }finally{setBusy(false)}
 },[roomId,roomMap,year,patientRegistryMode])

 useEffect(()=>{void load()},[load])

 const filtered=useMemo(()=>patients.filter(p=>{
   const roomOk=roomId==null||Number(p.roomId)===Number(roomId)||p.unit===roomMap.get(Number(roomId))
   const monthOk=!monthFilter||mon(p.admit)===monthFilter
   const hay=`${p.name} ${p.rm} ${p.diagnosis} ${p.dpjp} ${p.unit} ${JSON.stringify(p.formData??{})}`.toLowerCase()
   return (ymd(p.admit)===year||p.allowCrossYear===true||(!p.admit&&p.source==='memory'&&!p.recordId))&&roomOk&&monthOk&&hay.includes(search.toLowerCase().trim())
 }),[patients,year,roomId,roomMap,monthFilter,search])
 const yearPatients=useMemo(()=>patients.filter(p=>!p.excludeFromYearMetrics&&(ymd(p.admit)===year||p.allowCrossYear===true||(!p.admit&&p.source==='memory'&&!p.recordId))&&(roomId==null||Number(p.roomId)===Number(roomId)||p.unit===roomMap.get(Number(roomId)))),[patients,year,roomId,roomMap])
 const unmatchedIndicatorHeaders=useMemo(()=>unmatchedHeaders(profiles,activeLayout),[profiles,activeLayout])
 const selectedUnmatchedHeaders=useMemo(()=>unmatchedHeaders(profiles,selectedLayout),[profiles,selectedLayout])
 const applicable=useMemo(()=>selected?layoutProfiles(profiles,selectedLayout).filter(p=>Number(p.room_id)===Number(selected.roomId)&&!(Number(selected.roomId)===11&&/waktu tunggu rawat jalan/i.test(displayTitle(p)))).sort((a,b)=>(hit(a,selected.diagnosis)?0:1)-(hit(b,selected.diagnosis)?0:1)||String(a.code).localeCompare(String(b.code),undefined,{numeric:true})):[],[selected,profiles,selectedLayout])
 const filledN=useMemo(()=>applicable.filter(p=>responseComplete(p,draft[p.id??p.code])).length,[applicable,draft])

 const openPatient=(p:Patient)=>{
   const layout=getLayoutForRoom(Number(p.roomId),String(p.unit??''))
   const r:any={}
   layoutProfiles(profiles,layout).forEach(x=>{r[x.id??x.code]=p.indicatorValues?.[x.code]??empty(x)})
   setSelected({...p,layoutOverride:layout})
   setDraft(r)
   setPatientOpen(true)
   setMessage('')
 }
 const newPatient=(requestedRoomId?:number,initialFields:Record<string,any>={})=>{
   if(isValidator){setMessage('Akun validator hanya dapat meninjau dan memvalidasi catatan yang dikirim unit.');return}
   const targetRoomId=requestedRoomId??roomId
   if(targetRoomId==null){setUnitPickerRoomId(rooms[0]?String(rooms[0].id):'');setUnitPickerOpen(true);return}
   const pickedRoom=rooms.find(r=>Number(r.id)===Number(targetRoomId))
   const layout=getLayoutForRoom(targetRoomId,pickedRoom?.name)
   if(!layout){
     setMessage('Template logbook untuk unit ini belum tersedia. Catatan baru tidak dibuka agar tidak memakai formulir unit lain.')
     return
   }
   // Template matching uses the selected room label as well as its ID; this prevents a stale/mismatched ID from opening another unit's form.
   const canonicalRoomId=Number(layout.roomId)
   const canonicalRoom=rooms.find(r=>Number(r.id)===canonicalRoomId)
   const unitName=String(pickedRoom?.name??canonicalRoom?.name??roomMap.get(canonicalRoomId)??'')
   const today=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()
   const formData:Record<string,any>={}
   ;(layout.fields??[]).forEach(field=>{formData[field]=inputKind(field,layout)==='computed'?'':''})
   const dateField=primaryDateField(layout)
   if(dateField){const now=new Date();formData[dateField]=inputKind(dateField,layout)==='datetime-local'?today+'T'+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'):today}
   Object.entries(initialFields).forEach(([field,value])=>{if((layout.fields??[]).includes(field))formData[field]=value})
   const grain=dominantGrain(profiles,layout)
   const admit=recordDateFrom(formData,layout,today)
   const selectedRecord={id:`LOCAL-${Date.now()}`,recordId:null,roomId:canonicalRoomId,unit:unitName,layoutOverride:layout,name:String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??''),rm:String(formData['No. Rekam Medis']??formData['No. RM']??''),sex:String(formData['Jenis Kelamin']??''),age:null,admit,discharge:String(formData['Tanggal Keluar']??''),diagnosis:String(formData['Diagnosa Tegak']??formData['Diagnosa']??''),dpjp:String(formData['DPJP']??formData['Dpjp']??''),status:'Draft',indicatorValues:{},formData,staffIdByField:{},measurementGrain:grain,source:'local',updatedAt:null}
   setPatients(p=>[selectedRecord,...p.filter(x=>x.id!==selectedRecord.id)])
   setSelected(selectedRecord)
   const r:any={}
   layoutProfiles(profiles,layout).forEach(p=>{r[p.id??p.code]=empty(p)})
   setDraft(r);setPatientOpen(true);setMessage('')
 }
 const setField=(field:string,value:any)=>{
   setSelected(p=>{
     if(!p)return p
     const layout=(p.layoutOverride as AuditLayout|undefined)??getLayoutForRoom(Number(p.roomId),String(p.unit??''))
     const formData={...(p.formData??{}),[field]:value}
     const staffIdByField={...(p.staffIdByField??{})};delete staffIdByField[field]
     if(normHeader(field)==='klinik'&&layout?.providerGroups?.length){const selectedClinic=layout.providerGroups.find(g=>g.clinic===String(value));if(!selectedClinic?.doctors.includes(String(formData['Dokter']??''))){formData['Dokter']='';delete staffIdByField['Dokter']}}
     const name=String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??formData['Gangguan IT']??formData['Insiden yang Terjadi']??formData['Nama Pertemuan Ilmiah']??formData['Nama MPP']??p.name??'')
     const rm=String(formData['No. Rekam Medis']??formData['No. RM']??p.rm??'')
     const admit=recordDateFrom(formData,layout,String(p.admit??''))
     const discharge=String(formData['Tanggal Keluar']??p.discharge??'')
     const diagnosis=String(formData['Diagnosa Tegak']??formData['Diagnosa']??formData['Diagnosa IGD']??formData['Diagnosa Pasien']??formData['Diagnosis Medis']??formData['Diagnosa Operasi']??p.diagnosis??'')
     const dpjp=String(formData['DPJP']??formData['Dpjp']??p.dpjp??'')
     const ageField=layout?.fields.find(x=>normHeader(x)==='umur'||normHeader(x)==='usia')
     const ageValue=ageField&&isComputedField(ageField,layout)?computedField(ageField,formData,layout):formData['Umur']??formData['Usia']??p.age
     return {...p,formData,staffIdByField,name,rm,admit,discharge,diagnosis,dpjp,age:ageValue===''||ageValue==null?null:Number(ageValue)}
   })
 }
 const setStaffField=(field:string,staffId:string)=>{
   const staff=staffOptions.find((item)=>item.id===staffId&&Number(item.room_id)===Number(selected?.roomId))
   setSelected((p:any)=>{
     if(!p)return p
     const formData={...(p.formData??{}),[field]:staff?.display_name??''}
     const staffIdByField={...(p.staffIdByField??{})}
     if(staff)staffIdByField[field]=staff.id
     else delete staffIdByField[field]
     return {...p,formData,staffIdByField,dpjp:/dpjp|dokter/i.test(field)?(staff?.display_name??''):p.dpjp}
   })
 }
 const setStaffNameValue=(field:string,name:string)=>{
    const normalized=String(name??'').trim()
    const nameKey=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID')
    const staff=staffOptionsForField(field).find(item=>nameKey(item.display_name)===nameKey(normalized))
    setSelected((p:any)=>{
      if(!p)return p
      const formData={...(p.formData??{}),[field]:staff?.display_name??normalized}
      const staffIdByField={...(p.staffIdByField??{})}
      if(staff)staffIdByField[field]=staff.id
      else delete staffIdByField[field]
      return {...p,formData,staffIdByField,dpjp:/dpjp|dokter/i.test(field)?(staff?.display_name??normalized):p.dpjp}
    })
  }
  const setResp=(p:Profile,patch:Resp)=>{const k=String(p.id??p.code);setDraft(x=>({...x,[k]:{...(x[k]??empty(p)),...patch}}))}

 const save=async()=>{
   if(isValidator){setMessage('Akun validator tidak dapat mengubah data sumber. Gunakan tindakan validasi pada daftar logbook.');return}
   if(!selected)return
   const layout=(selected.layoutOverride as AuditLayout|undefined)??getLayoutForRoom(Number(selected.roomId),String(selected.unit??''))??activeLayout
   const formData:Record<string,any>={...(selected.formData??{})}
   const identityCandidates=['Nama Pasien','Nama Mahasiswa','Nama MPP','Gangguan IT','Insiden yang Terjadi','Nama Pertemuan Ilmiah','Uraian Temuan Audit','Nama Pertemuan Ilmiah']
   const identityField=layout?.fields.find(f=>identityCandidates.includes(f))??layout?.fields[0]
   if(identityField&&!String(formData[identityField]??'').trim()){
     setMessage(`Kolom "${identityField}" wajib diisi sebelum laporan dikirim.`);return
   }
   const dateField=primaryDateField(layout)
   if(dateField&&!String(formData[dateField]??'').trim()){
     setMessage(`Kolom tanggal "${dateField}" wajib diisi sebelum laporan dikirim.`);return
   }
   const calc:any={}
   ;(layout?.fields??[]).filter(field=>isComputedField(field,layout)).forEach(field=>{
     const v=computedField(field,formData,layout)
     if(v!=null)calc[field]=v
   })
   const recordDate=recordDateFrom(formData,layout,String(selected.admit??''))
   const normalizedName=String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??formData['Gangguan IT']??formData['Insiden yang Terjadi']??formData['Nama Pertemuan Ilmiah']??selected.name??'').trim()
   const normalizedRm=String(formData['No. Rekam Medis']??formData['No. RM']??selected.rm??'').trim()
   const normalizedDiagnosis=String(formData['Diagnosa Tegak']??formData['Diagnosa']??formData['Diagnosa IGD']??formData['Diagnosa Pasien']??formData['Diagnosis Medis']??formData['Diagnosa Operasi']??selected.diagnosis??'').trim()
   const normalizedDpjp=String(formData['DPJP']??formData['Dpjp']??selected.dpjp??'').trim()
   const discharge=String(formData['Tanggal Keluar']??selected.discharge??'')
   const values:any={}
   applicable.forEach(p=>{const r=draft[p.id??p.code];if(r)values[p.code]=r})
   const grain=String(selected.measurementGrain??dominantGrain(profiles,layout))
   const outpatientProviderDay=Number(selected.roomId)===11&&grain==='provider_day'
   const outpatientMeasurementComplete=outpatientProviderDay
     &&!!recordDate
     &&!!String(formData['Klinik']??'').trim()
     &&!!String(formData['Dokter']??'').trim()
     &&formData['Waktu Tunggu Rawat Jalan (Menit)']!=null
     &&String(formData['Waktu Tunggu Rawat Jalan (Menit)']).trim()!==''
     &&Number.isFinite(Number(formData['Waktu Tunggu Rawat Jalan (Menit)']))
     &&Number(formData['Waktu Tunggu Rawat Jalan (Menit)'])>=0
     &&Number(formData['Waktu Tunggu Rawat Jalan (Menit)'])<=1440
   const complete=outpatientProviderDay?outpatientMeasurementComplete:(applicable.length>0&&applicable.every(p=>responseComplete(p,draft[p.id??p.code])))
   const stayLayout=!!layout?.fields.some(f=>normHeader(f)==='tanggal masuk')&&!!layout?.fields.some(f=>normHeader(f)==='tanggal keluar')
   if(!complete){setMessage('Indikator atau pengukuran belum lengkap. Lengkapi seluruh isian wajib sebelum menyimpan laporan final.');return}
   const finalStatus='Final'
   const payloadStatus='ready'
   const now=new Date().toISOString()
   const serviceStream=String(formData['Alur layanan']??'').trim()
   if(Number(selected.roomId)===5&&grain==='daily_metric'&&!['Rawat Jalan','Rawat Inap'].includes(serviceStream)){setMessage('Pilih alur layanan Rawat Jalan atau Rawat Inap sebelum melaporkan catatan harian Farmasi.');return}
   if(grain==='provider_day'&&(!String(formData['Klinik']??'').trim()||!String(formData['Dokter']??'').trim())){setMessage('Klinik dan dokter wajib diisi sebelum melaporkan catatan dokter-hari.');return}
   if(Number(selected.roomId)===11&&grain==='provider_day'){
     const waitingMinutes=formData['Waktu Tunggu Rawat Jalan (Menit)']
     if(waitingMinutes==null||String(waitingMinutes).trim()===''||!Number.isFinite(Number(waitingMinutes))||Number(waitingMinutes)<0||Number(waitingMinutes)>1440){setMessage('Isi waktu tunggu rawat jalan 0–1.440 menit sebelum melaporkan.');return}
   }
   if(grain==='provider_day'&&!recordDate){setMessage('Tanggal pengamatan wajib diisi sebelum melaporkan.');return}
   const core={patient_name:normalizedName,medical_record_no:normalizedRm,sex:String(formData['Jenis Kelamin']??selected.sex??''),age:formData['Umur']??formData['Usia']??selected.age,admission_at:formData['Tanggal Masuk']??recordDate,discharge_at:discharge,diagnosis:normalizedDiagnosis,dpjp:normalizedDpjp,unit_name:selected.unit,room_id:selected.roomId,status:finalStatus,workflow_status:finalStatus,form_fields:formData,calculated_fields:calc,indicator_values:values,measurement_grain:grain,los_days:calc['Lenght of Stay']??calc['Length of Stay']??(stayLayout?los(String(formData['Tanggal Masuk']??''),discharge):null)}
   setBusy(true)
   let recordId=selected.recordId,backend=false,savedEnteredBy=String(selected.enteredBy??'')
   try{
     const {data:{user}}=await sb.auth.getUser()
     if(!user) throw new Error('Sesi login tidak ditemukan.')
     savedEnteredBy=savedEnteredBy||String(user.id)
     const clinicName=String(formData['Klinik']??'').trim()
     const doctorName=String(formData['Dokter']??'').trim()
     const providerKeyReady=grain==='provider_day'&&!!recordDate&&!!clinicName&&!!doctorName
     const dailyKeyReady=grain==='daily_metric'&&!!recordDate&&!!serviceStream
     const subjectKey=providerKeyReady?`${selected.roomId}:${String(recordDate).slice(0,10)}:${clinicName}:${doctorName}`:dailyKeyReady?`${selected.roomId}:${String(recordDate).slice(0,10)}:${serviceStream}`:normalizedRm||`${selected.roomId}:draft:${selected.recordId??selected.id}`
     const payload={room_id:selected.roomId,profile_year:year,measurement_grain:grain,record_date:recordDate?String(recordDate).slice(0,10):null,subject_key:subjectKey,subject_json:core,core_data:core,status:payloadStatus,review_required:false,entered_by:user.id}
     if(!recordId&&((grain==='provider_day'&&providerKeyReady)||(grain==='daily_metric'&&dailyKeyReady))){
       const {data:existing,error:lookupError}=await q().from('quality_records').select('id').eq('room_id',selected.roomId).eq('profile_year',year).eq('measurement_grain',grain).eq('subject_key',subjectKey).neq('status','archived').limit(1).maybeSingle()
       if(lookupError)throw lookupError
       if(existing?.id){setBusy(false);setMessage(grain==='provider_day'?'Catatan untuk dokter, klinik, dan tanggal tersebut sudah ada. Buka catatan yang ada untuk memperbaruinya.':'Catatan harian untuk tanggal dan alur layanan tersebut sudah ada. Buka catatan yang ada untuk memperbaruinya.');return}
     }
     const obs=applicable.map(p=>{const r=values[p.code];if(!r||!p.id)return null;const code=Number(r.code);return{indicator_id:p.id,response_label:r.answer??r.occurrence??null,response_code:r.source_option===true?null:Number.isInteger(code)&&code>=1&&code<=3?code:null,raw_value:r,other_text:String(r.free_text??'').trim()||(r.source_option===true?(r.source_label??r.answer??null):r.evidence??r.notes??null),review_status:r.source_option===true||r.review_required===true||r.answer==='Exception'?'pending':'not_required'}}).filter(Boolean)
     const attributionRows=Object.entries(selected.staffIdByField??{})
       .filter(([field,staffId])=>!!field&&!!staffId&&staffOptions.some((staff)=>staff.id===staffId&&Number(staff.room_id)===Number(selected.roomId)))
       .map(([field,staffId])=>({staff_id:staffId,field_key:field,attribution_type:/dpjp|dokter/i.test(field)?'responsible_provider':'related_provider'}))
     const {data:savedId,error:saveError}=await q().rpc('save_quality_logbook',{p_record_id:recordId&&/^[0-9a-f-]{36}$/i.test(String(recordId))?recordId:null,p_payload:payload,p_responses:obs,p_attributions:attributionRows})
     if(saveError)throw saveError
     if(!savedId)throw new Error('Server tidak mengembalikan identitas catatan yang tersimpan.')
     recordId=String(savedId)
     backend=true
   }catch(e){
     setSource('Supabase')
     setMessage(`Belum tersimpan ke server. Periksa koneksi dan isi formulir; draf tetap terbuka dan hanya berada di memori sampai penyimpanan berhasil. ${toUserFacingError(e,{fallback:'Periksa koneksi dan hak akses, lalu coba kembali.'})}`.trim())
     setBusy(false)
     return
   }
    const saved:Patient={...selected,id:recordId??selected.id,enteredBy:savedEnteredBy,databaseStatus:payloadStatus,name:normalizedName,rm:normalizedRm,admit:String(recordDate??selected.admit??''),discharge,diagnosis:normalizedDiagnosis,dpjp:normalizedDpjp,formData,staffIdByField:selected.staffIdByField??{},measurementGrain:grain,recordId:recordId??null,status:finalStatus,updatedAt:now,indicatorValues:values,source:backend?'database':'local'}
   setPatients(p=>[saved,...p.filter(x=>x.id!==selected.id&&(!(x.rm&&saved.rm)||x.rm!==saved.rm))])
   setSelected(saved);setPatientOpen(false);setMessage('Laporan final berhasil disimpan. PIC tetap dapat membuka dan mengedit laporan ini.');setBusy(false)
   return true
 }
 // Simpan lalu langsung buka formulir baru di unit yang sama; DPJP/dokter & alur layanan terbawa agar pengisian berikutnya cepat.
 const saveAndNew=async()=>{
   if(!selected)return
   const roomNow=Number(selected.roomId)
   const carry:Record<string,any>={}
   Object.entries((selected.formData??{}) as Record<string,any>).forEach(([field,value])=>{if(/^(dpjp|nama dokter|dokter|dokter penanggung jawab|alur layanan|ruangan|kelas|cara bayar|penjamin)$/i.test(field.trim())&&String(value??'').trim())carry[field]=value})
   const ok=await save()
   if(ok===true){newPatient(roomNow,carry);setMessage('Tersimpan ✓ Formulir berikutnya siap diisi.');window.setTimeout(()=>{const f=document.querySelector<HTMLElement>('.aqEditorDialog .aqEpisode input:not([readonly]):not([disabled]), .aqEditorDialog .aqEpisode select:not([disabled])');f?.focus()},120)}
 }

 const archivePatient=async(p:Patient)=>{
  if(isValidator||busy)return
  if(p.source==='local'&&!p.recordId){
   setPatients(current=>current.filter(row=>String(row.id)!==String(p.id)))
   if(selected&&String(selected.id)===String(p.id)){setPatientOpen(false);setSelected(null)}
   setPendingArchive(null)
   setMessage('Draf yang belum disimpan berhasil dibuang.')
   return
  }
  if(!p.recordId){
   setPendingArchive(null)
   setMessage('Catatan ini tidak memiliki identitas server yang valid. Muat ulang data atau simpan ulang catatan.')
   return
  }
  setBusy(true)
  setMessage('')
  try{
   const {data,error}=await q().rpc('archive_quality_logbook',{p_record_id:String(p.recordId)})
   if(error)throw error
   if(data!==true)throw new Error('Server tidak mengonfirmasi pengarsipan catatan.')
   setPatients(current=>current.filter(row=>String(row.recordId??row.id)!==String(p.recordId)))
   if(selected&&String(selected.recordId??selected.id)===String(p.recordId)){setPatientOpen(false);setSelected(null)}
   setPendingArchive(null)
   setPendingArchive(null)
   await load()
   setMessage('Catatan berhasil dihapus dari logbook aktif.')
  }catch(error){
   const raw=error as {message?:string;details?:string;hint?:string;code?:string}
   const detail=[raw?.message,raw?.details,raw?.hint,raw?.code?('Kode '+raw.code):''].filter(Boolean).join(' · ')||'Periksa koneksi dan hak akses.'
   setPendingArchive(null)
   setMessage('Catatan belum dapat dihapus: '+detail)
  }finally{setBusy(false)}
 }

 const indicatorEditor=(p:Profile)=>{
   const k=String(p.id??p.code),r=draft[k]??empty(p),kindNow=String(p.schema_json?.input_mode??'')==='free_text_event'?'occurrence':kind(p),isHit=hit(p,selected?.diagnosis??''),opts=optionsFor(p),title=displayTitle(p)
   const choices=indicatorChoicesFor(p,selectedLayout,r)
   const selectedChoiceIndex=findIndicatorDropdownSelection(choices,r as any)
   const selectedChoice=selectedChoiceIndex>=0?choices[selectedChoiceIndex]:undefined
   const option=opts.find((x:any)=>String(x.label)===String(r.answer))
   const resultCode=r.source_option===true?null:(r.code??option?.code??null)
   const needsSourceReview=r.source_option===true||r.review_required===true||!!selectedChoice?.source_only||!!selectedChoice?.review_required||option?.review_required===true
   const rateNow=r.denominator!=null&&Number(r.denominator)>0&&r.numerator!=null?Number(r.numerator)/Number(r.denominator)*100:null
   const metricMet=targetMet(p,r)
   const targetKinds=['ratio','visit','door','minutes','numeric'].includes(kindNow)
   const actualForTarget=kindNow==='ratio'?rateNow:kindNow==='door'?diff(String(r.start??''),String(r.end??'')):kindNow==='minutes'?r.minutes:kindNow==='numeric'?r.value:kindNow==='visit'?r.time:null
   const resultLabel=targetKinds?(actualForTarget==null||actualForTarget===''?'Belum dihitung':metricMet==null?'Target belum dapat dinilai':metricMet?'Memenuhi target':'Belum memenuhi target'):needsSourceReview?'Perlu review':resultCode===1?'Memenuhi / Sesuai':resultCode===2?'Pengecualian / Perlu review':resultCode===3?'Tidak memenuhi / Tidak sesuai':(option?.code==null&&r.answer)?'Perlu review':'Belum tervalidasi'
   const freeTextEvent=String(p.schema_json?.input_mode??'')==='free_text_event'
   const genericOptions=!freeTextEvent&&(shouldUseIndicatorDropdown(p)||(choices.length>1&&!['ratio','visit','door','minutes','numeric'].includes(kindNow)))
   const typeLabel=indicatorTypeLabel(p.indicator_type)
   const grainText=grainLabel(String(p.measurement_grain))
   return <article className={'aqInd '+(isHit?'hit':'')} key={k}>
     <div className="aqIHead">
       <div className="aqIndicatorHeadMain">
         <div className="aqIndicatorHeading"><span className="aqIndicatorCode">{p.code}</span><strong>{title}</strong></div>
         <div className="aqIndicatorMeta">
           {typeLabel&&<span className="aqMetaTag aqMetaCategory">{typeLabel}</span>}
           {p.target_text&&<span className="aqMetaTag">Target {p.target_text}</span>}
           {grainText&&<span className="aqMetaTag">{grainText}</span>}
         </div>
       </div>
       {isHit&&<span className="aqMatch">Relevan dengan diagnosis</span>}
     </div>
     <div className="aqIBody">
       <div className="aqQ">{kindNow==='visit'?'Apakah waktu visite memenuhi jendela waktu yang ditetapkan pada master indikator?':kindNow==='door'?'Berapa durasi dari pasien tiba sampai keputusan medis definitif?':kindNow==='minutes'?'Berapa waktu aktual yang diukur untuk indikator ini (menit)?':kindNow==='numeric'?'Berapa nilai numerik indikator pada episode pasien ini?':kindNow==='ratio'?'Masukkan jumlah pembilang dan penyebut dari pengukuran pada periode ini.':'Bagaimana hasil validasi '+title+' pada pasien ini?'}</div>
     {kindNow==='ratio'&&(()=>{
       const inverseInput=String(p.schema_json?.logbook_input_transform??'')==='denominator_minus_input'
       const rawInputNumber=inverseInput?(r.noncompliant??(r.denominator!=null&&r.numerator!=null?Number(r.denominator)-Number(r.numerator):null)):r.numerator
       const numeratorLabel=String(p.schema_json?.logbook_input_numerator_label??'Pembilang (N)')
       const denominatorLabel=String(p.schema_json?.logbook_input_denominator_label??'Penyebut (D)')
       const setInputNumber=(raw:number|null)=>{
         if(!inverseInput){setResp(p,{numerator:raw});return}
         setResp(p,{noncompliant:raw,numerator:raw!=null&&r.denominator!=null?Number(r.denominator)-raw:null})
       }
       const setInputDenominator=(raw:number|null)=>{
         if(!inverseInput){setResp(p,{denominator:raw});return}
         const bad=r.noncompliant??(r.denominator!=null&&r.numerator!=null?Number(r.denominator)-Number(r.numerator):null)
         setResp(p,{denominator:raw,numerator:raw!=null&&bad!=null?raw-Number(bad):null})
       }
       return <><div className="aqTwo"><label className="aqField"><span>{numeratorLabel}</span><input disabled={isValidator} type="number" min="0" max={inverseInput?(r.denominator??undefined):undefined} step="1" value={rawInputNumber??''} onChange={(e:any)=>setInputNumber(e.target.value===''?null:Number(e.target.value))} placeholder="Masukkan jumlah sesuai definisi sumber"/></label><label className="aqField"><span>{denominatorLabel}</span><input disabled={isValidator} type="number" min="0" step="1" value={r.denominator??''} onChange={(e:any)=>setInputDenominator(e.target.value===''?null:Number(e.target.value))} placeholder="Masukkan total yang diamati"/></label></div><div className="aqAuto" style={{marginTop:10}}><span>{inverseInput?'Kepatuhan':'Hasil'}</span><strong>{rateNow==null?'Menunggu pembilang dan penyebut':rateNow.toFixed(2)+'%'}</strong><small>{rateNow==null?'Penyebut harus lebih besar dari nol.':'Target '+(p.target_text||'—')+' · '+(metricMet==null?'Periksa target pada master':metricMet?'Memenuhi target':'Belum memenuhi target')+(inverseInput?' · N master = total sampel − obat tidak berlabel. Perhitungan ini hanya mencakup High Alert, belum LASA.':'')}</small></div></>
     })()}
     {freeTextEvent&&<label className="aqField" style={{marginTop:10}}><span>Nama obat yang tidak tersedia</span><input disabled={isValidator} type="text" value={r.free_text??''} onChange={(e:any)=>{const name=String(e.target.value??'');const present=!!name.trim();setResp(p,{free_text:name,answer:present?'Terjadi kekosongan obat':'Tidak terjadi kekosongan obat',code:present?3:1})}} placeholder="Tuliskan nama obat; kosongkan bila tidak terjadi kekosongan"/><small style={{color:'var(--muted)'}}>Nama obat yang diisi mencatat kejadian kekosongan (code 3); tidak diisi berarti tidak ada kejadian (code 1).</small></label>}
     {kindNow==='visit'&&<><div className="aqTwo" style={{marginTop:10}}><label className="aqField"><span>Waktu visite aktual</span><input disabled={isValidator} type="time" value={r.time??''} onChange={(e:any)=>{const value=e.target.value,met=isWithinVisitWindow(p,value);setResp(p,{time:value,answer:met==null?'':met?'Ya':'Tidak',code:met==null?null:met?1:3})}}/></label><div className="aqAuto"><span>Hasil</span><strong>{r.time?(metricMet==null?'Target belum ditentukan':metricMet?'Memenuhi target':'Tidak memenuhi target'):'Belum dihitung'}</strong><small>Target {p.target_text||'belum ditetapkan pada master'}</small></div></div></>}
     {kindNow==='door'&&<><div className="aqTwo"><label className="aqField"><span>Waktu pasien tiba</span><input disabled={isValidator} type="time" value={r.start??''} onChange={(e:any)=>{const value=e.target.value,met=targetMet(p,{...r,start:value});setResp(p,{start:value,code:met==null?null:met?1:3})}}/></label><label className="aqField"><span>Waktu keputusan medis</span><input disabled={isValidator} type="time" value={r.end??''} onChange={(e:any)=>{const value=e.target.value,met=targetMet(p,{...r,end:value});setResp(p,{end:value,code:met==null?null:met?1:3})}}/></label></div><div className="aqAuto" style={{marginTop:10}}><span>Durasi</span><strong>{r.start&&r.end&&diff(r.start,r.end)!=null?`${diff(r.start,r.end)} menit`:'Belum dihitung'}</strong><small>Target {p.target_text||'belum ditetapkan pada master'}</small></div></>}
     {kindNow==='minutes'&&<div className="aqTwo"><label className="aqField"><span>Waktu aktual (menit)</span><input disabled={isValidator} type="number" min="0" value={r.minutes??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value),met=targetMet(p,{...r,minutes:v});setResp(p,{minutes:v,code:met==null?null:met?1:3})}}/></label><div className="aqAuto"><span>Interpretasi</span><strong>{r.minutes==null?'Belum diisi':metricMet==null?'Target perlu dilengkapi':metricMet?'Memenuhi target':'Tidak memenuhi target'}</strong></div></div>}
     {kindNow==='numeric'&&<label className="aqField"><span>Nilai indikator</span><input disabled={isValidator} type="number" step="0.01" value={r.value??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value),met=targetMet(p,{...r,value:v});setResp(p,{value:v,code:met==null?null:met?1:3})}}/></label>}
     {kindNow==='occurrence'&&!genericOptions&&<div className="aqRadio"><label><input disabled={isValidator} type="radio" checked={r.occurrence==='Tidak terjadi'} onChange={()=>setResp(p,{occurrence:'Tidak terjadi',code:1})}/> Tidak terjadi</label><label><input disabled={isValidator} type="radio" checked={r.occurrence==='Terjadi'} onChange={()=>setResp(p,{occurrence:'Terjadi',code:3})}/> Terjadi</label></div>}
     {genericOptions&&<label className="aqField aqChoiceField"><select aria-label={'Hasil pengukuran '+title} disabled={isValidator} value={selectedChoiceIndex>=0?String(selectedChoiceIndex):''} onChange={(e:any)=>{const choice=choices[Number(e.target.value)];if(!choice)return;setResp(p,{answer:choice.answer,code:choice.code,source_option:choice.source_only,review_required:choice.review_required===true||choice.code==null,source_label:choice.source_label,source_value:choice.source_label})}}><option value="">Pilih respons…</option>{choices.map((o:any,i:number)=><option key={k+'-opt-'+o.key} value={String(i)}>{String(o.label)}</option>)}</select></label>}
     
     {!genericOptions&&kindNow==='compliance'&&<div className="aqRadio"><label><input disabled={isValidator} type="radio" checked={r.answer==='Sesuai'} onChange={()=>setResp(p,{answer:'Sesuai',code:1})}/> Sesuai</label><label><input disabled={isValidator} type="radio" checked={r.answer==='Exception'} onChange={()=>setResp(p,{answer:'Exception',code:2})}/> Justified Exception</label><label><input disabled={isValidator} type="radio" checked={r.answer==='Tidak sesuai'} onChange={()=>setResp(p,{answer:'Tidak sesuai',code:3})}/> Tidak sesuai</label></div>}
     <div className="aqAuto aqResultSummary" style={{marginTop:10}}><span>Status pengukuran</span><strong>{resultLabel}</strong><small>{responseComplete(p,r)?'Respons lengkap':'Belum lengkap'}</small></div>
   </div></article>
 }

 const reviewRecord=async(_p:Patient,_decision:'validated'|'reopened')=>{setMessage('Validasi individual telah digantikan dengan pemeriksaan laporan bulanan. Gunakan tombol Sudah Diperiksa.')}
  const loadMonthlyReview=useCallback(async()=>{
    if(!isValidator||roomId==null){setMonthlyReview(null);return}
    const {data,error}=await q().rpc('aureka_quality_month_review_status',{p_room_id:roomId,p_year:year,p_month:reviewMonth})
    if(error){setMonthlyReview(null);setMessage(`Ringkasan pemeriksaan bulanan belum dapat dimuat: ${toUserFacingError(error,{fallback:'Ringkasan pemeriksaan bulanan belum dapat dimuat.'})}`);return}
    setMonthlyReview(data??null)
  },[isValidator,roomId,year,reviewMonth])
  useEffect(()=>{void loadMonthlyReview()},[loadMonthlyReview,patients])
  const confirmMonthlyReview=async()=>{
    if(!isValidator||roomId==null||monthlyReviewBusy)return
    setMonthlyReviewBusy(true);setMessage('')
    const {data,error}=await q().rpc('aureka_validator_review_quality_month',{p_room_id:roomId,p_year:year,p_month:reviewMonth})
    if(error){setMessage(`Pemeriksaan bulanan gagal disimpan: ${toUserFacingError(error,{fallback:'Pemeriksaan bulanan belum dapat disimpan.'})}`);setMonthlyReviewBusy(false);return}
    setMonthlyReview({...data,reviewed:true,is_current:true})
    setMessage('Pemeriksaan bulanan berhasil dicatat. Tanggal dan waktu validasi tersimpan.')
    setMonthlyReviewBusy(false)
  }
const isStaffNameField=(field:string)=>/(dpjp|dokter|perawat|bidan|petugas|penanggung jawab|radiografer|analis|atlm|terapis|apoteker|nutrisionis|dietisien|pemeriksa|pelaksana)/i.test(field)
 const staffOptionsForField=(field:string,targetRoomId:number|null|undefined=selected?.roomId)=>{
   const options=staffOptions.filter((staff)=>Number(staff.room_id)===Number(targetRoomId))
   const n=normHeader(field)
   if(/dokter|dpjp/.test(n))return options.filter((staff)=>/dokter/.test(staff.profession_group.toLowerCase())||/dokter|sp\./i.test(staff.position_title))
   if(/perawat/.test(n))return options.filter((staff)=>staff.profession_group==='Perawat')
   if(/bidan/.test(n))return options.filter((staff)=>staff.profession_group==='Bidan')
   if(/apoteker|farmasi/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga kefarmasian')
   if(/radiografer|radiologi/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga radiologi')
   if(/analis|atlm|laboratorium/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga laboratorium')
   if(/terapis|fisioterapi/.test(n))return options.filter((staff)=>staff.profession_group==='Fisioterapi/terapi okupasi')
   if(/nutrisionis|dietisien|gizi/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga gizi')
   return options
 }
 const renderLogbookField=(field:string,i:number)=>{
   const kindNow=inputKind(field,selectedLayout),raw=inputFieldValue(selected??{},field,selectedLayout),wide=kindNow==='textarea'||field.length>66
   const formattedComputed=typeof raw==='number'&&Number.isFinite(raw)?raw.toLocaleString('id-ID',{maximumFractionDigits:2}):String(raw)
   const groups=selectedLayout?.providerGroups??[]
   const currentClinic=String(selected?.formData?.['Klinik']??'')
   const staffField=isStaffNameField(field)&&kindNow!=='computed'
   const staffCandidates=staffField?staffOptionsForField(field):[]
   const selectedStaffId=String(selected?.staffIdByField?.[field]??'')
   const workbookStaffChoices=selectedLayout?.fieldOptions?.[field]??[]
   const nameKey=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID')
   const isProviderDayDoctor=normHeader(field)==='dokter'&&groups.length>0
   const clinicDoctorNames=isProviderDayDoctor?getOutpatientDoctorsForClinic(groups,currentClinic):[]
   const staffSelectChoices=staffField?(isProviderDayDoctor
     ? clinicDoctorNames.map((name,index)=>{
         const staff=staffCandidates.find(candidate=>nameKey(candidate.display_name)===nameKey(name))
         return {key:staff?'staff:'+staff.id:'provider:'+index,name,staffId:staff?.id??null,label:staff?name+' — '+staff.employee_code+' · '+staff.profession_group:name}
       })
     : [
         ...staffCandidates.map(staff=>({key:'staff:'+staff.id,name:staff.display_name,staffId:staff.id,label:staff.display_name+' — '+staff.employee_code+' · '+staff.profession_group})),
         ...workbookStaffChoices.filter(name=>!staffCandidates.some(staff=>nameKey(staff.display_name)===nameKey(name))).map((name,index)=>({key:'workbook:'+index,name,staffId:null as string|null,label:name})),
       ]
   ):[]
   if(staffField&&String(raw??'').trim()&&!staffSelectChoices.some(choice=>nameKey(choice.name)===nameKey(String(raw))))staffSelectChoices.push({key:'legacy:'+nameKey(String(raw)),name:String(raw),staffId:null,label:String(raw)+' · nilai tersimpan'})
   const activeStaffChoice=selectedStaffId&&staffCandidates.some(staff=>staff.id===selectedStaffId)
     ? 'staff:'+selectedStaffId
     : staffSelectChoices.find(choice=>nameKey(choice.name)===nameKey(String(raw??'')))?.key??''
   return <label key={field+'-'+i} className="aqField" style={wide?{gridColumn:'1/-1'}:undefined}>
     <span>{field}{kindNow==='computed'?' · otomatis':''}{staffField?' · direktori AUREKA':''}</span>
     {kindNow==='computed'
       ? <div className="aqAuto"><strong title={typeof raw==='number'?String(raw):undefined}>{raw==null||raw===''?'Menunggu data':typeof raw==='number'&&/length of stay|lenght of stay|los/i.test(field)?formattedComputed+' hari':normHeader(field)==='lamanya tindak lanjut'?formattedComputed+' hari':normHeader(field)==='kecepatan respon menit'?formattedComputed+' menit':formattedComputed}</strong></div>
       : staffField
         ? <><select aria-label={field + ' · tenaga penanggung jawab'} disabled={isValidator||(isProviderDayDoctor&&!currentClinic)} value={activeStaffChoice} onChange={(e:any)=>{const choice=staffSelectChoices.find(item=>item.key===e.target.value);if(!choice){setStaffNameValue(field,'');return}if(choice.staffId)setStaffField(field,choice.staffId);else setStaffNameValue(field,choice.name)}}>
             <option value="">{isProviderDayDoctor?'Pilih dokter sesuai klinik…':'Pilih tenaga atau nilai dari workbook…'}</option>
             {staffSelectChoices.map(choice=><option key={choice.key} value={choice.key}>{choice.label}</option>)}
           </select>
           </>
         : kindNow==='textarea'
           ? <textarea aria-label={field} disabled={isValidator} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)} placeholder={'Isi '+field.toLowerCase()+'…'}/>
           : kindNow==='select'&&normHeader(field)==='klinik'
             ? <select aria-label="Klinik" disabled={isValidator} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)}><option value="">Pilih klinik</option>{groups.map(g=><option key={g.clinic} value={g.clinic}>{g.clinic}</option>)}</select>
             : kindNow==='select'&&selectedLayout?.fieldOptions?.[field]
       ? <select aria-label={field} disabled={isValidator} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)}><option value="">Pilih {field.toLowerCase()}…</option>{[...new Set([...(String(raw??'')&&!selectedLayout.fieldOptions[field].includes(String(raw))?[String(raw)]:[]),...selectedLayout.fieldOptions[field]])].map((option:string)=><option key={option} value={option}>{option}</option>)}</select>
       : <input aria-label={field} disabled={isValidator} type={kindNow==='date'?'date':kindNow==='datetime-local'?'datetime-local':kindNow==='time'?'time':kindNow==='number'?'number':'text'} step={kindNow==='number'?'any':undefined} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)} placeholder={'Isi '+field.toLowerCase()+'…'}/>
     }
   </label>
 }

   const editorJson=(x:any)=>JSON.stringify({f:x?.formData??{},i:x?.indicatorValues??{}})
   if(patientOpen&&selected&&editorSnapshot.current?.id!==String(selected.id))editorSnapshot.current={id:String(selected.id),json:editorJson(selected)}
   if(!patientOpen&&editorSnapshot.current)editorSnapshot.current=null
   const editorDirty=()=>!isValidator&&!!selected&&(String(selected.id).startsWith('LOCAL-')||editorSnapshot.current?.json!==editorJson(selected))
   const requestCloseEditor=()=>{if(busy)return;if(editorDirty())setConfirmCloseEditor(true);else setPatientOpen(false)}
   const editorDialogRef=useAccessibleDialog<HTMLDivElement>({open:patientOpen&&!confirmCloseEditor,onClose:requestCloseEditor})
   const closeConfirmDialogRef=useAccessibleDialog<HTMLElement>({open:confirmCloseEditor,onClose:()=>setConfirmCloseEditor(false)})
   const archiveConfirmDialogRef=useAccessibleDialog<HTMLElement>({open:Boolean(pendingArchive),onClose:()=>{if(!busy)setPendingArchive(null)}})
   const unitPickerDialogRef=useAccessibleDialog<HTMLElement>({open:unitPickerOpen,onClose:()=>setUnitPickerOpen(false)})
   const renderPatientEditor=()=>selected&&patientOpen?<section className="glass aqInlineEditor" role="region" aria-label={`Logbook ${recordTitle(selected)}`}><div className="aqDHead"><div><h4>{recordTitle(selected)}</h4><p>{selected.rm? `No. RM ${selected.rm} · `:''}{selected.admit?fmt(selected.admit):'Tanggal pencatatan belum diisi'}{selected.diagnosis? ` · ${selected.diagnosis}`:''}</p></div><button className="aqClose" type="button" data-dialog-autofocus aria-label="Tutup formulir" title="Tutup" onClick={requestCloseEditor}>×</button></div><div className="aqBody">
      {message&&<div className="workspaceFeedback" role={/gagal|belum|tidak dapat|wajib|lengkapi|kolom|tanggal|pilih/i.test(message)?'alert':'status'}><span>{message}</span></div>}
      <div className="aqEpisode">{(selectedLayout?.fields??['Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Length of Stay','Diagnosa Tegak','DPJP']).map(renderLogbookField)}</div>
      <div className="aqDerived"><div><span>Metode pencatatan</span><strong>{grainLabel(String(selected.measurementGrain??dominantGrain(profiles,selectedLayout)))}</strong></div><div><span>Tanggal pencatatan</span><strong>{recordDateFrom(selected.formData??{},selectedLayout,String(selected.admit??''))?fmt(String(recordDateFrom(selected.formData??{},selectedLayout,String(selected.admit??'')) )):'—'}</strong></div><div><span>Indikator terisi</span><strong>{filledN}/{applicable.length} terisi</strong></div></div>
      <section className="aqIndicatorSection" aria-label="Daftar indikator mutu">
        <div className="aqSection"><h5>Penilaian Indikator Mutu</h5><span>{filledN} dari {applicable.length} terisi</span></div>
        {selectedLayout&&!selectedLayout.indicators.length&&<div className="aqNotice">Belum ada indikator yang dikonfigurasikan untuk unit ini.</div>}
        <div className="aqIndicatorList">
          {applicable.map(indicatorEditor)}
          {selectedUnmatchedHeaders.map((header,i)=><article className="aqInd aqUnmatchedInd" key={`unmapped-${selected.roomId}-${i}-${header}`}><div className="aqIHead"><div><strong>{header}</strong></div></div><div className="aqIBody"></div></article>)}
          {!applicable.length&&!selectedUnmatchedHeaders.length&&<div className="aqEmpty">Belum ada indikator hijau pada layout unit ini.</div>}
        </div>
      </section>
    </div><div className="aqFoot"><span style={{fontSize:11,color:'var(--muted)'}}>{isValidator?'Mode baca saja. Gunakan pemeriksaan laporan bulanan untuk mencatat seluruh pemeriksaan.':`${source} · Laporan disimpan sebagai final dan tetap dapat diedit PIC sampai diarsipkan.`}</span><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="aqBtn" disabled={busy} onClick={requestCloseEditor}>{isValidator?'Tutup':'Batal'}</button>{!isValidator&&<><button type="button" className="aqBtn" title="Simpan lalu buka formulir baru (DPJP terbawa)" onClick={()=>void saveAndNew()} disabled={busy}>Simpan &amp; isi berikutnya</button><button type="button" className="aqBtn primary" title="Ctrl+S" onClick={()=>void save()} disabled={busy}>{busy?'Menyimpan…':'Simpan Laporan'}</button></>}</div></div></section>:null

  return <div className="aq aqAuditWorkspace">
   <style dangerouslySetInnerHTML={{__html:CSS}}/>
   {source==='Supabase tidak tersedia'
    ? <AsyncStatePanel state="error" title="Logbook belum dapat dimuat" description={message||'Periksa koneksi dan hak akses, lalu muat ulang data.'} retrying={busy} onRetry={()=>void load()} compact/>
    : message&&!patientOpen&&<div className="workspaceFeedback" role={/^(Gagal|Belum|Data tidak dapat|Catatan belum|Kolom|Tanggal|Pilih|Akun validator)/i.test(message)?'alert':'status'}><span>{message}</span><button type="button" aria-label="Tutup pesan logbook" onClick={()=>setMessage('')}>×</button></div>}
   {showContainerTabs&&<nav className="glass aqTabs">{CONTAINERS.map(x=><button key={x} className={`aqTab ${container===x?'active':''}`} onClick={()=>setContainer(x)}>{x}</button>)}</nav>}
    {isValidator&&<section className="glass" style={{padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><strong style={{fontSize:14}}>Pemeriksaan laporan bulanan</strong>{monthlyReview?.reviewed&&<div className="aqMetaText" style={{marginTop:5}}>{monthlyReview.is_current?'Terakhir diperiksa':'Ada perubahan laporan setelah pemeriksaan'} · {monthlyReview.reviewed_at?fmtDateTime(monthlyReview.reviewed_at):'—'} · {monthlyReview.quality_record_count??0} logbook, {monthlyReview.clinical_pathway_count??0} CP, {monthlyReview.clinical_death_count??0} telaah klinis/kematian</div>}</div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><select aria-label="Bulan pemeriksaan" value={reviewMonth} onChange={(e:any)=>setReviewMonth(Number(e.target.value))} style={{minHeight:40,border:'1px solid var(--line)',borderRadius:10,padding:'8px 10px',background:'#fff'}}>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select><button type="button" className="aqBtn primary" disabled={monthlyReviewBusy||busy||roomId==null} onClick={()=>void confirmMonthlyReview()}>{monthlyReviewBusy?'Menyimpan…':monthlyReview?.is_current?'Sudah Diperiksa · Perbarui':'Sudah Diperiksa'}</button></div></section>}
   {container==='Audit Klinis dan Kematian'?<ClinicalDeathAuditWorkspace initialRoomId={initialRoomId} rooms={rooms} isAdmin={isAdmin||canViewAllRooms} isValidator={isValidator} lockRoomScope={lockRoomScope}/>:<>
     <section className="glass aqFilters"><div className="aqGrid"><label className="aqField"><span>Unit</span><select aria-label="Unit" title="Unit" value={roomId??''} disabled={!isAdmin||lockRoomScope||!rooms.length} onChange={(e:any)=>{const next=normalizeRoomIdValue(e.target.value);if(next!=null){setRoomId(next);onRoomChange?.(next)}}}>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="aqField"><span>Tahun</span><select aria-label="Tahun" title="Tahun" value={year} onChange={(e:any)=>setYear(Number(e.target.value))}>{YEARS.map(y=><option key={y}>{y}</option>)}</select></label><label className="aqField aqMonthSelect"><span>Bulan Pengamatan</span><select aria-label="Bulan pengamatan" title="Bulan pengamatan" value={monthFilter} onChange={(e:any)=>setMonthFilter(Number(e.target.value))}><option value={0}>Semua bulan</option>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label><div className="aqFilterActions">{!isValidator&&year>=2026&&[1,2,3,4,5,6,7,9,11,12,14,18,19,20,22,23,24,25,26,33].includes(Number(roomId))&&<button type="button" className="aqBtn aqImportButton" disabled={busy||!(Number(roomId)===11?canImportOutpatientWorkbook:canImportWorkbook)||((Number(roomId)===2||Number(roomId)===14||Number(roomId)===18||Number(roomId)===20||Number(roomId)===22||Number(roomId)===23||Number(roomId)===24||Number(roomId)===25||Number(roomId)===26||Number(roomId)===33)&&year!==2026)} onClick={()=>{const id=Number(roomId);if(id===1)openImportDialog('complaint');else if(id===2)openImportDialog('it');else if(id===3)openImportDialog('ambulance');else if(id===4)openImportDialog('ibs');else if(id===5)openImportDialog('pharmacy');else if(id===6)openImportDialog('igd');else if(id===7)openImportDialog('gizi');else if(id===9)openImportDialog('laboratory');else if(id===11)openImportDialog('outpatient');else if(id===12)openImportDialog('rehab');else if(id===14)openImportDialog('icu');else if(id===18)openImportDialog('nicu');else if(id===19)openImportDialog('nifas');else if(id===20)openImportDialog('perinatology');else if(id===22)openImportDialog('pediatric-inpatient');else if(id===23)openImportDialog('surgical-inpatient');else if(id===24)openImportDialog('isolasi-inpatient');else if(id===25)openImportDialog('penyakit-dalam-inpatient');else if(id===26)openImportDialog('saraf-inpatient');else if(id===33)openImportDialog('ponek')}} title={Number(roomId)===2?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Informatika dan Teknologi 2026":"Impor Informatika dan Teknologi tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===18?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx NICU 2026":"Impor NICU tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===19?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Nifas 2026":"Impor Nifas tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===20?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Perinatology & Neonatology":"Impor Perinatologi tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===22?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Rawat Inap Anak 2026":"Impor Rawat Inap Anak tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===23?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Rawat Inap Bedah 2026":"Impor Rawat Inap Bedah tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===24?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Rawat Inap Isolasi 2026":"Impor Rawat Inap Isolasi tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===25?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Rawat Inap Penyakit Dalam 2026":"Impor Penyakit Dalam tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===26?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx Rawat Inap Saraf 2026":"Impor Rawat Inap Saraf tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===33?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx PONEK 2026":"Impor PONEK tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===14?(canImportWorkbook&&year===2026?"Pilih workbook .xlsx ICU/HCU 2026":"Impor ICU tersedia untuk Admin/Komite PMKP pada profil 2026"):Number(roomId)===11?(canImportOutpatientWorkbook?"Pilih workbook .xlsx Instalasi Rawat Jalan":"Akun ini belum memiliki kewenangan impor"):canImportWorkbook?"Pilih workbook .xlsx untuk unit terpilih":"Unggah workbook hanya dapat dijalankan oleh Admin/Komite PMKP."}>↥ Upload worksheet.xlsx</button>}
{(!hidePatientEpisodeEntry||activeGrain!=='patient_episode')&&!isValidator&&roomId===5&&year>=2026?<><button type="button" className="aqBtn aqAddButton" disabled={busy} onClick={()=>newPatient(5,{'Alur layanan':'Rawat Jalan'})}><svg className="workspaceButtonIcon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg> Input Rawat Jalan</button><button type="button" className="aqBtn aqAddButton" disabled={busy} onClick={()=>newPatient(5,{'Alur layanan':'Rawat Inap'})}><svg className="workspaceButtonIcon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg> Input Rawat Inap</button></>:(!hidePatientEpisodeEntry||activeGrain!=='patient_episode')&&!isValidator&&roomId!=null&&<button type="button" className="aqBtn primary aqAddButton" disabled={busy} onClick={()=>newPatient()}><svg className="workspaceButtonIcon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg> Tambah catatan</button>}</div></div></section>
<div className="aqDataBar" aria-label="Statistik catatan logbook">

<div className="aqRegisterSummary"><div><span>{activeGrain==='patient_episode'?'Total episode':activeGrain==='provider_day'?'Catatan dokter/hari':activeGrain==='daily_metric'?'Catatan harian':activeGrain==='event'?'Kejadian':activeGrain==='activity'?'Aktivitas':'Total catatan'}</span><strong>{yearPatients.length}</strong></div>
<div><span>{activeGrain==='patient_episode'&&activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?'Masih dirawat':activeGrain==='provider_day'?'Ada nama dokter':activeGrain==='event'?'Belum dikirim / ditutup':'Dengan data'}</span><strong>{activeGrain==='patient_episode'&&activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?yearPatients.filter(p=>!p.discharge).length:activeGrain==='provider_day'?yearPatients.filter(p=>String(p.formData?.['Dokter']??'').trim()).length:activeGrain==='daily_metric'?yearPatients.filter(p=>Object.values(p.formData??{}).some(v=>v!==''&&v!=null)||(Object.values(p.indicatorValues??{}) as Resp[]).some(filled)).length:activeGrain==='event'?yearPatients.filter(p=>!/(selesai|ditutup|closed|ready for review|validated)/i.test(String(p.status??''))).length:yearPatients.filter(p=>Object.values(p.formData??{}).some(v=>v!==''&&v!=null)).length}</strong></div>
<div><span>Indikator tersedia</span><strong>{patientProfiles.length}</strong></div><div><span>Identitas pasien</span><button type="button" className="aqBtn" style={{marginTop:4}} aria-pressed={showIdentity} onClick={()=>setShowIdentity(v=>!v)}>{showIdentity?'Samarkan':'Tampilkan'}</button></div>
<div><span>Indikator terisi</span><strong>{yearPatients.filter(p=>(Object.values(p.indicatorValues??{}) as Resp[]).some(filled)).length}</strong></div>
<div><span>Ditampilkan</span><strong>{filtered.length}</strong></div></div>
</div>
      <section className={`glass aqTable aqHideStatus ${isValidator?"aqValidatorLogbook":""}`}><WorkspaceTableViewport label="Logbook indikator mutu" className="aqWrap"><table className="aqData"><thead><tr><th>No.</th>{summaryFields.map((field,i)=><th key={field+'-'+i}>{field}</th>)}<th>{Number(roomId)===11?'Pengukuran terisi':'Indikator terisi'}</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{filtered.map((p:any,i:number)=>{const isOutpatient=Number(p.roomId)===11,rowProfiles=layoutProfiles(profiles,getLayout(Number(p.roomId))).filter(x=>Number(x.room_id)===Number(p.roomId)&&!(isOutpatient&&/waktu tunggu rawat jalan/i.test(displayTitle(x)))),total=isOutpatient?1:rowProfiles.length,count=isOutpatient?(String(p.formData?.['Klinik']??'').trim()&&String(p.formData?.['Dokter']??'').trim()&&Number.isFinite(Number(p.formData?.['Waktu Tunggu Rawat Jalan (Menit)']))&&Number(p.formData?.['Waktu Tunggu Rawat Jalan (Menit)'])>=0&&Number(p.formData?.['Waktu Tunggu Rawat Jalan (Menit)'])<=1440?1:0):rowProfiles.filter(x=>responseComplete(x,p.indicatorValues?.[x.code])).length;return <Fragment key={`${p.id}-${p.rm||i}`}><tr tabIndex={0} aria-expanded={patientOpen&&String(selected?.id)===String(p.id)} onClick={()=>{if(patientOpen&&String(selected?.id)===String(p.id)){setPatientOpen(false)}else{openPatient(p)}}} onKeyDown={(e:any)=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();if(patientOpen&&String(selected?.id)===String(p.id)){setPatientOpen(false)}else{openPatient(p)}}}}><td>{i+1}</td>{summaryFields.map((field,j)=>{const raw=String(summaryCellValue(p,field)??'')||'—';return <td key={field+'-'+j}>{showIdentity?raw:maskIdentity(field,raw)}</td>})}<td><span className="aqFilled">{count}/{total}</span></td><td><span className={`aqStatus ${String(p.status).toLowerCase().replaceAll(' ','-')}`}>{statusLabel(p.status)}</span></td><td><div style={{display:'flex',gap:6,alignItems:'center'}}>{isValidator?(['Ready for Review','Reopened'].includes(String(p.status))&&p.source==='database'?<><button className="aqBtn primary" disabled={busy} onClick={(e:any)=>{e.stopPropagation();void reviewRecord(p,'validated')}}>Validasi</button><button className="aqBtn" disabled={busy} onClick={(e:any)=>{e.stopPropagation();void reviewRecord(p,'reopened')}}>Kembalikan</button></>:<span className="aqMetaText">{p.status==='Validated'?'Sudah divalidasi':p.status==='Draft'?'Menunggu kelengkapan':'Tidak ada tindakan'}</span>):((p.source==='local'&&!p.recordId)||(p.source==='database'&&p.recordId&&(isAdmin||canViewAllRooms||String(p.enteredBy??'')===currentUserId)&&!['validated','archived'].includes(String(p.databaseStatus??'').toLowerCase()))?<button type="button" className="aqBtn aqDeleteBtn" disabled={busy} onClick={(e:any)=>{e.preventDefault();e.stopPropagation();setPendingArchive(p)}}>Hapus</button>:<span className="aqMetaText">—</span>)}</div></td></tr></Fragment>})}{!filtered.length&&<tr><td colSpan={summaryFields.length+4}><div className="aqEmpty">{busy?'Memuat data logbook…':'Belum ada catatan pada periode ini.'}</div></td></tr>}</tbody></table></WorkspaceTableViewport>
<div className="aqTableFooter"><span><span>{filtered.length} dari {yearPatients.length} catatan pada filter aktif</span></span><button type="button" className="aqBtn" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'↻ Muat ulang data'}</button></div>
</section></>}

   {patientOpen&&selected&&typeof document!=='undefined'&&createPortal(<div className="aq aqPortal aqAuditWorkspace"><div className="aqBack aqEditorBack" role="presentation"><div ref={editorDialogRef} className="aqEditorDialog" role="dialog" aria-modal="true" aria-label={`Formulir logbook ${recordTitle(selected)}`} tabIndex={-1}>{renderPatientEditor()}</div>
    {confirmCloseEditor&&<div className="aqBack aqDeleteConfirmBack" role="presentation"><section ref={closeConfirmDialogRef} className="aqDeleteConfirm" role="alertdialog" aria-modal="true" aria-labelledby="aqCloseConfirmTitle" tabIndex={-1}><div className="aqDeleteConfirmHeader"><span className="aqDeleteConfirmIcon">!</span></div><h4 id="aqCloseConfirmTitle">Tutup tanpa menyimpan?</h4><p>Isian pada formulir ini belum disimpan. Jika ditutup sekarang, perubahan akan hilang.</p><div className="aqDeleteConfirmActions"><button type="button" className="aqBtn" data-dialog-autofocus onClick={()=>setConfirmCloseEditor(false)}>Lanjut mengisi</button><button type="button" className="aqBtn danger" onClick={()=>{setConfirmCloseEditor(false);setPatientOpen(false)}}>Tutup tanpa simpan</button></div></section></div>}
   </div></div>,document.body)}
   {loadedImportDialogs.has('it')&&<ItExcelImportDialog open={itImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setItImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('complaint')&&<ComplaintExcelImportDialog open={complaintImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setComplaintImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('ambulance')&&<AmbulanceExcelImportDialog open={ambulanceImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setAmbulanceImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('ibs')&&<IbsExcelImportDialog open={ibsImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setIbsImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('pharmacy')&&<PharmacyExcelImportDialog open={pharmacyImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setPharmacyImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('gizi')&&<GiziExcelImportDialog open={giziImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setGiziImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('laboratory')&&<LaboratoryExcelImportDialog open={laboratoryImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setLaboratoryImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('igd')&&<IgdExcelImportDialog open={igdImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setIgdImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('outpatient')&&<OutpatientExcelImportDialog open={outpatientImportOpen} roomId={roomId} year={year} authorized={canImportOutpatientWorkbook} layout={getLayout(11)} onClose={()=>setOutpatientImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('rehab')&&<RehabMedikExcelImportDialog open={rehabImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setRehabImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('icu')&&<IcuExcelImportDialog open={icuImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setIcuImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('perinatology')&&<PerinatologyExcelImportDialog open={perinatologyImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setPerinatologyImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('nicu')&&<NicuExcelImportDialog open={nicuImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setNicuImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('nifas')&&<NifasExcelImportDialog open={nifasImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setNifasImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('ponek')&&<PonekExcelImportDialog open={ponekImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setPonekImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('pediatric-inpatient')&&<PediatricInpatientExcelImportDialog open={pediatricInpatientImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setPediatricInpatientImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('surgical-inpatient')&&<SurgicalInpatientExcelImportDialog open={surgicalInpatientImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setSurgicalInpatientImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('isolasi-inpatient')&&<IsolasiInpatientExcelImportDialog open={isolasiInpatientImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setIsolasiInpatientImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('saraf-inpatient')&&<SarafInpatientExcelImportDialog open={sarafInpatientImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setSarafInpatientImportOpen(false)} onImported={async()=>{await load()}}/>}
   {loadedImportDialogs.has('penyakit-dalam-inpatient')&&<PenyakitDalamInpatientExcelImportDialog open={penyakitDalamInpatientImportOpen} roomId={roomId} year={year} authorized={canImportWorkbook} profiles={profiles} onClose={()=>setPenyakitDalamInpatientImportOpen(false)} onImported={async()=>{await load()}}/>}

   {Number(roomId)===6&&year===2026&&<IgdConsultationAuditPanel roomId={roomId} year={year}/>}

   {pendingArchive&&<div className="aqBack aqDeleteConfirmBack" role="presentation" onClick={(e:any)=>{if(e.target===e.currentTarget&&!busy)setPendingArchive(null)}}><section ref={archiveConfirmDialogRef} className="aqDeleteConfirm" role="alertdialog" aria-modal="true" aria-labelledby="aqDeleteConfirmTitle" aria-describedby="aqDeleteConfirmText" tabIndex={-1}><div className="aqDeleteConfirmHeader"><span className="aqDeleteConfirmIcon">!</span><button type="button" className="aqDeleteConfirmClose" aria-label="Tutup dialog" disabled={busy} onClick={()=>setPendingArchive(null)}>×</button></div><h4 id="aqDeleteConfirmTitle">{pendingArchive.source==='local'&&!pendingArchive.recordId?'Buang draf catatan?':'Hapus catatan dari logbook aktif?'}</h4><p id="aqDeleteConfirmText">{pendingArchive.source==='local'&&!pendingArchive.recordId?'Draf ini belum tersimpan ke server dan akan dibuang dari sesi ini.':'Catatan akan diarsipkan dan hilang dari daftar aktif. Jejak audit tetap dipertahankan.'}</p><div className="aqDeleteConfirmActions"><button type="button" className="aqBtn" data-dialog-autofocus disabled={busy} onClick={()=>setPendingArchive(null)}>Batal</button><button type="button" className="aqBtn danger" disabled={busy} onClick={()=>void archivePatient(pendingArchive)}>{busy?'Memproses…':pendingArchive.source==='local'&&!pendingArchive.recordId?'Buang draf':'Ya, hapus'}</button></div></section></div>}

   {unitPickerOpen&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget)setUnitPickerOpen(false)}}><section ref={unitPickerDialogRef} className="aqDrawer aqUnitPicker" role="dialog" aria-modal="true" aria-label="Pilih unit untuk catatan baru" tabIndex={-1}><div className="aqDHead"><div><div className="eyebrow">Logbook mutu</div><h4>Pilih unit kerja</h4><p>Catatan baru harus terikat pada satu unit agar master indikator dan kewenangan tersaring dengan benar.</p></div><button className="aqClose" onClick={()=>setUnitPickerOpen(false)} aria-label="Tutup">×</button></div><div className="aqBody"><label className="aqField"><span>Unit kerja</span><select data-dialog-autofocus value={unitPickerRoomId} onChange={(e:any)=>setUnitPickerRoomId(e.target.value)}><option value="">Pilih unit…</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><div className="aqFoot" style={{margin:'18px -22px -18px'}}><span className="aqMetaText">Pilih unit terlebih dahulu untuk membuka formulir catatan.</span><button className="aqBtn primary" disabled={!unitPickerRoomId||busy} onClick={()=>{const id=Number(unitPickerRoomId);setUnitPickerOpen(false);if(Number.isFinite(id)&&id>0)newPatient(id)}}>Buat catatan</button></div></div></section></div>}

 </div>
}
