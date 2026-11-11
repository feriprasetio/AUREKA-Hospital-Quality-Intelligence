// Tanya AUREKA — asisten tanya-jawab berbasis data AUREKA (Gemini, Groq, NVIDIA; opsional DeepSeek/LLM7).
// Kunci API disimpan sebagai secret Supabase (GROQ_API_KEY atau GEMINI_API_KEY), tidak pernah dikirim ke browser.
// Data diambil dengan JWT pengguna sehingga RLS berlaku: AI hanya melihat data yang boleh dilihat pengguna itu.
// Tidak ada data identitas pasien yang dikirim ke AI (ringkasan IKP hanya berupa hitungan).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
};
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest";
const FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-latest";
const LIMIT_PER_WINDOW = 20;           // pertanyaan per pengguna
const WINDOW_MS = 10 * 60 * 1000;      // per 10 menit (perkiraan; per instance fungsi)
const hits = new Map<string, number[]>();
let stage = "mulai";

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
const top = (o: Record<string, number>, n: number) => Object.fromEntries(Object.entries(o).slice(0, n));

type Risk = { risk_code: string; unit_name: string | null; risk_event: string | null; risk_level: string; risk_score: number | null; status: string | null; due_date: string | null };
type Plan = { status: string | null; target_date: string | null };
type Incident = Record<string, unknown>;
type Room = { id: number; name: string; is_active: boolean | null };

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

