// Tanya AUREKA — asisten tanya-jawab berbasis data AUREKA (Gemini, Groq, NVIDIA; opsional DeepSeek/LLM7).
// Kunci API disimpan sebagai secret Supabase (GROQ_API_KEY atau GEMINI_API_KEY), tidak pernah dikirim ke browser.
// Data diambil dengan JWT pengguna sehingga RLS berlaku: AI hanya melihat data yang boleh dilihat pengguna itu.
// Tidak ada data identitas pasien yang dikirim ke AI (ringkasan IKP hanya berupa hitungan).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { planNaraSkills } from "./skills.ts";
import { scopeSnapshotForSkills } from "./skill-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
};
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest";
const FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-latest";
const LIMIT_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = Math.max(5000, Math.min(Number(Deno.env.get("AI_PROVIDER_TIMEOUT_MS")) || 18000, 30000));
const PROVIDER_ROUTE_BUDGET_MS = Math.max(20000, Math.min(Number(Deno.env.get("AI_ROUTE_BUDGET_MS")) || 65000, 90000));
const hits = new Map<string, number[]>();

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function rateLimited(userId: string) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT_PER_WINDOW) { hits.set(userId, list); return true; }
  list.push(now);
  hits.set(userId, list);
  return false;
}

// Ambil semua baris: halaman pertama dulu, sisanya diambil paralel (bukan satu per satu).
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, cap = 5000) {
  const rows: T[] = [];
  try {
    const first = await build(0, 999);
    if (first.error) { console.error("fetchAll", first.error); return { rows, error: true }; }
    rows.push(...(first.data || []));
    if (!first.data || first.data.length < 1000) return { rows, error: false };
    for (let start = 1000; start < cap; start += 4000) {
      const batch = await Promise.all([0, 1, 2, 3].map((k) => start + k * 1000).filter((f) => f < cap).map((f) => build(f, f + 999)));
      let done = false;
      for (const b of batch) {
        if (b.error) { console.error("fetchAll", b.error); return { rows, error: true }; }
        rows.push(...(b.data || []));
        if (!b.data || b.data.length < 1000) done = true;
      }
      if (done) break;
    }
  } catch (e) {
    console.error("fetchAll", e);
    return { rows, error: true };
  }
  return { rows, error: false };
}

// Cache ringkasan data per pengguna 5 menit (per instance fungsi): pertanyaan lanjutan tidak menarik ulang ribuan baris.
const SNAPSHOT_TTL = 5 * 60 * 1000;
const snapshotCache = new Map<string, { at: number; data: unknown }>();
// Model yang tidak tersedia/ditolak dilewati 30 menit agar tidak dicoba ulang setiap pertanyaan.
const deadModels = new Map<string, number>();
const isDead = (k: string) => (deadModels.get(k) || 0) > Date.now();
const markDead = (k: string, minutes = 30) => deadModels.set(k, Date.now() + minutes * 60 * 1000);
async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

const count = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m: Record<string, number> = {};
  for (const r of rows) { const k = (key(r) || "Tidak diisi").toString().trim() || "Tidak diisi"; m[k] = (m[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};
// Suppress small cells to reduce disclosure risk in unit/month/type aggregates.
const safeCount = (values: Record<string, number>, threshold = 5) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v >= threshold ? v : "disembunyikan (<" + threshold + ")"]));
const safeScalar = (value: number, threshold = 5) => value >= threshold ? value : "disembunyikan (<" + threshold + ")";
const top = (o: Record<string, number>, n: number) => Object.fromEntries(Object.entries(o).slice(0, n));

type Risk = { risk_code: string; unit_name: string | null; risk_event: string | null; risk_level: string; risk_score: number | null; likelihood: number | null; impact: number | null; status: string | null; due_date: string | null };
type Plan = { status: string | null; target_date: string | null };
type Incident = Record<string, unknown>;
type Room = { id: number; name: string; is_active: boolean | null };
type FmeaRow = { unit_name: string | null; priority: string | null; status: string | null; rpn: number | null };
type StaffRow = { profession_group: string | null; directory_status: string | null; source_unit: string | null };
type ClinicalStatusRow = { status: string | null; audit_type?: string | null; overall_care_score?: number | null; avoidability_score?: number | null; template_code?: string | null };
type IgdMetricRow = { source_performance_label: string | null; calculated_elapsed_minutes: number | null; profile_year: number };
type IndicatorProfileRow = { profile_year: number; code: string; unit_name: string | null; title: string; category: string | null; target_text: string | null; measurement_grain: string | null; status: string | null; is_active: boolean | null };
type InvestigationRow = { status: string | null; created_at: string };
type CultureRow = { survey_period: string | null; unit_name: string | null; profession_group: string | null; answered_item_count: number | null };
type OppeRow = { evaluation_type: string | null; status: string | null; profession_snapshot: string | null; unit_snapshot: string | null; period_start: string | null; period_end: string | null };
type RecommendationRow = { source: string | null; priority: string | null; program_year: number | null; status: string | null; issued_by_level: string | null };
type ActionRow = { responsible_level: string | null; assigned_room_id: number | null; due_date: string | null; status: string | null; improvement_method: string | null };
type PriorityRow = { program_year: number; priority: string | null; status: string | null; owner_room_id: number | null; due_date: string | null };

