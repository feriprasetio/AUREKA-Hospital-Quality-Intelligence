import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 768;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 500_000;
const MAX_CHUNKS = 120;
const CHUNK_CHARS = 3_500;
const CHUNK_OVERLAP = 350;
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
  "Vary": "Origin",
};
function reply(status: number, body: unknown, origin = "") {
  const headers: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (origin === "http://localhost:3000") headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}
function base64(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    raw += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(raw);
}
function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}
async function extractDocx(file: Blob) {
  const zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()));
  const names = Object.keys(zip.files).filter((n) => /^word\/(document|header\d+|footer\d+)\.xml$/i.test(n)).sort();
  const blocks: string[] = [];
  for (const name of names) {
    const xml = await zip.file(name)?.async("string");
    if (!xml) continue;
    for (const paragraph of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
      const text = [...paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((x) => decodeXml(x[1])).join("").trim();
      if (text) blocks.push(text);
    }
  }
  const imageCount = Object.keys(zip.files).filter((n) => /^word\/media\//i.test(n)).length;
  if (imageCount > 0) blocks.push("[Catatan: dokumen mengandung gambar/diagram yang perlu ditinjau secara visual.]");
  return blocks.join("\n");
}
async function extractPdf(file: Blob) {
  if (!GEMINI_API_KEY) throw new Error("Secret GEMINI_API_KEY belum dikonfigurasi.");
  const model = Deno.env.get("GEMINI_DOCUMENT_MODEL") || Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest";
  const payload = {
    contents: [{
      role: "user",
      parts: [
        { text: "Ekstrak isi teks PDF rumah sakit ini selengkap mungkin sesuai urutan halaman. Pertahankan judul, nomor dokumen, isi tabel, butir prosedur dan catatan kaki. Jangan merangkum, mengarang, menormalkan, atau menambahkan informasi yang tidak tertulis. Gunakan penanda [HALAMAN n] bila dapat dikenali. Jika bagian berupa gambar/scan tidak terbaca, tulis [TEKS TIDAK TERBACA] pada bagian terkait. Keluarkan teks saja." },
        { inline_data: { mime_type: "application/pdf", data: base64(new Uint8Array(await file.arrayBuffer())) } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 16000 },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("PDF extraction provider returned HTTP " + response.status + ".");
    const text = (body?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("\n").trim();
    if (!text) throw new Error("Mesin ekstraksi tidak mengembalikan teks PDF.");
    return { text, model };
  } finally {
    clearTimeout(timer);
  }
}
function makeChunks(input: string) {
  const text = input.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, MAX_EXTRACTED_CHARS);
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_CHARS, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf("\n", end);
      if (boundary > start + 1_800) end = boundary;
    }
    const content = text.slice(start, end).trim();
    if (content.length >= 30) chunks.push(content);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return { chunks, truncated: text.length >= MAX_EXTRACTED_CHARS || chunks.length >= MAX_CHUNKS };
}
async function embedBatch(texts: string[]) {
  const modelPath = "models/" + EMBEDDING_MODEL;
  const requests = texts.map((text) => ({
    model: modelPath,
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + EMBEDDING_MODEL + ":batchEmbedContents", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({ requests }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Embedding provider returned HTTP " + response.status + ".");
    const embeddings = body?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) throw new Error("Jumlah embedding tidak sama dengan jumlah potongan dokumen.");
    return embeddings.map((item: any) => {
      const values = item?.values;
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS || values.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n))) {
        throw new Error("Dimensi/format embedding tidak sesuai kontrak 768 dimensi.");
      }
      return values as number[];
    });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, ...(origin === "http://localhost:3000" ? { "Access-Control-Allow-Origin": origin } : {}) } });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return reply(401, { error: "Sesi pengguna tidak ditemukan." }, origin);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return reply(500, { error: "Konfigurasi backend belum lengkap." }, origin);
  if (!GEMINI_API_KEY) return reply(503, { error: "Secret GEMINI_API_KEY belum tersedia di Supabase." }, origin);

  let request: Record<string, unknown>;
  try { request = await req.json(); } catch { return reply(400, { error: "Format permintaan tidak valid." }, origin); }
  const versionId = typeof request.document_version_id === "string" ? request.document_version_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(versionId)) {
    return reply(400, { error: "document_version_id tidak valid." }, origin);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: "Bearer " + jwt } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: auth, error: authError } = await db.auth.getUser(jwt);
  if (authError || !auth.user) return reply(401, { error: "Sesi pengguna tidak valid." }, origin);
  const { data: rateLimited, error: rateLimitError } = await db.rpc(
    "aureka_consume_user_rate_limit",
    { p_bucket: "document_ingest" },
  );
  if (rateLimitError || typeof rateLimited !== "boolean") {
    console.error("document-ingest persistent rate limit", rateLimitError);
    return reply(503, { error: "Layanan pembatasan pemrosesan dokumen sementara tidak tersedia." }, origin);
  }
  if (rateLimited) {
    return reply(429, { error: "Batas pemrosesan dokumen 5 permintaan per menit telah tercapai." }, origin);
  }

  const { data: profile, error: profileError } = await db.schema("aureka_system").from("user_profiles")
    .select("is_active, deactivated_at, role_id, must_change_password").eq("user_id", auth.user.id).maybeSingle();
  if (profileError || !profile?.is_active || profile.deactivated_at || profile.must_change_password) {
    return reply(403, { error: "Akun tidak aktif atau masih wajib mengganti password." }, origin);
  }
  const { data: role, error: roleError } = await db.schema("aureka_system").from("app_roles")
    .select("code,is_active").eq("id", profile.role_id).maybeSingle();
  const allowedRoles = ["ADMIN", "PMKP", "MANAGEMENT", "KABID", "DIREKTUR"];
  if (roleError || !role?.is_active || !allowedRoles.includes(role.code)) {
    return reply(403, { error: "Role akun tidak memiliki kewenangan mengelola dokumen terkendali." }, origin);
  }

  const versions = db.schema("aureka_system").from("controlled_document_versions");
  const documents = db.schema("aureka_system").from("controlled_documents");
  const jobs = db.schema("aureka_system").from("knowledge_ingestion_jobs");
  let version: any = null;
  let job: any = null;
  try {
    const { data: v, error: vError } = await versions.select("*").eq("id", versionId).single();
    if (vError || !v) return reply(404, { error: "Versi dokumen tidak ditemukan atau akses ditolak." }, origin);
    version = v;
    const { data: document, error: dError } = await documents.select("id,document_code,title,document_type,owner_room_id,status")
      .eq("id", version.document_id).single();
    if (dError || !document) return reply(404, { error: "Metadata dokumen tidak ditemukan atau akses ditolak." }, origin);
    const { data: j, error: jError } = await jobs.select("*").eq("document_version_id", versionId).single();
    if (jError || !j) return reply(404, { error: "Antrean knowledge ingestion tidak ditemukan." }, origin);
    const jobCandidate = j;
    if (jobCandidate.status === "completed" && version.analysis_status === "completed") {
      return reply(200, { success: true, already_processed: true, document_version_id: versionId }, origin);
    }
    if (jobCandidate.status === "cancelled") {
      return reply(409, { error: "Antrean pemrosesan dokumen telah dibatalkan." }, origin);
    }

    // Atomic claim prevents two concurrent requests from processing the same document version.
    const { data: claim, error: claimError } = await db.schema("aureka_system").rpc(
      "claim_document_ingestion_job",
      { p_document_version_id: versionId },
    );
    if (claimError) throw new Error("Antrean tidak dapat diklaim secara atomik.");
    if (!claim?.claimed) {
      return reply(409, { error: "Dokumen sedang diproses worker lain, belum masuk waktu retry, atau batas percobaan telah tercapai." }, origin);
    }
    job = {
      id: claim.job_id,
      attempts: Number(claim.attempts || 1),
      max_attempts: Number(claim.max_attempts || 5),
    };

    const bucket = String(version.bucket_id || "aureka-documents");
    const path = String(version.object_path || "");
    if (!path || path.startsWith("/") || path.includes("..")) throw new Error("Path objek dokumen tidak valid.");
    const { data: file, error: fileError } = await db.storage.from(bucket).download(path);
    if (fileError || !file) throw new Error("File sumber tidak ditemukan atau Storage menolak akses.");
    if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error("Ukuran dokumen melewati batas ingest 15 MB.");

    const mime = String(version.mime_type || "").toLowerCase();
    let extractedText = "";
    let extractionModel = "docx-jszip";
    if (mime === "application/pdf" || /\.pdf$/i.test(String(version.original_filename || ""))) {
      const result = await extractPdf(file);
      extractedText = result.text;
      extractionModel = result.model;
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx$/i.test(String(version.original_filename || ""))
    ) {
      extractedText = await extractDocx(file);
    } else {
      throw new Error("Format ingest saat ini hanya PDF dan DOCX.");
    }

    if (!extractedText.trim()) throw new Error("Tidak ada teks yang dapat diekstrak dari dokumen.");
    const split = makeChunks(extractedText);
    if (!split.chunks.length) throw new Error("Teks dokumen terlalu pendek untuk proses knowledge ingestion.");

    const { error: removeError } = await db.schema("aureka_system").from("knowledge_chunks")
      .delete().eq("document_version_id", versionId);
    if (removeError) throw new Error("Chunk lama tidak dapat diganti secara aman.");

    let inserted = 0;
    for (let offset = 0; offset < split.chunks.length; offset += 16) {
      const page = split.chunks.slice(offset, offset + 16);
      const embeddingInputs = page.map((content, i) =>
        "title: " + String(document.title || "") + "\ndocument_code: " + String(document.document_code || "") +
        "\nchunk: " + String(offset + i + 1) + "\ncontent:\n" + content
      );
      const embeddings = await embedBatch(embeddingInputs);
      const rows = page.map((content, i) => ({
        document_id: document.id,
        document_version_id: versionId,
        chunk_no: offset + i,
        title: String(document.title || ""),
        content,
        embedding: embeddings[i],
        embedding_model: EMBEDDING_MODEL,
        room_id: document.owner_room_id,
        metadata: {
          document_code: document.document_code,
          document_type: document.document_type,
          extraction_model: extractionModel,
          source_filename: version.original_filename,
          chunk_index: offset + i + 1,
          chunk_total: split.chunks.length,
          truncated: split.truncated,
        },
      }));
      const { error: insertError } = await db.schema("aureka_system").from("knowledge_chunks").insert(rows);
      if (insertError) throw new Error("Penyimpanan knowledge chunk gagal.");
      inserted += rows.length;
    }

    const analysis = {
      extraction_method: extractionModel,
      embedding_model: EMBEDDING_MODEL,
      embedding_dimensions: EMBEDDING_DIMENSIONS,
      chunk_count: inserted,
      truncated: split.truncated,
      extracted_characters: Math.min(extractedText.length, MAX_EXTRACTED_CHARS),
      indexed_at: new Date().toISOString(),
    };
    const { error: versionSaveError } = await versions.update({
      extracted_text: extractedText.slice(0, MAX_EXTRACTED_CHARS),
      structured_sections: split.chunks.map((content: string, index: number) => ({ chunk_no: index, title: String(document.title || ""), characters: content.length })),
      ai_analysis: analysis,
      analysis_status: "completed",
      analysis_model: extractionModel + " + " + EMBEDDING_MODEL,
      analysis_error: null,
    }).eq("id", versionId);
    if (versionSaveError) throw new Error("Hasil analisis versi dokumen gagal disimpan.");
    const { error: jobDoneError } = await jobs.update({
      status: "completed", locked_at: null, locked_by: null, last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    if (jobDoneError) throw new Error("Status antrean tidak dapat diselesaikan.");

    return reply(200, {
      success: true,
      document_version_id: versionId,
      document_code: document.document_code,
      chunk_count: inserted,
      embedding_model: EMBEDDING_MODEL,
      embedding_dimensions: EMBEDDING_DIMENSIONS,
      extracted_characters: Math.min(extractedText.length, MAX_EXTRACTED_CHARS),
      truncated: split.truncated,
    }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pemrosesan dokumen gagal.";
    if (job?.id) {
      const attempts = Number(job.attempts || 1);
      const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 6)));
      await jobs.update({
        status: "failed", locked_at: null, locked_by: null, last_error: message.slice(0, 1000),
        available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
    }
    if (version?.id) {
      await versions.update({ analysis_status: "failed", analysis_error: message.slice(0, 1000) }).eq("id", version.id);
    }
    console.error("aureka-document-ingest", message);
    return reply(502, { error: message, document_version_id: versionId }, origin);
  }
});