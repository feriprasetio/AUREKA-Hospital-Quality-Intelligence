// Tanya AUREKA — asisten tanya-jawab berbasis data AUREKA (Gemini).
// Kunci API disimpan sebagai secret Supabase GEMINI_API_KEY, tidak pernah dikirim ke browser.
// Data diambil dengan JWT pengguna sehingga RLS berlaku: AI hanya melihat data yang boleh dilihat pengguna itu.
// Tidak ada data identitas pasien yang dikirim ke AI (ringkasan IKP hanya berupa hitungan).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
};
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-lite-latest";
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

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, cap = 5000) {
  const rows: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    let res: { data: T[] | null; error: unknown };
    try { res = await build(from, from + 999); } catch (e) { console.error("fetchAll", e); return { rows, error: true }; }
    const { data, error } = res;
    if (error) { console.error("fetchAll", error); return { rows, error: true }; }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { rows, error: false };
}

const count = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m: Record<string, number> = {};
  for (const r of rows) { const k = (key(r) || "Tidak diisi").toString().trim() || "Tidak diisi"; m[k] = (m[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};
const top = (o: Record<string, number>, n: number) => Object.fromEntries(Object.entries(o).slice(0, n));

type Risk = { risk_code: string; unit_name: string | null; risk_event: string | null; risk_level: string; risk_score: number | null; status: string | null; due_date: string | null };
type Plan = { status: string | null; target_date: string | null };
type Incident = { incident_date: string | null; unit_name: string | null; incident_type: string | null; status: string | null };

async function snapshot(db: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const [risks, plans, incidents, qAll, qReview] = await Promise.all([
    fetchAll<Risk>((f, t) => db.schema("aureka_risk").from("risk_register")
      .select("risk_code,unit_name,risk_event,risk_level,risk_score,status,due_date")
      .order("risk_score", { ascending: false }).order("id", { ascending: true }).range(f, t)),
    fetchAll<Plan>((f, t) => db.schema("aureka_risk").from("mitigation_plans")
      .select("status,target_date").order("id", { ascending: true }).range(f, t)),
    fetchAll<Incident>((f, t) => db.schema("aureka_patient_safety").from("incidents")
      .select("incident_date,unit_name,incident_type,status").order("created_at", { ascending: false }).range(f, t)),
    db.schema("aureka_quality").from("quality_records").select("id", { count: "exact", head: true }).eq("profile_year", year).is("archived_at", null),
    db.schema("aureka_quality").from("quality_records").select("id", { count: "exact", head: true }).eq("profile_year", year).is("archived_at", null).eq("review_required", true),
  ]);
  const high = risks.rows.filter((r) => r.risk_level === "Tinggi" || r.risk_level === "Sangat Tinggi");
  const open = (r: Risk) => r.status !== "Controlled" && r.status !== "Accepted";
  const month = (d: string | null) => (d || "").slice(0, 7) || "Tanpa tanggal";
  return {
    tanggal_hari_ini: today,
    catatan_sumber: [risks.error && "register risiko tidak dapat dibaca", plans.error && "rencana tindak tidak dapat dibaca", incidents.error && "IKP tidak dapat dibaca"].filter(Boolean),
    manajemen_risiko: {
      total_risiko: risks.rows.length,
      per_level: count(risks.rows, (r) => r.risk_level),
      per_status: count(risks.rows, (r) => r.status),
      unit_terbanyak_risiko_tinggi: top(count(high, (r) => r.unit_name), 10),
      risiko_tinggi_tanpa_tenggat: high.filter((r) => !r.due_date && open(r)).length,
      risiko_lewat_tenggat: risks.rows.filter((r) => r.due_date && r.due_date < today && open(r)).length,
      risiko_teratas: risks.rows.slice(0, 15).map((r) => ({ kode: r.risk_code, unit: r.unit_name, peristiwa: (r.risk_event || "").slice(0, 160), level: r.risk_level, skor: r.risk_score, status: r.status, tenggat: r.due_date })),
    },
    rencana_tindak: {
      total: plans.rows.length,
      per_status: count(plans.rows, (p) => p.status),
      lewat_target: plans.rows.filter((p) => p.target_date && p.target_date < today && !/selesai|done|completed|closed/i.test(p.status || "")).length,
    },
    keselamatan_pasien: {
      total_laporan_ikp: incidents.rows.length,
      per_jenis: count(incidents.rows, (i) => i.incident_type),
      per_status: count(incidents.rows, (i) => i.status),
      per_unit_teratas: top(count(incidents.rows, (i) => i.unit_name), 10),
      per_bulan_6_terakhir: top(Object.fromEntries(Object.entries(count(incidents.rows, (i) => month(i.incident_date))).sort((a, b) => b[0].localeCompare(a[0]))), 6),
    },
    mutu: {
      tahun: year,
      episode_logbook: qAll.count ?? null,
      episode_perlu_validasi: qReview.count ?? null,
    },
  };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!apiKey || !supabaseUrl || !anonKey) return reply(500, { error: "Tanya AUREKA belum dikonfigurasi di server (GEMINI_API_KEY)." });

  stage = "cek-login";
  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return reply(401, { error: "Sesi tidak ditemukan. Silakan masuk kembali." });
  const db = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data: who, error: whoError } = await db.auth.getUser();
  if (whoError || !who.user) return reply(401, { error: "Sesi tidak valid. Silakan masuk kembali." });

  const { data: profile } = await db.schema("aureka_system").from("user_profiles").select("full_name,is_active").eq("user_id", who.user.id).maybeSingle();
  if (!profile?.is_active) return reply(403, { error: "Akun belum aktif." });
  if (rateLimited(who.user.id)) return reply(429, { error: "Batas pertanyaan tercapai (20 per 10 menit). Coba lagi sebentar lagi." });

  let body: { question?: string; history?: { role?: string; text?: string }[]; page?: string };
  try { body = await req.json(); } catch { return reply(400, { error: "Format permintaan tidak valid." }); }
  const question = (body.question || "").toString().trim().slice(0, 1500);
  if (!question) return reply(400, { error: "Pertanyaan kosong." });
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const page = (body.page || "").toString().slice(0, 80);

  stage = "ambil-data";
  const data = await snapshot(db);
  stage = "susun-prompt";
  const system = [
    "Anda adalah \"Tanya AUREKA\", asisten mutu dan keselamatan pasien di aplikasi AUREKA (Hospital Quality Intelligence) sebuah rumah sakit di Indonesia.",
    "Jawab dalam Bahasa Indonesia yang ringkas, jelas, dan praktis untuk Komite PMKP, PIC unit, dan manajemen.",
    "Gunakan HANYA angka dari DATA AUREKA di bawah untuk pertanyaan tentang data rumah sakit ini. Jika data tidak tersedia, katakan terus terang dan sarankan modul AUREKA yang relevan untuk dicek. Jangan mengarang angka.",
    "Boleh menjelaskan konsep mutu (PMKP, SNARS/STARKES, IKP, KTD/KNC/KTC/KPC, RCA, FMEA, matriks risiko 5x5, PDSA) dari pengetahuan umum, dan beri tahu bila itu pengetahuan umum, bukan data AUREKA.",
    "Bila memberi saran tindak lanjut, buat konkret dan berurutan. Gunakan poin-poin pendek bila membantu. Jangan pernah meminta atau menampilkan identitas pasien.",
    "Pengguna: " + (profile.full_name || "pengguna") + (page ? ". Sedang membuka halaman: " + page : "") + ".",
    "DATA AUREKA (sesuai hak akses pengguna, JSON):",
    JSON.stringify(data),
  ].join("\n");

  const contents = [
    ...history.filter((h) => h && typeof h.text === "string" && h.text.trim()).map((h) => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 2000) }] })),
    { role: "user", parts: [{ text: question }] },
  ];

  const payload = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 1200 } });
  const call = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey }, body: payload,
  });
  // Model utama kadang sibuk (503) atau kuotanya habis (429): coba model cadangan sekali.
  stage = "panggil-gemini";
  let model = MODEL;
  let res = await call(model);
  if ([429, 500, 503].includes(res.status) && FALLBACK_MODEL !== MODEL) {
    console.warn("gemini", model, res.status, "-> fallback", FALLBACK_MODEL);
    model = FALLBACK_MODEL;
    res = await call(model);
  }
  if (res.status === 429) return reply(429, { error: "Kuota AI gratis sedang habis. Coba lagi beberapa menit lagi." });
  if (!res.ok) {
    console.error("gemini", model, res.status, (await res.text()).slice(0, 500));
    return reply(502, { error: "Layanan AI sedang sibuk. Coba lagi sebentar lagi." });
  }
  stage = "baca-jawaban";
  const out = await res.json();
  const answer = (out?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim();
  if (!answer) return reply(502, { error: "AI tidak memberikan jawaban. Coba ulangi dengan kalimat lain." });
  return reply(200, { answer, model });
}

// Semua error tak terduga tetap dibalas dengan header CORS + alasan singkat,
// supaya browser tidak hanya melihat "Failed to fetch" dan penyebabnya bisa dilacak.
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("aureka-tanya", stage, detail);
    return reply(500, { error: "Tanya AUREKA mengalami gangguan di server.", stage, detail: detail.slice(0, 300) });
  }
});