const LEVELS = ["Sangat Tinggi", "Tinggi", "Sedang", "Rendah"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const ROMAWI = ["I", "II", "III", "IV"];

// Menu AUREKA yang benar-benar ada — AI hanya boleh merujuk menu ini.
const MENU_AUREKA = [
  "Halaman Utama → Welcome Page / Infografis / Capaian Unit (Ikhtisar, Indikator Mutu, Keselamatan Pasien, Manajemen Risiko)",
  "Register Pasien → Tambah Pasien / Rekapan Pasien",
  "Mutu Klinis → Audit Indikator Mutu (Form Logbook, Hasil Capaian) · Clinical Pathway (Form Logbook, Hasil Capaian) · Audit Klinis & Kematian (Form Logbook, Hasil Capaian)",
  "Keselamatan Pasien → Ringkasan · Laporan IKP · Investigasi/RCA · Survei Budaya Keselamatan · Respons Survei",
  "Manajemen Risiko → Ikhtisar Risiko · Register Risiko · Rencana Tindak · Konektor Risiko · FMEA",
  "Metadata → profil indikator, program, direktori tenaga",
  "Administrasi → pengaturan akun, pengguna, unit",
];

type QCount = { room_id: number; month: number | null; total: number };
/** Jumlah logbook per unit per bulan: fungsi database bila ada, selain itu baca keyset (id > terakhir) — tidak terpotong. */
async function qualityCounts(db: SupabaseClient, year: number): Promise<{ rows: QCount[]; error: boolean }> {
  const rpc = await db.rpc("aureka_quality_room_month_counts", { p_year: year, p_grain: null });
  if (!rpc.error && Array.isArray(rpc.data)) {
    const m = new Map<string, QCount>();
    for (const r of rpc.data as { room_id: number; month: number | null; total: number }[]) {
      const k = r.room_id + "|" + r.month;
      const hit = m.get(k);
      if (hit) hit.total += Number(r.total); else m.set(k, { room_id: Number(r.room_id), month: r.month, total: Number(r.total) });
    }
    return { rows: [...m.values()], error: false };
  }
  const m = new Map<string, QCount>();
  let last: string | null = null;
  for (let page = 0; page < 60; page++) {
    let q = db.schema("aureka_quality").from("quality_records").select("id,room_id,record_date,period_start")
      .eq("profile_year", year).is("archived_at", null).neq("status", "archived").order("id", { ascending: true }).limit(1000);
    if (last) q = q.gt("id", last);
    const { data, error } = await q;
    if (error || !data) return { rows: [...m.values()], error: true };
    for (const r of data as { id: string; room_id: number; record_date: string | null; period_start: string | null }[]) {
      const d = r.record_date || r.period_start || "";
      const month = d.slice(0, 4) === String(year) ? Number(d.slice(5, 7)) : null;
      const k = r.room_id + "|" + month;
      const hit = m.get(k);
      if (hit) hit.total++; else m.set(k, { room_id: Number(r.room_id), month, total: 1 });
    }
    if (data.length < 1000) break;
    last = data[data.length - 1].id;
  }
  return { rows: [...m.values()], error: false };
}

async function snapshot(db: SupabaseClient, domains: readonly string[]) {
  const selectedDomains = new Set(domains);
  const needs = (...names: string[]) => names.some((name) => selectedDomains.has(name));
  const emptyRows = <T,>() => ({ rows: [] as T[], error: false });
  const noRpc = { data: null, error: null };
  const now = new Date(Date.now() + 7 * 3600 * 1000); // WIB/WIB-Pontianak
  const today = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  const monthNow = now.getUTCMonth(); // 0-11
  const quarterNow = Math.floor(monthNow / 3); // 0-3
  const [risks, plans, incidents, quality, roomsRes, governance, fmea, staff, pathwayAudits, deathAudits, igdMetrics, clinical, indicatorProfiles, investigations, culture, oppe, recommendations, actions, priorities] = await Promise.all([
    needs("risk") ? fetchAll<Risk>((f, t) => db.schema("aureka_risk").from("risk_register").select("risk_code,unit_name,risk_event,risk_level,risk_score,likelihood,impact,status,due_date").order("risk_score", { ascending: false }).order("id", { ascending: true }).range(f, t)) : emptyRows<Risk>(),
    needs("risk", "governance") ? fetchAll<Plan>((f, t) => db.schema("aureka_risk").from("mitigation_plans").select("status,target_date").order("id", { ascending: true }).range(f, t)) : emptyRows<Plan>(),
    needs("patient_safety") ? fetchAll<Incident>((f, t) => db.schema("aureka_patient_safety").from("incidents").select("incident_type,status,created_at").order("created_at", { ascending: false }).range(f, t), 3000) : emptyRows<Incident>(),
    needs("quality") ? qualityCounts(db, year) : emptyRows<QCount>(),
    domains.length
      ? db.from("master_rooms").select("id,name,is_active").order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as Room[], error: null }),
    needs("governance")
      ? db.rpc("aureka_gov_infographics_summary_secure", { p_year: year, p_room: null })
      : Promise.resolve(noRpc),
    needs("risk") ? fetchAll<FmeaRow>((f, t) => db.schema("aureka_risk").from("fmea_analyses").select("unit_name,priority,status,rpn").order("rpn", { ascending: false }).range(f, t)) : emptyRows<FmeaRow>(),
    needs("workforce") ? fetchAll<StaffRow>((f, t) => db.schema("aureka_quality").from("staff_directory").select("profession_group,directory_status,source_unit").order("id", { ascending: true }).range(f, t)) : emptyRows<StaffRow>(),
    needs("clinical", "quality") ? fetchAll<ClinicalStatusRow>((f, t) => db.schema("aureka_quality").from("clinical_pathway_audits").select("status,template_code").order("created_at", { ascending: false }).range(f, t)) : emptyRows<ClinicalStatusRow>(),
    needs("clinical", "quality") ? fetchAll<ClinicalStatusRow>((f, t) => db.schema("aureka_quality").from("clinical_death_audits").select("status,audit_type,overall_care_score,avoidability_score").order("created_at", { ascending: false }).range(f, t)) : emptyRows<ClinicalStatusRow>(),
    needs("clinical", "quality") ? fetchAll<IgdMetricRow>((f, t) => db.schema("aureka_quality").from("igd_consultation_audits").select("source_performance_label,calculated_elapsed_minutes,profile_year").eq("profile_year", year).order("created_at", { ascending: false }).range(f, t)) : emptyRows<IgdMetricRow>(),
    needs("clinical")
      ? db.rpc("aureka_nara_clinical_summary", { p_year: year, p_room: null, p_limit: 10 })
      : Promise.resolve(noRpc),
    needs("quality") ? fetchAll<IndicatorProfileRow>((f, t) => db.schema("aureka_quality").from("indicator_profiles").select("profile_year,code,unit_name,title,category,target_text,measurement_grain,status,is_active").eq("profile_year", year).order("code", { ascending: true }).range(f, t)) : emptyRows<IndicatorProfileRow>(),
    needs("patient_safety") ? fetchAll<InvestigationRow>((f, t) => db.schema("aureka_patient_safety").from("investigations").select("status,created_at").order("created_at", { ascending: false }).range(f, t)) : emptyRows<InvestigationRow>(),
    needs("patient_safety") ? fetchAll<CultureRow>((f, t) => db.schema("aureka_patient_safety").from("culture_responses").select("survey_period,unit_name,profession_group,answered_item_count").order("response_id", { ascending: true }).range(f, t)) : emptyRows<CultureRow>(),
    needs("workforce") ? fetchAll<OppeRow>((f, t) => db.schema("aureka_quality").from("oppe_fppe_evaluations").select("evaluation_type,status,profession_snapshot,unit_snapshot,period_start,period_end").order("id", { ascending: true }).range(f, t)) : emptyRows<OppeRow>(),
    needs("governance") ? fetchAll<RecommendationRow>((f, t) => db.schema("aureka_governance").from("recommendations").select("source,priority,program_year,status,issued_by_level").eq("program_year", year).order("id", { ascending: true }).range(f, t)) : emptyRows<RecommendationRow>(),
    needs("governance") ? fetchAll<ActionRow>((f, t) => db.schema("aureka_governance").from("actions").select("responsible_level,assigned_room_id,due_date,status,improvement_method").order("id", { ascending: true }).range(f, t)) : emptyRows<ActionRow>(),
    needs("governance") ? fetchAll<PriorityRow>((f, t) => db.schema("aureka_governance").from("annual_priority_areas").select("program_year,priority,status,owner_room_id,due_date").eq("program_year", year).order("id", { ascending: true }).range(f, t)) : emptyRows<PriorityRow>(),
  ]);
  const rooms = ((roomsRes.data || []) as Room[]).filter((r) => r.is_active !== false);
  const open = (r: Risk) => r.status !== "Controlled" && r.status !== "Accepted";

  // --- Manajemen risiko: jumlah per unit per level (semua unit, bukan sampel)
  const perUnit: Record<string, Record<string, number>> = {};
  for (const r of risks.rows) {
    const u = (r.unit_name || "Tanpa unit").trim();
    const row = perUnit[u] || (perUnit[u] = { "Sangat Tinggi": 0, "Tinggi": 0, "Sedang": 0, "Rendah": 0, total: 0 });
    if (r.risk_level in row) row[r.risk_level]++;
    row.total++;
  }
  const riskMatrixCounts = new Map<string, number>();
  let riskLikelihoodDefaultCount = 0;
  let riskImpactDefaultCount = 0;
  let riskMatrixInvalidCount = 0;
  for (const risk of risks.rows) {
    const likelihood = Number(risk.likelihood);
    const impact = Number(risk.impact);
    if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5 || !Number.isInteger(impact) || impact < 1 || impact > 5) {
      riskMatrixInvalidCount++;
      continue;
    }
    if (likelihood === 3) riskLikelihoodDefaultCount++;
    if (impact === 3) riskImpactDefaultCount++;
    const key = likelihood + "|" + impact;
    riskMatrixCounts.set(key, (riskMatrixCounts.get(key) || 0) + 1);
  }
  const riskMatrix = Array.from({ length: 5 }, (_, i) => i + 1).flatMap((likelihood) =>
    Array.from({ length: 5 }, (_, j) => j + 1).map((impact) => {
      const count = riskMatrixCounts.get(likelihood + "|" + impact) || 0;
      return { likelihood, impact, count: count > 0 && count < 5 ? "disembunyikan (<5)" : count };
    })
  );
  const risikoPerUnit = Object.entries(perUnit)
    .sort((a, b) => b[1]["Sangat Tinggi"] - a[1]["Sangat Tinggi"] || b[1]["Tinggi"] - a[1]["Tinggi"] || b[1].total - a[1].total)
    .map(([unit, c]) => ({ unit, sangat_tinggi: safeScalar(c["Sangat Tinggi"]), tinggi: safeScalar(c["Tinggi"]), sedang: safeScalar(c["Sedang"]), rendah: safeScalar(c["Rendah"]), total: c.total }));

  // --- Mutu klinis: entri logbook per unit per bulan tahun berjalan
  const perRoom = new Map<number, number[]>();
  for (const q of quality.rows) {
    if (q.room_id == null || q.month == null || q.month < 1 || q.month > 12) continue;
    const arr = perRoom.get(q.room_id) || new Array(12).fill(0);
    arr[q.month - 1] += q.total;
    perRoom.set(q.room_id, arr);
  }
  const logbookPerUnit = rooms.map((r) => {
    const arr = perRoom.get(r.id) || new Array(12).fill(0);
    const tri = [0, 1, 2, 3].map((k) => arr.slice(k * 3, k * 3 + 3).reduce((a, b) => a + b, 0));
    return {
      unit: r.name,
      total_entri: arr.reduce((a, b) => a + b, 0),
      per_triwulan: Object.fromEntries(ROMAWI.slice(0, quarterNow + 1).map((q, k) => ["TW " + q, safeScalar(tri[k])])),
      bulan_tanpa_entri: BULAN.slice(0, monthNow + 1).filter((_, k) => !arr[k]),
    };
  });
  // Determine zero-submission units from raw internal counts before n<5 suppression.
  // Never infer operational presence from the masked strings sent to the model.
  const belumInputPerTriwulan = Object.fromEntries(ROMAWI.slice(0, quarterNow + 1).map((q, k) => [
    "Triwulan " + q,
    rooms.filter((room) => {
      const raw = perRoom.get(room.id) || new Array(12).fill(0);
      return raw.slice(k * 3, k * 3 + 3).reduce((a, b) => a + b, 0) === 0;
    }).map((room) => room.name),
  ]));

  // --- Keselamatan pasien (hanya hitungan, tanpa identitas/kronologi)
  const incType = (i: Incident) => String(i.incident_type ?? i.type ?? "").trim() || "Tidak diisi";

  return {
    tanggal_hari_ini: today,
    triwulan_berjalan: "Triwulan " + ROMAWI[quarterNow] + " " + year,
    catatan_sumber: [
      risks.error && "register risiko tidak dapat dibaca",
      plans.error && "rencana tindak tidak dapat dibaca",
      incidents.error && "laporan IKP tidak dapat dibaca",
      quality.error && "logbook mutu tidak dapat dibaca lengkap",
      roomsRes.error && "daftar unit tidak dapat dibaca",
      fmea.error && "analisis FMEA tidak dapat dibaca",
      staff.error && "direktori tenaga tidak dapat dibaca",
      pathwayAudits.error && "audit clinical pathway tidak dapat dibaca",
      deathAudits.error && "audit kematian klinis tidak dapat dibaca",
      igdMetrics.error && "analitik waktu konsultasi IGD tidak dapat dibaca",
      clinical.error && "analitik diagnosis klinis tidak dapat dibaca",
      indicatorProfiles.error && "profil indikator mutu tidak dapat dibaca",
      investigations.error && "status investigasi IKP tidak dapat dibaca",
      culture.error && "agregat survei budaya keselamatan tidak dapat dibaca",
      oppe.error && "agregat OPPE/FPPE tidak dapat dibaca",
      recommendations.error && "rekomendasi tata kelola tidak dapat dibaca",
      actions.error && "tindak lanjut tata kelola tidak dapat dibaca",
      priorities.error && "prioritas tahunan tidak dapat dibaca",
    ].filter(Boolean),
    daftar_unit_aktif: rooms.map((r) => r.name),
    ikhtisar_governance_aureka: governance.error ? null : governance.data,
    analisis_diagnosis_klinis: clinical.error ? null : clinical.data,
    profil_indikator_mutu: {
      tahun: year,
      total_profil: indicatorProfiles.rows.length,
      total_profil_aktif: indicatorProfiles.rows.filter((r) => r.is_active === true && r.status !== "archived").length,
      per_kategori: count(indicatorProfiles.rows, (r) => r.category),
      definisi_indikator: indicatorProfiles.rows.slice(0, 250).map((r) => ({
        kode: r.code, judul: r.title, unit: r.unit_name, kategori: r.category,
        target: r.target_text, grain: r.measurement_grain, status: r.status, aktif: r.is_active,
      })),
      catatan: "Metadata profil indikator saja; ini bukan data episode atau nilai capaian.",
    },
    analisis_fmea: {
      total: safeScalar(fmea.rows.length),
      per_prioritas: safeCount(count(fmea.rows, (r) => r.priority)),
      per_status: safeCount(count(fmea.rows, (r) => r.status)),
      unit_dengan_fmea: safeCount(count(fmea.rows, (r) => r.unit_name)),
      rerata_rpn: fmea.rows.length >= 5
        ? Math.round(fmea.rows.reduce((sum, r) => sum + Number(r.rpn || 0), 0) / fmea.rows.length)
        : "disembunyikan (<5)",
      catatan_disclosure: "Nama pemilik risiko, uraian kegagalan, penyebab, dan teks rencana aksi tidak dikirim ke model; hanya agregat.",
    },
    sumber_daya_manusia_agregat: {
      total_tenaga: safeScalar(staff.rows.length),
      per_profesi: safeCount(count(staff.rows, (r) => r.profession_group)),
      per_status_direktori: safeCount(count(staff.rows, (r) => r.directory_status)),
      per_unit_sumber: safeCount(count(staff.rows, (r) => r.source_unit)),
      catatan_disclosure: "Nama tenaga, NIP/kode pegawai, dan data kontak tidak dikirim ke model.",
    },
    audit_klinis: {
      total_clinical_pathway: safeScalar(pathwayAudits.rows.length),
      clinical_pathway_per_status: safeCount(count(pathwayAudits.rows, (r) => r.status)),
      total_audit_kematian: safeScalar(deathAudits.rows.length),
      audit_kematian_per_status: safeCount(count(deathAudits.rows, (r) => r.status)),
      audit_kematian_per_tipe: safeCount(count(deathAudits.rows, (r) => r.audit_type)),
      rerata_skor_perawatan: deathAudits.rows.length >= 5
        ? Math.round(deathAudits.rows.reduce((sum, r) => sum + Number(r.overall_care_score || 0), 0) / deathAudits.rows.length * 10) / 10
        : "disembunyikan (<5)",
      rerata_skor_avoidability: deathAudits.rows.length >= 5
        ? Math.round(deathAudits.rows.reduce((sum, r) => sum + Number(r.avoidability_score || 0), 0) / deathAudits.rows.length * 10) / 10
        : "disembunyikan (<5)",
    },
    response_time_konsul_igd: {
      tahun: year,
      total: safeScalar(igdMetrics.rows.length),
      per_label_kinerja: safeCount(count(igdMetrics.rows, (r) => r.source_performance_label)),
      rerata_menit: igdMetrics.rows.length >= 5
        ? Math.round(igdMetrics.rows.reduce((sum, r) => sum + Number(r.calculated_elapsed_minutes || 0), 0) / igdMetrics.rows.length * 10) / 10
        : "disembunyikan (<5)",
      memenuhi_60_menit: safeScalar(igdMetrics.rows.filter((r) => Number(r.calculated_elapsed_minutes) <= 60).length),
    },
    manajemen_risiko: {
      total_risiko: safeScalar(risks.rows.length),
      per_level: safeCount(Object.fromEntries(LEVELS.map((l) => [l, risks.rows.filter((r) => r.risk_level === l).length]))),
      matriks_likelihood_dampak: riskMatrix,
      kualitas_data_matriks: {
        total_register: risks.rows.length,
        nilai_likelihood_default_3: riskLikelihoodDefaultCount,
        nilai_impact_default_3: riskImpactDefaultCount,
        baris_dengan_nilai_di_luar_skala: riskMatrixInvalidCount,
        catatan: "Kolom likelihood dan impact memiliki default database 3. Frekuensi nilai 3 tidak membuktikan bahwa nilainya otomatis; nilai perlu diverifikasi terhadap sumber impor/penilaian. Sel dengan jumlah 1-4 disembunyikan untuk mencegah pengungkapan kelompok kecil."
      },
      per_status: safeCount(count(risks.rows, (r) => r.status)),
      risiko_tinggi_dan_sangat_tinggi_tanpa_tenggat: safeScalar(risks.rows.filter((r) => (r.risk_level === "Tinggi" || r.risk_level === "Sangat Tinggi") && !r.due_date && open(r)).length),
      risiko_lewat_tenggat: safeScalar(risks.rows.filter((r) => r.due_date && r.due_date < today && open(r)).length),
      jumlah_per_unit_per_level: risikoPerUnit.filter((r) => r.total >= 5),
      catatan_disclosure: "Rincian peristiwa risiko dan kode register tidak dikirim ke model; unit dengan sel kecil disembunyikan.",
    },
    rencana_tindak: {
      total: safeScalar(plans.rows.length),
      per_status: safeCount(count(plans.rows, (p) => p.status)),
      lewat_target: safeScalar(plans.rows.filter((p) => p.target_date && p.target_date < today && !/selesai|done|completed|closed/i.test(p.status || "")).length),
    },
    mutu_klinis_logbook: {
      tahun: year,
      arti: "Entri Form Logbook Mutu Klinis (semua program) per unit berdasarkan tanggal layanan/periode. Unit dianggap 'belum input/lapor' pada suatu triwulan bila tidak ada entri sama sekali di triwulan itu.",
      total_entri: quality.rows.reduce((a, b) => a + b.total, 0),
      unit_belum_input_per_triwulan: belumInputPerTriwulan,
      per_unit: logbookPerUnit.filter((u) => u.total_entri >= 5),
      unit_tanpa_entri_sama_sekali: logbookPerUnit.filter((u) => u.total_entri === 0).map((u) => u.unit),
    },
    keselamatan_pasien: {
      total_laporan_ikp: incidents.rows.length >= 5 ? incidents.rows.length : "disembunyikan (<5)",
      per_jenis: safeCount(count(incidents.rows, incType)),
      per_status: safeCount(count(incidents.rows, (r) => String(r.status || ""))),
      total_investigasi: safeScalar(investigations.rows.length),
      investigasi_per_status: safeCount(count(investigations.rows, (r) => r.status)),
      survei_budaya: {
        total_respons: safeScalar(culture.rows.length),
        per_periode: safeCount(count(culture.rows, (r) => r.survey_period)),
        per_profesi: safeCount(count(culture.rows, (r) => r.profession_group)),
        rerata_item_terjawab: culture.rows.length >= 5
          ? Math.round(culture.rows.reduce((sum, r) => sum + Number(r.answered_item_count || 0), 0) / culture.rows.length * 10) / 10
          : "disembunyikan (<5)",
      },
      catatan_disclosure: "Identitas, uraian insiden, jawaban responden, dan kronologi tidak dikirim ke model. Hanya agregat; sel kecil disembunyikan.",
    },
    evaluasi_profesional: {
      total_oppe_fppe: safeScalar(oppe.rows.length),
      per_jenis: safeCount(count(oppe.rows, (r) => r.evaluation_type)),
      per_status: safeCount(count(oppe.rows, (r) => r.status)),
      per_profesi: safeCount(count(oppe.rows, (r) => r.profession_snapshot)),
      per_unit: safeCount(count(oppe.rows, (r) => r.unit_snapshot)),
      catatan_disclosure: "Nama, kode pegawai, isi evaluasi, dan catatan penilai tidak dikirim ke model.",
    },
    tata_kelola_dan_prioritas: {
      rekomendasi_tahun_ini: {
        total: safeScalar(recommendations.rows.length),
        per_sumber: safeCount(count(recommendations.rows, (r) => r.source)),
        per_prioritas: safeCount(count(recommendations.rows, (r) => r.priority)),
        per_status: safeCount(count(recommendations.rows, (r) => r.status)),
        per_level_pemberi: safeCount(count(recommendations.rows, (r) => r.issued_by_level)),
      },
      tindak_lanjut: {
        total: safeScalar(actions.rows.length),
        per_level_penanggung_jawab: safeCount(count(actions.rows, (r) => r.responsible_level)),
        per_status: safeCount(count(actions.rows, (r) => r.status)),
        per_metode_perbaikan: safeCount(count(actions.rows, (r) => r.improvement_method)),
        lewat_tenggat: safeScalar(actions.rows.filter((r) => r.due_date && r.due_date < today && !/selesai|done|completed|closed/i.test(r.status || "")).length),
      },
      prioritas_tahunan: {
        total: safeScalar(priorities.rows.length),
        per_prioritas: safeCount(count(priorities.rows, (r) => r.priority)),
        per_status: safeCount(count(priorities.rows, (r) => r.status)),
        lewat_tenggat: safeScalar(priorities.rows.filter((r) => r.due_date && r.due_date < today && !/selesai|done|completed|closed/i.test(r.status || "")).length),
      },
      catatan_disclosure: "Uraian rekomendasi/aksi, nama individu, identitas pelaksana, bukti, dan catatan internal tidak dikirim ke model.",
    },
  };
}