async function snapshot(db: SupabaseClient) {
  const now = new Date(Date.now() + 7 * 3600 * 1000); // WIB/WIB-Pontianak
  const today = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  const monthNow = now.getUTCMonth(); // 0-11
  const quarterNow = Math.floor(monthNow / 3); // 0-3
  const [risks, plans, incidents, quality, roomsRes] = await Promise.all([
    fetchAll<Risk>((f, t) => db.schema("aureka_risk").from("risk_register")
      .select("risk_code,unit_name,risk_event,risk_level,risk_score,status,due_date")
      .order("risk_score", { ascending: false }).order("id", { ascending: true }).range(f, t)),
    fetchAll<Plan>((f, t) => db.schema("aureka_risk").from("mitigation_plans")
      .select("status,target_date").order("id", { ascending: true }).range(f, t)),
    fetchAll<Incident>((f, t) => db.schema("aureka_patient_safety").from("incidents")
      .select("*").order("created_at", { ascending: false }).range(f, t), 3000),
    qualityCounts(db, year),
    db.from("master_rooms").select("id,name,is_active").order("sort_order", { ascending: true }),
  ]);
  const rooms = ((roomsRes.data || []) as Room[]).filter((r) => r.is_active !== false);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const open = (r: Risk) => r.status !== "Controlled" && r.status !== "Accepted";

  // --- Manajemen risiko: jumlah per unit per level (semua unit, bukan sampel)
  const perUnit: Record<string, Record<string, number>> = {};
  for (const r of risks.rows) {
    const u = (r.unit_name || "Tanpa unit").trim();
    const row = perUnit[u] || (perUnit[u] = { "Sangat Tinggi": 0, "Tinggi": 0, "Sedang": 0, "Rendah": 0, total: 0 });
    if (r.risk_level in row) row[r.risk_level]++;
    row.total++;
  }
  const risikoPerUnit = Object.entries(perUnit)
    .sort((a, b) => b[1]["Sangat Tinggi"] - a[1]["Sangat Tinggi"] || b[1]["Tinggi"] - a[1]["Tinggi"] || b[1].total - a[1].total)
    .map(([unit, c]) => ({ unit, sangat_tinggi: c["Sangat Tinggi"], tinggi: c["Tinggi"], sedang: c["Sedang"], rendah: c["Rendah"], total: c.total }));

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
      per_triwulan: Object.fromEntries(ROMAWI.slice(0, quarterNow + 1).map((q, k) => ["TW " + q, tri[k]])),
      bulan_tanpa_entri: BULAN.slice(0, monthNow + 1).filter((_, k) => !arr[k]),
    };
  });
  const belumInputPerTriwulan = Object.fromEntries(ROMAWI.slice(0, quarterNow + 1).map((q, k) => [
    "Triwulan " + q, logbookPerUnit.filter((u) => !(u.per_triwulan["TW " + q] > 0)).map((u) => u.unit),
  ]));

  // --- Keselamatan pasien (hanya hitungan, tanpa identitas/kronologi)
  const incUnit = (i: Incident) => String(i.unit_name ?? i.room_name ?? (i.room_id != null ? roomName.get(Number(i.room_id)) : "") ?? "").trim() || "Tanpa unit";
  const incDate = (i: Incident) => String(i.incident_date ?? i.occurred_at ?? i.created_at ?? "").slice(0, 10);
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
    ].filter(Boolean),
    daftar_unit_aktif: rooms.map((r) => r.name),
    manajemen_risiko: {
      total_risiko: risks.rows.length,
      per_level: Object.fromEntries(LEVELS.map((l) => [l, risks.rows.filter((r) => r.risk_level === l).length])),
      per_status: count(risks.rows, (r) => r.status),
      risiko_tinggi_dan_sangat_tinggi_tanpa_tenggat: risks.rows.filter((r) => (r.risk_level === "Tinggi" || r.risk_level === "Sangat Tinggi") && !r.due_date && open(r)).length,
      risiko_lewat_tenggat: risks.rows.filter((r) => r.due_date && r.due_date < today && open(r)).length,
      jumlah_per_unit_per_level: risikoPerUnit,
      contoh_risiko_skor_tertinggi: risks.rows.slice(0, 10).map((r) => ({ kode: r.risk_code, unit: r.unit_name, peristiwa: (r.risk_event || "").slice(0, 140), level: r.risk_level, skor: r.risk_score, status: r.status, tenggat: r.due_date })),
    },
    rencana_tindak: {
      total: plans.rows.length,
      per_status: count(plans.rows, (p) => p.status),
      lewat_target: plans.rows.filter((p) => p.target_date && p.target_date < today && !/selesai|done|completed|closed/i.test(p.status || "")).length,
    },
    mutu_klinis_logbook: {
      tahun: year,
      arti: "Entri Form Logbook Mutu Klinis (semua program) per unit berdasarkan tanggal layanan/periode. Unit dianggap 'belum input/lapor' pada suatu triwulan bila tidak ada entri sama sekali di triwulan itu.",
      total_entri: quality.rows.reduce((a, b) => a + b.total, 0),
      unit_belum_input_per_triwulan: belumInputPerTriwulan,
      per_unit: logbookPerUnit.filter((u) => u.total_entri > 0),
      unit_tanpa_entri_sama_sekali: logbookPerUnit.filter((u) => u.total_entri === 0).map((u) => u.unit),
    },
    keselamatan_pasien: {
      total_laporan_ikp: incidents.rows.length,
      per_jenis: count(incidents.rows, incType),
      per_unit: count(incidents.rows, incUnit),
      per_bulan: Object.fromEntries(Object.entries(count(incidents.rows, (i) => incDate(i).slice(0, 7) || "Tanpa tanggal")).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)),
    },
  };
}

type Turn = { role: string; parts: { text: string }[] };
type AiResult = { answer: string; model: string } | { status: number; error: string };
const BUSY = "Layanan AI sedang sibuk. Coba lagi sebentar lagi.";
const QUOTA = "Kuota AI gratis sedang habis. Coba lagi beberapa menit lagi.";

/** Gemini: model utama, lalu model cadangan bila sibuk/kuota habis. */
async function askGemini(apiKey: string, system: string, contents: Turn[]): Promise<AiResult> {
  const payload = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.6, maxOutputTokens: 1200 } });
  let last = 0;
  for (const model of [...new Set([MODEL, FALLBACK_MODEL])]) {
    if (isDead("gemini:" + model)) continue;
    let res: Response;
    try {
      res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey }, body: payload,
      }, 15000);
    } catch (e) { console.warn("gemini", model, "timeout", String(e).slice(0, 120)); last = 504; continue; }
    last = res.status;
    if (res.ok) {
      const out = await res.json();
      const answer = (out?.candidates?.[0]?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || "").join("").trim();
      if (answer) return { answer, model };
      continue;
    }
    const body = (await res.text()).slice(0, 300);
    console.warn("gemini", model, res.status, body);
    if (res.status === 404 || (res.status === 400 && /model.*(not found|not supported)/i.test(body))) markDead("gemini:" + model);
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
    models: [Deno.env.get("GROQ_MODEL") || "", "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"] },
  nvidia: { label: "NVIDIA", url: "https://integrate.api.nvidia.com/v1/chat/completions",
    models: [Deno.env.get("NVIDIA_MODEL") || "", "meta/llama-3.3-70b-instruct", "openai/gpt-oss-120b", "meta/llama-3.1-70b-instruct"] },
  deepseek: { label: "DeepSeek", url: "https://api.deepseek.com/chat/completions",
    models: [Deno.env.get("DEEPSEEK_MODEL") || "", "deepseek-flash", "deepseek-chat"] },
  llm7: { label: "LLM7", url: "https://api.llm7.io/v1/chat/completions",
    models: [Deno.env.get("LLM7_MODEL") || "", "default", "fast"] },
};