type Turn = { role: string; parts: { text: string }[] };
type AiResult = { answer: string; model: string } | { status: number; error: string };
const BUSY = "Layanan AI sedang sibuk. Coba lagi sebentar lagi.";

function isTopDiseaseQuery(question: string) {
  const q = question.toLocaleLowerCase("id-ID");
  return /\b(penyakit|diagnosis|diagnosa|disease)\b/.test(q)
    && /\b(terbanyak|terbesar|teratas|paling banyak|most common|top\s*10|top ten|10\s*(penyakit|diagnosis|diagnosa|diseases?)|sepuluh)\b/.test(q);
}
function requestedYear(question: string, fallback: number) {
  const match = /\b(20[0-9]{2})\b/.exec(question);
  if (!match) return fallback;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100 ? year : fallback;
}
function formatTopDiseaseAnswer(data: Record<string, unknown>) {
  const rows = Array.isArray(data.top_diagnoses) ? data.top_diagnoses as Record<string, unknown>[] : [];
  const year = Number(data.year) || new Date().getFullYear();
  const source = data.source_basis === "episode_records"
    ? "episode pasien pada Logbook AUREKA"
    : data.source_basis === "patient_index_latest_diagnosis"
      ? "diagnosis terakhir per pasien pada Database Pasien AUREKA"
      : "sumber klinis yang dapat diakses";
  const basis = data.source_basis === "episode_records"
    ? "Unit analisis utama adalah episode Logbook; jumlah pasien unik dihitung terpisah. Hasil ini bukan riwayat seluruh pasien rumah sakit."
    : "Unit analisis adalah pasien unik dengan satu diagnosis terakhir yang tercatat pada indeks pasien. Ini bukan jumlah seluruh kunjungan atau seluruh riwayat diagnosis.";
  const lines = rows.map((row, i) => {
    const diagnosis = String(row.diagnosis || "Diagnosis tidak bernama");
    const patients = Number(row.patient_count) || 0;
    const episodes = row.episode_count == null ? "" : " · " + String(row.episode_count) + " episode";
    const code = row.coding_status === "validated" && row.icd10_code
      ? "ICD-10 " + String(row.icd10_code) + " — tervalidasi"
      : row.coding_status === "proposed" ? "Usulan ICD-10 menunggu verifikasi" : "Belum memiliki kode ICD-10 tervalidasi";
    return (i + 1) + ". **" + diagnosis + "** — " + patients + " pasien" + episodes + " · " + code;
  });
  const total = Number(data.patient_count) || 0;
  const groupCount = Number(data.diagnosis_group_count) || 0;
  const suppressed = Number(data.suppressed_group_count) || 0;
  const header = rows.length
    ? "**10 diagnosis terbanyak — " + year + "**\nSumber utama: " + source + ".\n" + basis
    : total > 0
      ? "Data diagnosis ditemukan pada " + total + " pasien, tetapi tidak ada kelompok diagnosis yang lolos ambang minimal pelaporan."
      : "Belum ada diagnosis klinis yang dapat dianalisis pada periode dan cakupan ini.";
  const episode = data.episode_context && typeof data.episode_context === "object"
    ? data.episode_context as Record<string, unknown>
    : {};
  const indexContext = data.patient_index_context && typeof data.patient_index_context === "object"
    ? data.patient_index_context as Record<string, unknown>
    : {};
  const indexTotal = Number(indexContext.total_patients) || 0;
  const indexDiagnosed = Number(indexContext.diagnosed_patients) || 0;
  const indexMissing = Number(indexContext.missing_diagnosis) || 0;
  const coverage = Number(indexContext.diagnosis_coverage_pct) || 0;
  const completenessLine = indexTotal > 0
    ? "Kelengkapan diagnosis pada Database Pasien: " + indexDiagnosed.toLocaleString("id-ID") + " dari " +
      indexTotal.toLocaleString("id-ID") + " pasien (" + coverage.toFixed(2) + "%) memiliki diagnosis terakhir; " +
      indexMissing.toLocaleString("id-ID") + " baris belum memiliki diagnosis. Baris kosong tidak boleh ditafsirkan sebagai pasien tanpa penyakit."
    : "Tidak ada baris indeks pasien pada periode dan cakupan unit ini.";
  const unitCoverage = Array.isArray(indexContext.by_unit)
    ? (indexContext.by_unit as Record<string, unknown>[]).map((unit) => {
        const name = String(unit.unit || "Unit");
        const diagnosed = Number(unit.diagnosed_count) || 0;
        const total = Number(unit.patient_count) || 0;
        const missing = Number(unit.missing_diagnosis) || 0;
        const pct = Number(unit.coverage_pct) || 0;
        return "- " + name + ": " + diagnosed.toLocaleString("id-ID") + "/" + total.toLocaleString("id-ID") +
          " (" + pct.toFixed(2) + "%), " + missing.toLocaleString("id-ID") + " belum terisi";
      })
    : [];
  const episodeCount = Number(episode.total_episode_records) || 0;
  const episodePatients = Number(episode.unique_patients_with_mrn) || 0;
  const episodeGroups = Number(episode.diagnosis_group_count) || 0;
  const episodeSuppressed = Number(episode.suppressed_group_count) || 0;
  const episodeLine = episodeCount > 0
    ? "Rekap episode Logbook (dilaporkan terpisah, tidak digabung dengan peringkat pasien): " +
      episodeCount + " episode, " + episodePatients + " pasien unik, " +
      (Number(episode.diagnosis_records_analyzable) || 0) + " record diagnosis yang dapat dianalisis, " +
      episodeGroups + " kelompok diagnosis; " + episodeSuppressed + " kelompok berada di bawah ambang minimal."
    : "Belum ada episode Logbook pada periode dan cakupan ini.";
  const groupLine = groupCount > 0
    ? "Kualitas pengelompokan: " + groupCount + " kelompok istilah teridentifikasi; " + suppressed +
      " kelompok disembunyikan karena jumlah pasien per kelompok kurang dari " + String(data.minimum_cell_size || 5) + "."
    : "";
  const limitations = String(data.limitations || "");
  return [
    header, ...lines, "",
    "Cakupan: " + (data.scope || "unit sesuai hak akses akun") + ". Total pasien yang masuk basis peringkat: " + total + ".",
    groupLine,
    completenessLine,
    ...(unitCoverage.length ? ["Rincian kelengkapan per unit:", ...unitCoverage] : []),
    episodeLine,
    "Perlindungan privasi: kelompok dengan jumlah kurang dari " + String(data.minimum_cell_size || 5) + " pasien tidak ditampilkan. Nomor rekam medis dan identitas pasien tidak ditampilkan maupun dikirim ke provider AI.",
    limitations,
    "Catatan koding: kode hanya disebut tervalidasi bila sudah diperiksa reviewer berwenang. Diagnosis mentah, singkatan, dan ejaan yang meragukan tetap perlu telaah PMIK/DPJP sebelum dikunci sebagai ICD-10.",
  ].filter(Boolean).join("\n\n");
}
const QUOTA = "Kuota AI gratis sedang habis. Coba lagi beberapa menit lagi.";

/** Gemini: model utama, lalu model cadangan bila sibuk/kuota habis. */
async function askGemini(apiKey: string, system: string, contents: Turn[], deadline: number, jsonMode = false): Promise<AiResult> {
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: jsonMode ? 0.1 : 0.6,
      maxOutputTokens: jsonMode ? 2200 : 1200,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  });
  let last = 0;
  for (const model of [...new Set([MODEL, FALLBACK_MODEL])]) {
    if (Date.now() >= deadline) break;
    if (isDead("gemini:" + model)) continue;
    let res: Response;
    try {
      res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey }, body: payload,
      }, Math.min(PROVIDER_TIMEOUT_MS, Math.max(1, deadline - Date.now())));
    } catch (e) { console.warn("gemini", model, "timeout", String(e).slice(0, 120)); last = 504; continue; }
    last = res.status;
    if (res.ok) {
      const out = await res.json();
      const answer = (out?.candidates?.[0]?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || "").join("").trim();
      if (answer) return { answer, model };
      continue;
    }
    const errorBody = (await res.text()).slice(0, 300);
    console.warn("gemini", model, "provider status", res.status);
    if (res.status === 404 || (res.status === 400 && /model.*(not found|not supported)/i.test(errorBody))) markDead("gemini:" + model);
    if (res.status === 503) markDead("gemini:" + model, 2);
    if (![400, 404, 429, 500, 503, 504].includes(res.status)) break;
  }
  if (last === 401 || last === 403) return { status: 502, error: "Kunci GEMINI_API_KEY ditolak Google. Periksa atau buat ulang kuncinya." };
  return { status: last === 429 ? 429 : 502, error: last === 429 ? QUOTA : BUSY };
}

/** Penyedia berformat OpenAI (Groq, NVIDIA, DeepSeek, LLM7): coba beberapa model berurutan. */
type OpenAiProvider = { label: string; url: string; models: string[] };
const OPENAI_PROVIDERS: Record<string, OpenAiProvider> = {
  groq: { label: "Groq", url: "https://api.groq.com/openai/v1/chat/completions",
    models: [Deno.env.get("GROQ_MODEL") || "", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"] },
  nvidia: { label: "NVIDIA", url: "https://integrate.api.nvidia.com/v1/chat/completions",
    models: [Deno.env.get("NVIDIA_MODEL") || "", "deepseek-ai/deepseek-v4-flash", "deepseek-ai/deepseek-v4-flash-0731", "meta/llama-3.3-70b-instruct", "openai/gpt-oss-120b"] },
  deepseek: { label: "DeepSeek", url: "https://api.deepseek.com/chat/completions",
    models: [Deno.env.get("DEEPSEEK_MODEL") || "", "deepseek-flash", "deepseek-chat"] },
  llm7: { label: "LLM7", url: "https://api.llm7.io/v1/chat/completions",
    models: [Deno.env.get("LLM7_MODEL") || "", "default", "fast"] },
};

async function askOpenAi(
  p: OpenAiProvider,
  apiKey: string,
  system: string,
  contents: Turn[],
  deadline: number,
  jsonMode = false,
): Promise<AiResult> {
  const messages = [
    { role: "system", content: system },
    ...contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map((x) => x.text).join("\n") })),
  ];
  let last = 0;
  for (const model of [...new Set(p.models.filter(Boolean))].slice(0, 5)) {
    if (Date.now() >= deadline) break;
    const tag = p.label + ":" + model;
    if (isDead(tag)) continue;
    const extra = /gpt-oss/.test(model) ? { reasoning_effort: "low" } : {};
    const makeBody = (useJsonMode: boolean) => JSON.stringify({
      model,
      messages,
      temperature: jsonMode ? 0.1 : 0.6,
      max_tokens: jsonMode ? 2200 : 1200,
      ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
      ...extra,
    });
    let res: Response;
    let errorBody = "";
    try {
      res = await fetchWithTimeout(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: makeBody(jsonMode),
      }, Math.min(PROVIDER_TIMEOUT_MS, Math.max(1, deadline - Date.now())));
    } catch (e) {
      console.warn(p.label, model, "jaringan/timeout", String(e).slice(0, 200));
      last = 504;
      continue;
    }
    if (!res.ok) errorBody = (await res.text()).slice(0, 500);
    if (!res.ok && jsonMode && res.status === 400 &&
      /response_format|json[_ -]?object|json mode|unsupported parameter/i.test(errorBody)) {
      try {
        res = await fetchWithTimeout(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
          body: makeBody(false),
        }, Math.min(PROVIDER_TIMEOUT_MS, Math.max(1, deadline - Date.now())));
        errorBody = res.ok ? "" : (await res.text()).slice(0, 500);
      } catch (e) {
        console.warn(p.label, model, "fallback JSON request timeout", String(e).slice(0, 160));
        last = 504;
        continue;
      }
    }
    last = res.status;
    if (res.ok) {
      const out = await res.json();
      const answer = String(out?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (answer) return { answer, model };
      console.warn(p.label, model, "empty assistant content");
      continue;
    }
    console.warn(p.label, model, "provider status", res.status);
    if (res.status === 401 || res.status === 403) {
      return { status: 502, error: p.label + ": API key ditolak (HTTP " + res.status + "). Periksa secret provider di Supabase." };
    }
    if (res.status === 402) {
      return { status: 503, error: p.label + ": akun provider tidak memiliki kredit/billing aktif (HTTP 402). Provider lain tetap akan dicoba." };
    }
    if (res.status === 410) { markDead(tag); continue; }
    if (res.status === 404 || (res.status === 400 && /model|decommission|not.*(found|exist|support)/i.test(errorBody))) markDead(tag);
    if (![400, 404, 413, 422, 429, 500, 502, 503, 504].includes(res.status)) {
      return { status: 502, error: p.label + ": provider menolak permintaan (HTTP " + res.status + "). Periksa konfigurasi model/provider." };
    }
  }
  if (last === 429) return { status: 429, error: p.label + ": kuota atau rate limit provider tercapai (HTTP 429)." };
  if (last === 410) return { status: 503, error: p.label + ": model yang dikonfigurasi sudah dihentikan (HTTP 410)." };
  return { status: 502, error: p.label + ": tidak ada model yang berhasil memproses permintaan." };
}
type Icd10AiSuggestion = { diagnosis: string; code: string; title: string; confidence: number; rationale: string };