async function askOpenAi(p: OpenAiProvider, apiKey: string, system: string, contents: Turn[]): Promise<AiResult> {
  const messages = [
    { role: "system", content: system },
    ...contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map((x) => x.text).join("\n") })),
  ];
  let last = 0;
  for (const model of [...new Set(p.models.filter(Boolean))]) {
    const tag = p.label + ":" + model;
    if (isDead(tag)) continue;
    // Model "berpikir" (gpt-oss) diminta berpikir singkat agar jawaban cepat.
    const extra = /gpt-oss/.test(model) ? { reasoning_effort: "low" } : {};
    let res: Response;
    try {
      res = await fetchWithTimeout(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 1200, ...extra }),
      }, 30000);
    } catch (e) {
      console.warn(p.label, model, "jaringan/timeout", String(e).slice(0, 200));
      last = 504;
      continue;
    }
    last = res.status;
    if (res.ok) {
      const out = await res.json();
      const answer = String(out?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (answer) return { answer, model };
      continue;
    }
    const body = (await res.text()).slice(0, 300);
    console.warn(p.label, model, res.status, body);
    if (res.status === 401 || res.status === 403) return { status: 502, error: `Kunci ${p.label} ditolak. Periksa atau buat ulang kuncinya.` };
    if (res.status === 404 || (res.status === 400 && /model|decommission|not.*(found|exist|support)/i.test(body))) markDead(tag);
    // Model dihentikan/tidak ada (400/404/422), kuota (429), terlalu besar (413), server sibuk: coba model berikutnya.
    if (![400, 404, 413, 422, 429, 500, 502, 503, 504].includes(res.status)) break;
  }
  return { status: last === 429 ? 429 : 502, error: last === 429 ? QUOTA : BUSY };
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
  // Bawaan hanya penyedia langsung (Google, Groq, NVIDIA). DeepSeek (server di Tiongkok) & LLM7 (perantara pihak ketiga)
  // dipakai hanya bila dicantumkan sendiri di AI_PROVIDER_ORDER, karena data mutu RS ikut terkirim.
  const order = (Deno.env.get("AI_PROVIDER_ORDER") || "gemini,groq,nvidia").split(/[\s,]+/).map((x) => x.toLowerCase().replace(/\.io$/, "")).filter((x) => available[x]?.length);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!order.length || !supabaseUrl || !anonKey) return reply(500, { error: "Tanya AUREKA belum dikonfigurasi di server (isi secret GEMINI_API_KEY, GROQ_API_KEY, atau NVIDIA_API_KEY dengan kode kunci saja)." });

  stage = "cek-login";
  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return reply(401, { error: "Sesi tidak ditemukan. Silakan masuk kembali." });
  const db = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: who, error: whoError } = await db.auth.getUser();
  if (whoError || !who.user) return reply(401, { error: "Sesi tidak valid. Silakan masuk kembali." });

  const { data: profile } = await db.schema("aureka_system").from("user_profiles").select("full_name,is_active").eq("user_id", who.user.id).maybeSingle();
  if (!profile?.is_active) return reply(403, { error: "Akun belum aktif." });

  let body: { question?: string; history?: { role?: string; text?: string }[]; page?: string; warmup?: boolean };
  try { body = await req.json(); } catch { return reply(400, { error: "Format permintaan tidak valid." }); }
  // Pemanasan saat panel dibuka: siapkan ringkasan data di cache, tanpa memanggil AI.
  if (body.warmup) {
    const c = snapshotCache.get(who.user.id);
    if (!c || Date.now() - c.at >= SNAPSHOT_TTL) snapshotCache.set(who.user.id, { at: Date.now(), data: await snapshot(db) });
    return reply(200, { ok: true });
  }
  const question = (body.question || "").toString().trim().slice(0, 1500);
  if (!question) return reply(400, { error: "Pertanyaan kosong." });
  if (rateLimited(who.user.id)) return reply(429, { error: "Batas pertanyaan tercapai (20 per 10 menit). Coba lagi sebentar lagi." });
  // Obrolan ringan (salam, terima kasih, basa-basi) tidak perlu data: jawab langsung tanpa menarik data.
  const DATA_WORDS = /\b(unit|ruang|risiko|risk|ikp|insiden|kejadian|data|berapa|jumlah|total|mutu|indikator|logbook|lapor|input|pasien|episode|angka|persen|triwulan|tw|bulan|tahun|capaian|target|rtp|rencana|fmea|rca|survei|budaya|prioritas|tren|grafik|rekap|ringkas|fokus|kpi|validasi|tenggat|kirim|pesan|ingatkan|pengingat|pic)\b/i;
  const smallTalk = question.length < 80 && !DATA_WORDS.test(question);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const page = (body.page || "").toString().slice(0, 80);

  stage = "ambil-data";
  const cached = snapshotCache.get(who.user.id);
  const fresh = cached && Date.now() - cached.at < SNAPSHOT_TTL;
  const data = fresh ? cached!.data : smallTalk ? null : await snapshot(db);
  if (!fresh && data) snapshotCache.set(who.user.id, { at: Date.now(), data });
  stage = "susun-prompt";
  const firstName = String(profile.full_name || "").split(/[\s,]+/)[0] || "";
  const system = [
    "Kamu adalah AUREKA, rekan kerja virtual di Komite PMKP RSUD Sultan Syarif Mohamad Alkadrie, Pontianak, yang tinggal di aplikasi AUREKA (Hospital Quality Intelligence).",
    "GAYA BICARA:",
    "- Ngobrol seperti rekan kerja yang ramah sekaligus petugas layanan (CS) yang sigap: hangat, natural, sopan, tidak kaku, tidak seperti robot atau laporan resmi.",
    "- Ikuti gaya pengguna: kalau pengguna santai (mis. 'gimana', 'nggak', 'dong'), jawab santai juga; kalau formal, jawab lebih formal. Sapa dengan nama depannya sesekali" + (firstName ? " (nama depan: " + firstName + ")" : "") + ", jangan di setiap pesan.",
    "- Obrolan ringan (salam, terima kasih, curhat kerja, basa-basi) dijawab wajar dan singkat seperti teman, tanpa membeberkan data kalau tidak diminta. Boleh menawarkan bantuan di akhir.",
    "- Jawaban pendek dulu (1–4 kalimat) lalu poin seperlunya. Kalau pertanyaan kurang jelas, tanya balik satu pertanyaan singkat. Boleh menawarkan langkah berikutnya ('Mau aku rinci per unit?').",
    "- Emoji boleh sesekali (maksimal satu per pesan), jangan berlebihan. Jangan memakai kata/kalimat bahasa Inggris kecuali istilah baku (RCA, FMEA).",
    "ATURAN DATA (tetap wajib walau gaya santai):",
    "1. Untuk pertanyaan tentang data rumah sakit ini, gunakan HANYA angka dari DATA AUREKA di bawah dan sebutkan angkanya persis. Jangan menghitung dari contoh/sampel bila tersedia data agregat. Jangan mengarang angka, unit, atau nama orang.",
    "2. Pertanyaan 'unit mana yang belum lapor/belum input' untuk mutu klinis dijawab dari mutu_klinis_logbook.unit_belum_input_per_triwulan (sebutkan semua unitnya) dan jelaskan singkat bahwa ini berdasarkan entri Form Logbook.",
    "3. Bila data yang ditanyakan memang tidak ada di DATA AUREKA, bilang terus terang dengan santai, lalu sebutkan menu AUREKA yang relevan. Hanya boleh menyebut menu dari DAFTAR MENU di bawah; jangan mengarang menu, filter, atau tombol.",
    "4. Boleh menjelaskan konsep mutu (PMKP, STARKES/SNARS, IKP, KTD/KNC/KTC/KPC, RCA, FMEA, matriks risiko 5x5, PDSA) dari pengetahuan umum; sebutkan bahwa itu pengetahuan umum, bukan data AUREKA.",
    "5. Saran tindak lanjut dibuat konkret, maksimal 5 poin. Format: paragraf pendek atau poin '-' ; boleh **tebal**. Jangan pakai tabel markdown.",
    "6. Jangan pernah meminta atau menampilkan identitas pasien. Untuk masalah medis pasien perorangan, arahkan ke DPJP/tenaga kesehatan yang berwenang.",
    "7. Kamu tidak bisa mengubah data. Tapi kamu BISA menyiapkan draf pengingat/pesan ke PIC unit; pengguna yang memeriksa lalu menekan tombol Kirim (pesan masuk ke Chat unit di Pusat Komunikasi). Jika pengguna meminta mengirim pesan/pengingat ke unit tertentu (atau 'unit tersebut' dari percakapan sebelumnya), jawab singkat (1–2 kalimat, sebut bahwa dia tinggal cek lalu tekan Kirim), lalu tambahkan di AKHIR jawaban satu blok persis seperti ini tanpa code block: [[KIRIM_PENGINGAT]]{\"unit\":[\"Nama Unit 1\",\"Nama Unit 2\"],\"pesan\":\"isi pesan\"}[[/KIRIM_PENGINGAT]]. Nama unit harus persis dari daftar_unit_aktif. Pesan sopan, ringkas (maks 5 kalimat), sebut hal yang perlu dilengkapi dan periodenya, ditutup salam dari Komite PMKP. Jangan menyatakan pesan sudah terkirim.",
    "Pengguna: " + (profile.full_name || "pengguna") + (page ? ". Sedang membuka halaman: " + page : "") + ".",
    "DAFTAR MENU AUREKA:",
    ...MENU_AUREKA.map((m) => "- " + m),
    data ? "DATA AUREKA (sesuai hak akses pengguna, JSON):" : "DATA AUREKA: tidak dimuat karena ini obrolan ringan. Kalau pengguna ternyata menanyakan angka, minta dia mengulang pertanyaannya dengan menyebut data yang dimaksud.",
    data ? JSON.stringify(data) : "",
  ].join("\n");

  const contents = [
    ...history.filter((h) => h && typeof h.text === "string" && h.text.trim()).map((h) => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 2000) }] })),
    { role: "user", parts: [{ text: question }] },
  ];

  stage = "panggil-ai";
  let last: AiResult = { status: 502, error: BUSY };
  for (const provider of order) {
    for (const key of available[provider]) {
      const result = provider === "gemini" ? await askGemini(key, system, contents) : await askOpenAi(OPENAI_PROVIDERS[provider], key, system, contents);
      if (!("status" in result)) return reply(200, { answer: result.answer, model: provider + ":" + result.model });
      last = result;
      console.warn("aureka-tanya", provider, "gagal:", result.error);
    }
  }
  return reply(last.status, { error: last.error });
}

// Semua error tak terduga tetap dibalas dengan header CORS + alasan singkat,
// supaya browser tidak hanya melihat "Failed to fetch" dan penyebabnya bisa dilacak.
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    // Jangan pernah memantulkan isi header/secret ke browser.
    const detail = (error instanceof Error ? error.message : String(error)).replace(/Invalid header value[\s\S]*/i, "Invalid header value (isi secret kunci AI tidak valid)");
    console.error("aureka-tanya", stage, detail);
    return reply(500, { error: "Tanya AUREKA mengalami gangguan di server.", stage, detail: detail.slice(0, 300) });
  }
});