function normalizeIcd10Term(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("id-ID")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function parseIcd10AiSuggestions(answer: string, allowedTerms: Map<string, string>): Icd10AiSuggestion[] {
  const text = answer.replace(/^\x60{3}(?:json)?/i, "").replace(/\x60{3}$/i, "").trim();
  const start = text.search(/[\[{]/);
  if (start < 0) return [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let payload: unknown;
  let parsed = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
    if (depth === 0) {
      try { payload = JSON.parse(text.slice(start, i + 1)); parsed = true; } catch { return []; }
      break;
    }
  }
  if (!parsed || !payload || typeof payload !== "object") return [];
  const container = payload as Record<string, unknown>;
  const nested = container.data && typeof container.data === "object" ? container.data as Record<string, unknown> : null;
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(container.items) ? container.items
    : Array.isArray(container.suggestions) ? container.suggestions
    : Array.isArray(container.results) ? container.results
    : Array.isArray(container.mappings) ? container.mappings
    : Array.isArray(nested?.items) ? nested.items
    : [];
  const seen = new Set<string>();
  return rows.flatMap((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const row = candidate as Record<string, unknown>;
    const sourceTerm = String(row.diagnosis ?? row.term ?? row.input ?? row.source_diagnosis ?? "").trim();
    const normalizedTerm = normalizeIcd10Term(sourceTerm);
    const diagnosis = allowedTerms.get(normalizedTerm);
    const rawCode = String(row.icd10_code ?? row.code ?? row.icd10 ?? "").trim().toUpperCase();
    const codeMatch = rawCode.match(/(?:^|[^A-Z0-9])([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?)(?:$|[^A-Z0-9])/);
    const code = codeMatch?.[1] || "";
    const title = String(row.icd10_title ?? row.title ?? row.description ?? "").trim().slice(0, 180);
    const rawConfidence = row.confidence ?? row.confidence_score;
    const confidenceText = typeof rawConfidence === "string" ? rawConfidence.trim() : "";
    let confidence = Number(rawConfidence);
    if (confidenceText.endsWith("%")) confidence = Number(confidenceText.slice(0, -1));
    if (confidenceText && !Number.isFinite(confidence)) {
      confidence = /^(high|tinggi)$/i.test(confidenceText) ? 0.8
        : /^(medium|moderate|sedang)$/i.test(confidenceText) ? 0.65
        : /^(low|rendah)$/i.test(confidenceText) ? 0.4 : Number.NaN;
    }
    if (confidence > 1 && confidence <= 100) confidence /= 100;
    const rationale = String(row.rationale ?? row.reason ?? row.explanation ?? "").trim().slice(0, 240);
    const key = diagnosis ? normalizeIcd10Term(diagnosis) : normalizedTerm;
    if (!diagnosis || seen.has(key)) return [];
    if (!/^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/.test(code) || !title) return [];
    if (!Number.isFinite(confidence) || confidence < 0.6 || confidence > 1) return [];
    seen.add(key);
    return [{ diagnosis, code, title, confidence, rationale }];
  });
}
function appendRiskDistributionFallback(question: string, answer: string, snapshotData: unknown): string {
  const asksRiskMatrix = /matriks risiko|risk matrix|heatmap risiko|peta panas risiko/i.test(question);
  if (!asksRiskMatrix || answer.includes("[[NARA_VISUAL]]")) return answer;
  if (!snapshotData || typeof snapshotData !== "object") return answer;
  const risk = (snapshotData as Record<string, unknown>).manajemen_risiko;
  if (!risk || typeof risk !== "object") return answer;
  const matrixRows = (risk as Record<string, unknown>).matriks_likelihood_dampak;
  const quality = (risk as Record<string, unknown>).kualitas_data_matriks as Record<string, unknown> | undefined;
  if (Array.isArray(matrixRows) && matrixRows.length === 25) {
    const data = matrixRows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .map((row) => ({ likelihood: Number(row.likelihood), impact: Number(row.impact), count: row.count }));
    if (data.length === 25 && data.every((row) => Number.isInteger(row.likelihood) && row.likelihood >= 1 && row.likelihood <= 5 && Number.isInteger(row.impact) && row.impact >= 1 && row.impact <= 5 && (typeof row.count === "number" && Number.isFinite(row.count) && row.count >= 0 || typeof row.count === "string" && row.count.startsWith("disembunyikan")))) {
      const visual = {
        title: "Matriks Risiko 5×5 — Likelihood × Impact",
        chartType: "risk_matrix",
        data,
        source: "Agregat register risiko AUREKA (aureka_risk.risk_register)",
        period: "Snapshot saat pertanyaan diproses",
        unit: "jumlah register",
        interpretation: "Matriks memakai nilai likelihood dan impact yang tersimpan pada register. Perhatian mutu data: nilai 3 merupakan default pada skema; jumlah likelihood=3: " + String(quality?.nilai_likelihood_default_3 ?? "tidak diketahui") + ", impact=3: " + String(quality?.nilai_impact_default_3 ?? "tidak diketahui") + ". Frekuensi nilai 3 belum membuktikan apakah nilai tersebut hasil penilaian atau nilai default impor. Sel dengan jumlah 1–4 disembunyikan."
      };
      return answer.trim() + "\n\nSaya dapat menampilkan matriks berdasarkan nilai yang saat ini tersimpan. Namun, nilai default perlu diverifikasi sebelum matriks dipakai sebagai dasar keputusan.\n[[NARA_VISUAL]]" + JSON.stringify(visual) + "[[/NARA_VISUAL]]";
    }
  }
  const perLevel = (risk as Record<string, unknown>).per_level;
  if (!perLevel || typeof perLevel !== "object") return answer;
  const values = perLevel as Record<string, unknown>;
  const pieData = LEVELS.map((level) => ({ tingkat_risiko: level, jumlah: values[level] }))
    .filter((row): row is { tingkat_risiko: string; jumlah: number } =>
      typeof row.jumlah === "number" && Number.isFinite(row.jumlah) && row.jumlah >= 0);
  if (pieData.length < 2 || pieData.reduce((sum, row) => sum + row.jumlah, 0) <= 0) return answer;
  const total = pieData.reduce((sum, row) => sum + row.jumlah, 0);
  const visual = { title: "Distribusi Risiko Berdasarkan Tingkat Risiko", chartType: "pie", xKey: "tingkat_risiko", valueKey: "jumlah", data: pieData, source: "Agregat register risiko AUREKA", period: "Snapshot saat pertanyaan diproses", unit: "risiko", interpretation: "Distribusi tingkat risiko ini bukan matriks likelihood × impact." };
  return answer.trim() + "\n\nMatriks 5×5 belum dapat dibentuk dari snapshot ini. Sebagai alternatif, berikut distribusi tingkat risiko.\n[[NARA_VISUAL]]" + JSON.stringify(visual) + "[[/NARA_VISUAL]]";
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  // Banyak penyedia & banyak kunci: tiap secret boleh berisi beberapa kunci dipisah koma/baris baru.
  // Urutan penyedia diatur AI_PROVIDER_ORDER (bawaan: gemini,groq); yang tidak punya kunci dilewati.
  const cleanKey = (raw: string) => {
    const v = raw.trim();
    return (/x-goog-api-key\s*:\s*([A-Za-z0-9._\-]+)/i.exec(v)?.[1] || /authorization\s*:\s*bearer\s+([A-Za-z0-9._\-]+)/i.exec(v)?.[1] || /[?&]key=([A-Za-z0-9._\-]+)/.exec(v)?.[1] || v).replace(/^['"]|['"]$/g, "");
  };
  const keysOf = (name: string) => {
    const raw = Deno.env.get(name) || "";
    // Perintah curl utuh dianggap satu kunci; selain itu pisahkan dengan koma/baris baru.
    const parts = /curl|x-goog-api-key|authorization/i.test(raw) ? [raw] : raw.split(/[\s,;]+/);
    return [...new Set(parts.map(cleanKey).filter((k) => /^[A-Za-z0-9._\-]{20,200}$/.test(k)))];
  };
  const available: Record<string, string[]> = {
    gemini: keysOf("GEMINI_API_KEY"),
    groq: keysOf("GROQ_API_KEY"),
    nvidia: keysOf("NVIDIA_API_KEY"),
    deepseek: keysOf("DEEPSEEK_API_KEY"),
    llm7: [...new Set([...keysOf("LLM7_API_KEY"), ...keysOf("LLM7.IO_API_KEY"), ...keysOf("LLM7_IO_API_KEY")])],
  };
  // Kelima provider otomatis tersedia bila secret API masing-masing terpasang.
  // AI_ENABLE_DEEPSEEK=false atau AI_ENABLE_LLM7=false menjadi kill switch eksplisit.
  const PROVIDER_NAMES = ["groq", "nvidia", "gemini", "deepseek", "llm7"];
  const requestedOrder = (Deno.env.get("AI_PROVIDER_ORDER") || "groq,nvidia,gemini,deepseek,llm7").split(/[\s,]+/).map((x) => x.toLowerCase().replace(/\.io$/, ""));
  // AI_PROVIDER_ORDER mengatur prioritas; provider lain tetap dicoba sebagai fallback bila memenuhi gate.
  const order = [...new Set([...requestedOrder, ...PROVIDER_NAMES])].filter((x) => {
    if (!available[x]?.length) return false;
    if (x === "deepseek" && Deno.env.get("AI_ENABLE_DEEPSEEK") === "false") return false;
    if (x === "llm7" && Deno.env.get("AI_ENABLE_LLM7") === "false") return false;
    return ["groq", "nvidia", "gemini", "deepseek", "llm7"].includes(x);
  });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!order.length || !supabaseUrl || !anonKey) return reply(500, { error: "NARA AI belum dikonfigurasi di server (isi secret GEMINI_API_KEY, GROQ_API_KEY, atau NVIDIA_API_KEY dengan kode kunci saja)." });

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return reply(401, { error: "Sesi tidak ditemukan. Silakan masuk kembali." });
  const db = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: who, error: whoError } = await db.auth.getUser();
  if (whoError || !who.user) return reply(401, { error: "Sesi tidak valid. Silakan masuk kembali." });

  const { data: profile } = await db.schema("aureka_system").from("user_profiles").select("is_active").eq("user_id", who.user.id).maybeSingle();
  if (!profile?.is_active) return reply(403, { error: "Akun belum aktif." });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 32768) return reply(413, { error: "Permintaan terlalu besar." });
  let body: { question?: string; history?: { role?: string; text?: string }[]; page?: string; warmup?: boolean; task?: string; room_id?: number; profile_year?: number; importer_key?: string; headers?: string[] };
  try { body = await req.json(); } catch { return reply(400, { error: "Format permintaan tidak valid." }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "Format permintaan tidak valid." });
  if (rateLimited(who.user.id)) return reply(429, { error: "Batas permintaan tercapai (20 per 10 menit). Coba lagi sebentar lagi." });
  // Pemanasan saat panel dibuka: siapkan ringkasan data di cache, tanpa memanggil AI.
  if (body.warmup) {
    // Domain is not known until the user asks a question; never prefetch every hospital domain.
    return reply(200, { ok: true, snapshot: "loaded-on-demand-by-skill" });
  }
  const task = String(body.task || "").trim().toLowerCase();
  const question = (body.question || "").toString().trim().slice(0, 1500);
  if (!question && task !== "icd10_suggest" && task !== "excel_mapping_suggest") return reply(400, { error: "Pertanyaan kosong." });
  // Fail closed when a user includes likely patient/staff identifiers in a prompt or chat history.
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const outboundText = [question, ...history.map((h) => String(h?.text || ""))].join("\n");
  const sensitivePatterns = [
    /\b\d{16}\b/,                                      // NIK
    /\b(?:no\.?\s*rm|nomor\s*rekam\s*medis|no\.?\s*rekam\s*medis|rm|mrn)\s*[:#-]?\s*[a-z0-9-]{4,}\b/i,
    /\b(?:pasien|petugas|dokter|perawat)\s+(?:bernama|atas\s+nama)\s+\p{L}{2,}/iu,
    /\b(?:nama\s*pasien|identitas\s*pasien|nama\s*petugas|identitas\s*petugas)\s*[:=]/i,
    /\b(?:08|\+62|62)\d{8,13}\b/,                    // phone
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,     // email
    /\b(?:tanggal\s*lahir|tempat\s*tanggal\s*lahir|alamat\s*pasien)\s*[:=]/i,
  ];
  if (sensitivePatterns.some((pattern) => pattern.test(outboundText))) {
    return reply(422, { error: "Permintaan ditahan oleh NARA Privacy Guard. Hapus identitas pasien/petugas, nomor rekam medis, NIK, kontak, dan detail pengenal dari pertanyaan maupun riwayat sebelum mencoba kembali." });
  }

  // AI-assisted Excel mapping: hanya label header workbook dan definisi profil yang dikirim.
  // Tidak ada sel baris data, nama pasien, nomor rekam medis atau diagnosis pasien yang dikirim.
  if (task === "excel_mapping_suggest") {
    const roomId = Number(body.room_id);
    const year = Number(body.profile_year);
    const importerKey = String(body.importer_key || "").trim();
    const importerRoom: Record<string, number> = {
      complaint: 1, it: 2, ambulance: 3, ibs: 4, pharmacy: 5, igd: 6,
      gizi: 7, laboratory: 9, outpatient: 11, "rehab-medik": 12,
      "rekam-medis": 13, icu: 14, nicu: 18, nifas: 19, perinatology: 20,
      pediatric: 22, surgical: 23, isolasi: 24,
      "internal-medicine": 25, saraf: 26, timkordik: 30, ponek: 33,
    };
    const isGenericUnitWorkbook = importerKey === "unit-logbook" && Number.isSafeInteger(roomId) && roomId >= 1 && roomId <= 100;
    if (!Number.isSafeInteger(roomId) || roomId < 1 || !Number.isInteger(year) || year < 2000 || year > 2100 ||
        (!isGenericUnitWorkbook && (!Object.prototype.hasOwnProperty.call(importerRoom, importerKey) || importerRoom[importerKey] !== roomId))) {
      return reply(422, { error: "Unit, tahun, atau jenis workbook tidak valid untuk bantuan pemetaan NARA." });
    }
    const rawHeaders = Array.isArray(body.headers) ? body.headers : [];
    const headers = [...new Map(rawHeaders
      .slice(0, 200)
      .map((value) => String(value || "").trim().slice(0, 160))
      .filter((value) => value.length >= 1 && !/[0-9]{6,}/.test(value))
      .map((value) => [value.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/\s+/g, " ").trim(), value])
    ).values()];
    if (!headers.length) return reply(422, { error: "Tidak ada label header workbook yang dapat dianalisis." });

    const { data: context, error: contextError } = await db.schema("aureka_quality").rpc("quality_excel_mapping_ai_context", {
      p_room_id: roomId,
      p_profile_year: year,
    });
    if (contextError || !context || Number((context as Record<string, unknown>).room_id) !== roomId) {
      console.error("NARA Excel mapping context unavailable", contextError?.code || "unknown");
      return reply(403, { error: "Akses atau profil indikator unit tidak tersedia untuk analisis pemetaan NARA." });
    }
    const rawProfiles = Array.isArray((context as Record<string, unknown>).profiles)
      ? (context as Record<string, unknown>).profiles as Record<string, unknown>[]
      : [];
    const targets = rawProfiles.filter((profile) => {
      const code = String(profile.code || "").trim();
      const title = String(profile.title || "").trim();
      return /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/.test(code) && title.length >= 3 && title.length <= 240;
    }).map((profile) => ({
      indicator_code: String(profile.code),
      indicator_title: String(profile.title).slice(0, 240),
      current_master_header: String(profile.header_label || "").slice(0, 160),
      current_aliases: Array.isArray(profile.header_aliases)
        ? (profile.header_aliases as unknown[]).filter((value) => typeof value === "string").slice(0, 12).map((value) => String(value).slice(0, 160))
        : [],
    }));
    if (!targets.length) return reply(409, { error: "Unit belum memiliki profil indikator aktif yang dapat dipetakan." });

    const allowedHeaders = new Map(headers.map((header) => [
      header.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/\s+/g, " ").trim(),
      header,
    ]));
    const allowedCodes = new Set(targets.map((target) => target.indicator_code));
    const payload = {
      task: "map_workbook_headers_to_hospital_indicators",
      unit_profile: { room_id: roomId, year, importer_key: importerKey },
      available_excel_headers: headers,
      target_indicators: targets,
    };
    const system = [
      "Kamu adalah NARA AI, asisten konfigurasi impor data rumah sakit.",
      "Tugas hanya memetakan LABEL HEADER workbook Excel ke indikator mutu AUREKA. Kamu tidak melihat atau memerlukan isi baris data.",
      "Gunakan arti klinis/operasional label indikator dan header. Jangan memilih berdasarkan kemiripan kata semata jika konteks tidak cukup.",
      "Satu header sumber hanya boleh dipasangkan ke satu indikator, kecuali benar-benar merupakan duplikasi yang dibuktikan; secara default jangan gunakan header yang sama lebih dari sekali.",
      "Jangan mengubah definisi indikator, nilai target, numerator, denominator, kode klasifikasi, atau menyatukan dua indikator.",
      "Jika tidak ada kecocokan yang jelas, kembalikan source_header null dan confidence di bawah 0.6.",
      'Kembalikan JSON saja: {"items":[{"indicator_code":"kode persis dari target","source_header":"header persis dari workbook atau null","confidence":0.0,"rationale":"alasan singkat"}]}.',
      "indicator_code wajib salah satu dari target_indicators. source_header wajib identik dengan salah satu available_excel_headers; jangan membuat header baru.",
      "Seluruh hasil hanya usulan untuk ditinjau manusia, bukan perubahan yang langsung disimpan.",
    ].join("\n");
    const contents: Turn[] = [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }];
    const deadline = Date.now() + PROVIDER_ROUTE_BUDGET_MS;
    let selected: { provider: string; model: string; answer: string } | null = null;
    const diagnostics: string[] = [];
    let lastError = BUSY;
    for (const provider of order) {
      if (Date.now() >= deadline || selected) break;
      for (const key of available[provider] || []) {
        if (Date.now() >= deadline || selected) break;
        const result = provider === "gemini"
          ? await askGemini(key, system, contents, deadline, true)
          : await askOpenAi(OPENAI_PROVIDERS[provider], key, system, contents, deadline, true);
        if ("status" in result) {
          lastError = result.error;
          diagnostics.push(provider + ": " + result.error);
          continue;
        }
        selected = { provider, model: result.model, answer: result.answer };
      }
    }
    if (!selected) {
      return reply(502, {
        error: "NARA belum dapat menghasilkan usulan pemetaan. Tidak ada perubahan konfigurasi yang disimpan.",
        diagnostics: diagnostics.slice(0, 8),
        detail: diagnostics.length ? diagnostics.slice(0, 8).join(" | ") : lastError,
      });
    }

    const text = selected.answer.replace(/^\x60{3}(?:json)?/i, "").replace(/\x60{3}$/i, "").trim();
    let parsed: unknown = null;
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
    } catch { parsed = null; }
    const rawItems = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).items
      : null;
    const usedCodes = new Set<string>();
    const usedHeaders = new Set<string>();
    const suggestions = (Array.isArray(rawItems) ? rawItems : []).flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const row = candidate as Record<string, unknown>;
      const code = String(row.indicator_code || "").trim();
      if (!allowedCodes.has(code) || usedCodes.has(code)) return [];
      const rawHeader = typeof row.source_header === "string" ? row.source_header.trim() : "";
      const normalizedHeader = rawHeader.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/\s+/g, " ").trim();
      const sourceHeader = rawHeader ? allowedHeaders.get(normalizedHeader) || null : null;
      const confidence = Number(row.confidence);
      const rationale = String(row.rationale || "").trim().slice(0, 240);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return [];
      if (sourceHeader && usedHeaders.has(normalizedHeader)) return [];
      usedCodes.add(code);
      if (sourceHeader) usedHeaders.add(normalizedHeader);
      return [{
        indicator_code: code,
        source_header: sourceHeader,
        confidence,
        rationale,
        requires_review: confidence < 0.8 || !sourceHeader,
      }];
    });
    if (!suggestions.length) {
      return reply(502, { error: "Respons NARA tidak mengandung pasangan indikator/header yang valid. Tidak ada perubahan yang disimpan.", model: selected.model });
    }
    return reply(200, {
      answer: "NARA menyusun " + suggestions.length + " usulan pemetaan dari label header saja. Tinjau dan simpan secara eksplisit pada layar Pemetaan Excel.",
      model: selected.provider + "/" + selected.model,
      suggestions,
      header_count: headers.length,
      target_count: targets.length,
      saved: false,
    });
  }

  // AI-assisted ICD-10: hanya istilah diagnosis agregat (ambang >=5 pasien) yang dikirim.
  // No. RM dipakai internal oleh RPC untuk deduplikasi; No. RM/nama/NIK tidak pernah masuk ke payload provider.
  if (task === "icd10_suggest") {
    const year = new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear();
    const { data: queued, error: queueError } = await db.rpc("aureka_nara_icd10_review_queue", { p_year: year, p_room: null, p_limit: 200 });
    if (queueError) {
      console.error("NARA ICD-10 queue unavailable", queueError.code || "unknown");
      return reply(403, { error: "Antrian koding hanya tersedia untuk Super Admin/Komite PMKP atau belum dapat dibaca." });
    }
    const rows = Array.isArray(queued) ? queued as Record<string, unknown>[] : [];
    // Hanya istilah baru yang belum pernah diusulkan diproses; istilah proposed tetap tampil pada layar review.
    const unmappedRows = rows.filter((r) => {
      if (String(r.mapping_status || "unmapped") !== "unmapped") return false;
      const d = String(r.diagnosis || "").trim();
      return d.length >= 2 && d.length <= 120 && !/[0-9]{6,}/.test(d)
        && !/(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[\s:#=-]/i.test(d)
        && !/(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)/i.test(d)
        && !/^[0-9\s+()./-]+$/.test(d);
    });
    // Batch kecil menjaga panjang konteks dan memberi kesempatan memproses antrean berikutnya tanpa duplikasi.
    const safeRows = unmappedRows.slice(0, 15);
    const awaitingReview = rows.filter((r) => String(r.mapping_status || "") === "proposed").length;
    if (!safeRows.length) {
      const message = awaitingReview
        ? "Tidak ada istilah diagnosis baru yang memerlukan usulan AI. Saat ini ada " + awaitingReview + " usulan ICD-10 yang menunggu verifikasi reviewer PMIK/DPJP."
        : "Tidak ada istilah diagnosis baru yang memenuhi kriteria untuk diusulkan. Istilah dengan kelompok kurang dari lima pasien tetap tidak dikirim ke provider AI demi perlindungan privasi.";
      return reply(200, {
        answer: message, model: "database:icd10-review-queue", proposed: 0, pending: 0, awaiting_review: awaitingReview,
      intelligence: {
        model: "database:icd10-review-queue",
        skills: ["Clinical Intelligence"],
        domains: ["clinical"],
        snapshot_status: "available",
        source: "aureka_nara_icd10_review_queue (secure RPC)",
        generated_at: new Date().toISOString(),
        page: null,
      },
      });
    }
    const allowedTerms = new Map(safeRows.map((r) => [normalizeIcd10Term(String(r.diagnosis)), String(r.diagnosis)]));
    const payload = { code_set: "WHO ICD-10 Version 2019", items: safeRows.map((r) => ({ diagnosis: String(r.diagnosis), patient_count: Number(r.patient_count) || 0 })) };
    const system = [
      "Kamu adalah asisten koding klinis untuk memberi USULAN ICD-10 WHO Version 2019. Ini bukan keputusan klinis atau koding final.",
      "Analisis variasi ejaan, singkatan lazim, dan typo yang jelas, tetapi jangan menyamakan kondisi yang berbeda secara klinis. Diagnosis berbeda hanya boleh disatukan bila benar-benar memiliki makna klinis dan kode yang sama.",
      "Masukkan kode hanya bila diagnosis cukup spesifik dan padanannya jelas. Jangan menebak dari singkatan ambigu, istilah sisi tubuh tanpa konteks, atau diagnosis yang tidak lengkap.",
      'Kembalikan JSON valid saja dengan bentuk {"items":[{"diagnosis":"teks input persis","icd10_code":"kode atau null","icd10_title":"judul resmi atau null","confidence":0.0,"rationale":"alasan singkat"}]}.',
      "Gunakan hanya diagnosis yang sama persis dengan daftar input. Jangan menambahkan diagnosis, pasien, nama, nomor rekam medis, atau informasi klinis lain.",
      "Judul kode harus mengikuti istilah resmi WHO ICD-10 2019. Bila tidak yakin, isi icd10_code dan icd10_title dengan null, confidence di bawah 0.6, dan jelaskan kekurangan konteks secara singkat.",
      "Semua hasil akan tersimpan sebagai PROPOSED/belum tervalidasi. Reviewer PMIK/DPJP harus memeriksa kembali tabular list, inclusion/exclusion notes, dan karakter ke-4 sebelum mengesahkan.",
    ].join("\n");
    const contents: Turn[] = [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }];
    const deadline = Date.now() + PROVIDER_ROUTE_BUDGET_MS;
    let selected: { provider: string; model: string; suggestions: Icd10AiSuggestion[] } | null = null;
    let lastError = BUSY;
    const providerDiagnostics: string[] = [];
    for (const provider of order) {
      if (Date.now() >= deadline || selected) break;
      for (const key of available[provider] || []) {
        if (Date.now() >= deadline || selected) break;
        const result = provider === "gemini"
          ? await askGemini(key, system, contents, deadline, true)
          : await askOpenAi(OPENAI_PROVIDERS[provider], key, system, contents, deadline, true);
        if ("status" in result) {
          lastError = result.error;
          providerDiagnostics.push(provider + ": " + result.error);
          continue;
        }
        const suggestions = parseIcd10AiSuggestions(result.answer, allowedTerms);
        if (suggestions.length) {
          selected = { provider, model: result.model, suggestions };
        } else {
          providerDiagnostics.push(provider + "/" + result.model + ": respons diterima, tetapi format/istilah/kode/confidence tidak lolos validasi.");
          console.warn("NARA ICD-10 response rejected by validator", provider, result.model);
        }
      }
    }
    if (!selected) {
      const detail = providerDiagnostics.length ? providerDiagnostics.slice(0, 8).join(" | ") : lastError;
      return reply(502, {
        code: "ICD10_PROVIDER_OR_PARSE_FAILURE",
        error: "NARA belum memperoleh usulan ICD-10 yang dapat divalidasi. Tidak ada kode yang disimpan. " + detail,
        provider_diagnostics: providerDiagnostics.slice(0, 8),
      });
    }
    let saved = 0;
    const reports: string[] = [];
    for (const item of selected.suggestions) {
      const note = ("Usulan AI NARA (" + selected.provider + "/" + selected.model + "; confidence " + Math.round(item.confidence * 100) + "%). " + item.rationale + " Wajib diverifikasi dengan WHO ICD-10 2019 oleh reviewer PMIK/DPJP sebelum digunakan.").slice(0, 1000);
      const { error: saveError } = await db.rpc("aureka_nara_icd10_upsert_mapping", {
        p_diagnosis: item.diagnosis, p_icd10_code: item.code, p_icd10_title: item.title,
        p_status: "proposed", p_validation_reference: null, p_review_note: note,
      });
      if (saveError) { reports.push(item.diagnosis + ": gagal disimpan"); continue; }
      saved++;
      reports.push("- " + item.diagnosis + " → " + item.code + " (" + Math.round(item.confidence * 100) + "%; belum tervalidasi)");
    }
    if (saved === 0) {
      console.error("NARA ICD-10 provider returned suggestions but database save failed", selected.provider, selected.model, reports.length);
      return reply(500, {
        code: "ICD10_PROPOSAL_SAVE_FAILED",
        error: "AI berhasil menghasilkan usulan, tetapi tidak ada usulan yang tersimpan. Periksa hak akses Super Admin/Komite PMKP dan fungsi penyimpanan kamus ICD-10.",
        model: selected.provider + ":" + selected.model,
        proposed: 0,
        failed: reports.length,
      });
    }
    const pending = Math.max(0, unmappedRows.length - saved);
    const continuation = pending > 0
      ? "\n\nMasih ada " + pending + " istilah baru dalam antrean. Jalankan kembali usulan AI untuk memproses kelompok berikutnya."
      : "";
    return reply(200, {
      answer: "NARA membuat " + saved + " usulan pemetaan ICD-10 dari " + safeRows.length + " istilah diagnosis agregat. Semua disimpan sebagai usulan, bukan kode tervalidasi.\n\n" + reports.join("\n") + continuation +
        (awaitingReview ? "\n\n" + awaitingReview + " usulan sebelumnya juga masih menunggu validasi reviewer." : ""),
      model: selected.provider + ":" + selected.model, proposed: saved, pending, awaiting_review: awaitingReview + saved,
      intelligence: {
        model: selected.provider + ":" + selected.model,
        skills: ["Clinical Intelligence"],
        domains: ["clinical"],
        snapshot_status: "available",
        source: "aureka_nara_icd10_review_queue + aureka_nara_icd10_upsert_mapping (secure RPC)",
        generated_at: new Date().toISOString(),
        page: null,
      },
    });
  }

  // Ranking diagnosis dihitung di database yang memeriksa JWT dan cakupan unit.
  // Agregat diagnosis tidak dikirim ke provider LLM eksternal.
  if (isTopDiseaseQuery(question)) {
    const year = requestedYear(question, new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear());
    const { data: clinical, error: clinicalError } = await db.rpc("aureka_nara_clinical_summary", {
      p_year: year, p_room: null, p_limit: 10,
    });
    if (clinicalError || !clinical || typeof clinical !== "object") {
      console.error("NARA clinical summary unavailable", clinicalError?.code || "unknown");
      return reply(503, { error: "Analitik diagnosis belum dapat dibaca. Periksa migrasi NARA Clinical Intelligence dan hak akses unit." });
    }
    return reply(200, {
      answer: formatTopDiseaseAnswer(clinical as Record<string, unknown>),
      model: "database:clinical-analytics",
      intelligence: { model: "database:clinical-analytics", skills: ["Clinical Intelligence"], domains: ["clinical"], snapshot_status: "available", source: "aureka_nara_clinical_summary (secure RPC)", generated_at: new Date().toISOString(), page: null },
    });
  }
  // Obrolan ringan (salam, terima kasih, basa-basi) tidak perlu data: jawab langsung tanpa menarik data.
  const DATA_WORDS = /\b(unit|ruang|risiko|risk|ikp|insiden|kejadian|data|berapa|jumlah|total|mutu|indikator|logbook|lapor|input|pasien|episode|diagnosis|diagnosa|koding|icd-?10|dpjp|clinical|pathway|kematian|oppe|fppe|angka|persen|triwulan|tw|bulan|tahun|capaian|target|rtp|rencana|fmea|rca|survei|budaya|prioritas|tren|grafik|rekap|ringkas|fokus|kpi|validasi|tenggat|kirim|pesan|ingatkan|pengingat|pic|rekomendasi|tindak lanjut|supabase|next\.js|react|typescript|javascript|sql|database|basis data|schema|migrasi|migration|rls|edge function|api|frontend|backend|fullstack|debug|deploy|deployment|ci.?cd|github|repository|repositori|kode program|bug|error teknis|integrasi sistem|arsitektur sistem|pipeline|dewan pengawas|tata kelola|keputusan direksi|kebijakan rumah sakit)\b/i;
  const smallTalk = question.length < 80 && !DATA_WORDS.test(question);
  const page = (body.page || "").toString().slice(0, 80);
  // Deterministic skill routing runs before model invocation; the LLM may synthesize, never select data access.
  const skillPlan = smallTalk ? null : planNaraSkills(question);

  const snapshotDomains = [...new Set(skillPlan?.domains || [])].sort();
  const snapshotCacheKey = who.user.id + "::" + snapshotDomains.join(",");
  const cached = snapshotCache.get(snapshotCacheKey);
  const fresh = cached && Date.now() - cached.at < SNAPSHOT_TTL;
  // Queries are selected by skill domain, and the server-side cache is partitioned by domain set.
  // The provider receives a second, fail-closed projection of only approved snapshot keys.
  const needsAggregateData = !smallTalk && Boolean(skillPlan?.requiresAggregateData);
  const rawSnapshot = needsAggregateData
    ? (fresh ? cached!.data : await snapshot(db, snapshotDomains))
    : null;
  if (!fresh && rawSnapshot) snapshotCache.set(snapshotCacheKey, { at: Date.now(), data: rawSnapshot });
  const data = rawSnapshot ? scopeSnapshotForSkills(rawSnapshot, snapshotDomains) : null;
  // Account identity is intentionally excluded from external model context.
  const system = [
    "Kamu adalah NARA AI (AUREKA Intelligence), asisten intelijen rumah sakit untuk mutu, keselamatan pasien, manajemen risiko, statistik, tata kelola, dan dukungan keputusan.",
    skillPlan ? "SKILL ORCHESTRATION (ditetapkan backend, bukan oleh model):" : "",
    skillPlan ? JSON.stringify({ mode: skillPlan.mode, primary: skillPlan.primary, selected_skill_ids: skillPlan.selected, selected_skills: skillPlan.labels, requested_data_domains: skillPlan.domains, aggregate_snapshot_required: skillPlan.requiresAggregateData }) : "",
    ...(skillPlan?.instructions.map((instruction) => "ATURAN SKILL: " + instruction) || []),
    "VISUAL INTELLIGENCE: Jika pengguna meminta visualisasi, buat blok [[NARA_VISUAL]]JSON[[/NARA_VISUAL]] dengan tipe yang didukung dan hanya memakai angka DATA AUREKA. Untuk matriks risiko 5×5, gunakan likelihood dan impact per risiko; jangan menurunkannya dari level atau skor agregat. Jika kedua variabel tidak tersedia, jangan mengarang matriks. Backend menyediakan matriks 5×5 agregat dari kolom likelihood dan impact register; setiap sel kecil dapat disembunyikan. Jelaskan bahwa nilai 3 merupakan default skema dan kualitas asal nilai perlu diverifikasi sebelum keputusan. Pie chart harus memakai kategori saling lepas, denominator yang jelas, sumber, periode, unit, dan interpretasi yang menyebut keterbatasan. Untuk visual lain, gunakan bar untuk perbandingan, line untuk tren, pie untuk komposisi, heatmap untuk dua dimensi kategorik. Maksimal 24 baris dan 4 seri. Jangan mengarang, mengisi nilai kosong, atau mengestimasi. Peta geografis tidak didukung tanpa koordinat terverifikasi. Blok visual diletakkan paling akhir setelah narasi interpretasi.",
    "Jangan mengklaim menjalankan skill/tool yang tidak tercantum dalam konteks. Jika pertanyaan memerlukan domain yang tidak tersedia pada DATA AUREKA, jelaskan keterbatasannya dan jangan mengarang hasil.",
    "GOVERNED DATA CONTEXT: Backend hanya memuat snapshot untuk skill yang memerlukan data agregat dan menyaring snapshot ke domain skill yang dipilih. Keluaran _nara_context mencatat domain yang disertakan/dikecualikan. Penyaringan ini adalah minimisasi konteks, bukan otorisasi; JWT dan RLS Supabase tetap menjadi batas akses utama. Jangan mencoba meminta atau merekonstruksi domain yang tidak disertakan.",
    "ENGINEERING INTELLIGENCE: Untuk pertanyaan teknis, berikan analisis dan panduan implementasi yang dapat diverifikasi. Gateway ini tidak memiliki akses GitHub, shell, secret, SQL langsung, atau deployment; jangan mengaku telah membaca/mengubah repository, menjalankan tes, atau menerapkan migrasi. Jangan meminta kredensial dan selalu rekomendasikan perubahan database melalui migrasi versioned, least privilege, dan RLS.",
    "GOVERNANCE INTELLIGENCE: Untuk pertanyaan tata kelola, gunakan agregat yang tersedia dan bedakan fakta, interpretasi, risiko pelaksanaan, serta rekomendasi. NARA tidak menggantikan kewenangan Direksi/Dewan Pengawas/pejabat, tidak mengesahkan kebijakan, dan tidak mengubah status rekomendasi atau tindak lanjut.",
    "Peringkat diagnosis dihitung oleh fungsi analitik klinis database; jangan meminta atau menebak No. RM, nama, NIK, atau identitas pasien.",
    "Basis diagnosis terakhir per pasien tidak sama dengan seluruh episode. Sebutkan keterbatasan sumber secara eksplisit. Jangan mengklaim memiliki seluruh diagnosis DPJP jika episode klinis belum tersedia.",
    "Kode ICD-10 hanya boleh disebut tervalidasi bila dictionary internal menyatakan mapping_status=validated. Jangan mengarang kode dari singkatan yang ambigu; tandai belum dikoding dan minta validasi PMIK/DPJP.",
    "Untuk analisis diagnosis, gunakan analisis_diagnosis_klinis. Bila source_basis patient_index_latest_diagnosis, jelaskan bahwa ini diagnosis terakhir per pasien, bukan seluruh episode atau seluruh kunjungan DPJP. Bila source_basis episode_records, nyatakan basis episode dan hitungan pasien unik/episode secara terpisah.",
    "Untuk pertanyaan tentang indikator, bedakan definisi pada profil_indikator_mutu dari capaian aktual pada mutu_klinis_logbook. Jangan menganggap profil sebagai hasil capaian.",
    "Gunakan seluruh domain agregat yang tersedia: profil indikator, diagnosis, keselamatan pasien, risiko, FMEA, tenaga kesehatan agregat, OPPE/FPPE, konsultasi IGD, rekomendasi, aksi, dan prioritas tahunan. Jika sumber bernilai kosong atau gagal diakses, sampaikan secara eksplisit; jangan mengarang data.",
    "GAYA BICARA:",
    "- Ngobrol seperti rekan kerja yang ramah sekaligus petugas layanan (CS) yang sigap: hangat, natural, sopan, tidak kaku, tidak seperti robot atau laporan resmi.",
    "- Ikuti gaya pengguna: kalau pengguna santai, jawab natural; kalau formal, jawab formal. Jangan menyebut nama pribadi pengguna.",
    "- Obrolan ringan (salam, terima kasih, curhat kerja, basa-basi) dijawab wajar dan singkat seperti teman, tanpa membeberkan data kalau tidak diminta. Boleh menawarkan bantuan di akhir.",
    "- Jawaban pendek dulu (1–4 kalimat) lalu poin seperlunya. Kalau pertanyaan kurang jelas, tanya balik satu pertanyaan singkat. Boleh menawarkan langkah berikutnya ('Mau aku rinci per unit?').",
    "- Emoji boleh sesekali (maksimal satu per pesan), jangan berlebihan. Jangan memakai kata/kalimat bahasa Inggris kecuali istilah baku (RCA, FMEA).",
    "ATURAN DATA (tetap wajib walau gaya santai):",
    "1. Untuk pertanyaan tentang data rumah sakit ini, gunakan HANYA angka dari DATA AUREKA di bawah dan sebutkan angkanya persis. Jangan menghitung dari contoh/sampel bila tersedia data agregat. Jangan mengarang angka, unit, atau nama orang.",
    "2. Pertanyaan 'unit mana yang belum lapor/belum input' untuk mutu klinis dijawab dari mutu_klinis_logbook.unit_belum_input_per_triwulan (sebutkan semua unitnya) dan jelaskan singkat bahwa ini berdasarkan entri Form Logbook.",
    "3. Bila data yang ditanyakan memang tidak ada di DATA AUREKA, bilang terus terang dengan santai, lalu sebutkan menu AUREKA yang relevan. Hanya boleh menyebut menu dari DAFTAR MENU di bawah; jangan mengarang menu, filter, atau tombol.",
    "4. Boleh menjelaskan konsep mutu (PMKP, STARKES/SNARS, IKP, KTD/KNC/KTC/KPC, RCA, FMEA, matriks risiko 5x5, PDSA) dari pengetahuan umum; sebutkan bahwa itu pengetahuan umum, bukan data AUREKA.",
    "5. Saran tindak lanjut dibuat konkret, maksimal 5 poin. Format: paragraf pendek atau poin '-' ; boleh **tebal**. Jangan pakai tabel markdown.",
    "6. Jangan pernah meminta, menebak, mengulang, atau menampilkan identitas pasien maupun petugas. Untuk masalah medis pasien perorangan, arahkan ke DPJP/tenaga kesehatan yang berwenang.",
    "7. DATA BOUNDARY: data yang tersedia di prompt telah diagregasi dan diminimalkan oleh backend. Jangan meminta data mentah, jangan menyarankan mengirim identitas, dan jangan mencoba merekonstruksi individu dari agregat.",
    "8. Angka kecil yang ditandai disembunyikan tidak boleh ditebak, dihitung balik, atau diungkap melalui kombinasi kategori.",
    "9. Analisis data dilakukan backend melalui fungsi database yang menguji autentikasi dan hak akses unit. Model hanya menerima konteks agregat yang telah diminimalkan; jangan meminta data mentah atau mengklaim telah mengubah data.",
    "10. Kamu tidak bisa mengubah data. Tapi kamu BISA menyiapkan draf pengingat/pesan ke PIC unit; pengguna yang memeriksa lalu menekan tombol Kirim (pesan masuk ke Chat unit di Pusat Komunikasi). Jika pengguna meminta mengirim pesan/pengingat ke unit tertentu (atau 'unit tersebut' dari percakapan sebelumnya), jawab singkat (1–2 kalimat, sebut bahwa dia tinggal cek lalu tekan Kirim), lalu tambahkan di AKHIR jawaban satu blok persis seperti ini tanpa code block: [[KIRIM_PENGINGAT]]{\"unit\":[\"Nama Unit 1\",\"Nama Unit 2\"],\"pesan\":\"isi pesan\"}[[/KIRIM_PENGINGAT]]. Nama unit harus persis dari daftar_unit_aktif. Pesan sopan, ringkas (maks 5 kalimat), sebut hal yang perlu dilengkapi dan periodenya, ditutup salam dari Komite PMKP. Jangan menyatakan pesan sudah terkirim.",
    "Pengguna adalah akun AUREKA yang telah terautentikasi; identitas akun tidak dikirim ke model." + (page ? " Sedang membuka halaman: " + page : "") + ".",
    "DAFTAR MENU AUREKA:",
    ...MENU_AUREKA.map((m) => "- " + m),
    data ? "DATA AUREKA (sesuai JWT/RLS dan domain skill terpilih, JSON):" : skillPlan && !skillPlan.requiresAggregateData ? "DATA AUREKA: snapshot agregat tidak dimuat karena skill aktif (misalnya Engineering, Knowledge, Statistical, Research, Audit, atau Visual) tidak memerlukan data rumah sakit. Jangan menyimpulkan angka operasional." : "DATA AUREKA: tidak dimuat karena ini obrolan ringan. Kalau pengguna ternyata menanyakan angka, minta dia mengulang pertanyaannya dengan menyebut data yang dimaksud.",
    data ? JSON.stringify(data) : "",
  ].join("\n");

  const contents = [
    ...history.filter((h) => h && typeof h.text === "string" && h.text.trim()).map((h) => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 2000) }] })),
    { role: "user", parts: [{ text: question }] },
  ];

  let last: AiResult = { status: 502, error: BUSY };
  const providerDeadline = Date.now() + PROVIDER_ROUTE_BUDGET_MS;
  for (const provider of order) {
    if (Date.now() >= providerDeadline) break;
    for (const key of available[provider]) {
      if (Date.now() >= providerDeadline) break;
      const result = provider === "gemini" ? await askGemini(key, system, contents, providerDeadline) : await askOpenAi(OPENAI_PROVIDERS[provider], key, system, contents, providerDeadline);
      if (!("status" in result)) {
        const answer = appendRiskDistributionFallback(question, result.answer, data);
        return reply(200, {
          answer,
          model: provider + ":" + result.model,
          intelligence: {
            model: provider + ":" + result.model,
            skills: skillPlan?.labels ?? [],
            domains: snapshotDomains,
            snapshot_status: data ? "available" : needsAggregateData ? "unavailable" : "not_required",
            source: data ? "AUREKA secure aggregate snapshot (JWT/RLS)" : needsAggregateData ? "Snapshot domain tidak tersedia" : "Tidak menggunakan snapshot operasional",
            generated_at: new Date().toISOString(),
            page: page || null,
          },
        });
      }
      last = result;
      console.warn("nara-ai", provider, "gagal:", result.error);
    }
  }
  return reply(last.status, { error: last.error });
}

// Error internal dicatat secara minimal; browser tidak menerima detail runtime/provider.
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    console.error("nara-ai internal error", error instanceof Error ? error.name : "UnknownError");
    return reply(500, { error: "NARA AI sedang mengalami gangguan. Silakan coba kembali." });
  }
});
