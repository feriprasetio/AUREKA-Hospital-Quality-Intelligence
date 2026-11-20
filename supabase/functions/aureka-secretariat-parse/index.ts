// Deterministic Secretariat document reader. It does not call any generative-AI API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import JSZip from "https://esm.sh/jszip@3.10.1";
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ENGINE = "AUREKA Deterministic Secretariat Reader v1";
const MAX_SIZE = 15 * 1024 * 1024;
const MAX_TEXT = 240_000;
const ALLOWED_ROLES = ["ADMIN", "PMKP", "MANAGEMENT"];
const TYPES = ["undangan", "materi", "absensi", "notulensi", "gambar"];
const BUCKET = "aureka-documents";
const cors = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
  "Vary": "Origin",
};

function reply(status: number, body: unknown, origin: string) {
  const headers: Record<string, string> = { ...cors, "Content-Type": "application/json" };
  if (origin === "http://localhost:3000") headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}
function xmlText(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}
function clean(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ").trim();
}
function safeText(value: string) {
  return value.replace(/\r\n?/g, "\n").split("\n").map(clean).filter(Boolean).join("\n").slice(0, MAX_TEXT);
}
async function readPdf(file: Blob) {
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableWorker: true, useSystemFonts: true, isEvalSupported: false, verbosity: 0,
  });
  const document = await loading.promise;
  const pages: Array<{ page: number; lines: string[] }> = [];
  try {
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const page = await document.getPage(pageNo);
      const content = await page.getTextContent();
      const items: Array<{ y: number; x: number; text: string }> = [];
      for (const item of content.items as any[]) {
        if (!item || typeof item.str !== "string" || !item.str.trim()) continue;
        const transform = Array.isArray(item.transform) ? item.transform : [];
        items.push({ y: Math.round(Number(transform[5] || 0) / 2) * 2, x: Number(transform[4] || 0), text: item.str });
      }
      const grouped = new Map<number, Array<{ x: number; text: string }>>();
      for (const item of items) {
        const bucket = grouped.get(item.y) || [];
        bucket.push({ x: item.x, text: item.text });
        grouped.set(item.y, bucket);
      }
      const lines = [...grouped.entries()].sort((a, b) => b[0] - a[0])
        .map(([, row]) => clean(row.sort((a, b) => a.x - b.x).map((x) => x.text).join(" ")))
        .filter(Boolean);
      pages.push({ page: pageNo, lines });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return { text: pages.map((page) => "[HALAMAN " + page.page + "]\n" + page.lines.join("\n")).join("\n\n"), pageCount: pages.length, documentKind: "PDF", pageTextCount: pages.reduce((sum, page) => sum + page.lines.length, 0) };
}
async function readDocx(file: Blob) {
  const zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()));
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("Struktur utama DOCX tidak ditemukan.");
  const names = Object.keys(zip.files).filter((name) => /^word\/(?:header|footer)\d+\.xml$/i.test(name)).sort();
  const lines: string[] = [];
  for (const paragraph of documentXml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const text = [...paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((match) => xmlText(match[1])).join("");
    if (clean(text)) lines.push(clean(text));
  }
  for (const name of names) {
    const xml = await zip.file(name)?.async("string");
    if (!xml) continue;
    for (const paragraph of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
      const text = [...paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => xmlText(match[1])).join("");
      if (clean(text)) lines.push(clean(text));
    }
  }
  const images = Object.keys(zip.files).filter((name) => /^word\/media\//i.test(name));
  return { text: safeText(lines.join("\n")), pageCount: null, documentKind: "DOCX", pageTextCount: lines.length, embeddedImageCount: images.length };
}
function columnIndex(ref: string) {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] || "").toUpperCase();
  let n = 0;
  for (const char of letters) n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}
async function readXlsx(file: Blob) {
  const zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!workbookXml) throw new Error("Struktur workbook XLSX tidak ditemukan.");
  const relXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string") || "";
  const relationships = new Map<string, string>();
  for (const match of relXml.matchAll(/<Relationship\b([^>]+)\/?>/g)) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1] || "";
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1] || "";
    if (id && target) {
      const normalized = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : "xl/" + target.replace(/^\.?\//, "");
      relationships.set(id, normalized.replace(/xl\/\.\//g, "xl/"));
    }
  }
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string") || "";
  const shared = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((item) => xmlText(item[1])).join("")
  );
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]+)\/?>/g)) {
    const attrs = match[1];
    const name = attrs.match(/\bname="([^"]+)"/)?.[1] || "Sheet";
    const relId = attrs.match(/\br:id="([^"]+)"/)?.[1] || "";
    const path = relationships.get(relId);
    if (path) sheets.push({ name: xmlText(name), path });
  }
  const output: string[] = [];
  let totalRows = 0;
  for (const sheet of sheets.slice(0, 40)) {
    const xml = await zip.file(sheet.path)?.async("string");
    if (!xml) continue;
    output.push("[SHEET " + sheet.name + "]");
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = new Map<number, string>();
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const ref = cellMatch[1].match(/\br="([^"]+)"/)?.[1] || "";
        const type = cellMatch[1].match(/\bt="([^"]+)"/)?.[1] || "";
        const raw = cellMatch[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
        let value = "";
        if (type === "s") value = shared[Number(raw)] || "";
        else if (type === "inlineStr") value = [...cellMatch[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join("");
        else value = xmlText(raw);
        if (value) cells.set(columnIndex(ref), clean(value));
      }
      if (cells.size) {
        const ordered = [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([column, value]) => String.fromCharCode(65 + (column % 26)) + ": " + value);
        output.push(ordered.join(" | "));
        totalRows++;
      }
      if (totalRows >= 5000 || output.join("\n").length >= MAX_TEXT) break;
    }
    if (totalRows >= 5000 || output.join("\n").length >= MAX_TEXT) break;
  }
  return { text: safeText(output.join("\n")), pageCount: sheets.length || null, documentKind: "XLSX", pageTextCount: totalRows, sheetCount: sheets.length };
}
function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if ((char === "," || char === ";" || char === "\t") && !quoted) {
      row.push(cell); cell = "";
    } else if (char === "\n" && !quoted) {
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = "";
    } else cell += char;
    if (rows.length >= 5000) break;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows.map((cells) => cells.map((value, i) => String.fromCharCode(65 + (i % 26)) + ": " + clean(value)).join(" | "));
}
function imageInfo(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width: number | null = null, height: number | null = null;
  if (mime === "image/png" && bytes.length >= 24) {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mime === "image/gif" && bytes.length >= 10) {
    width = view.getUint16(6, true); height = view.getUint16(8, true);
  } else if (mime === "image/jpeg" && bytes.length >= 4) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1]; const length = view.getUint16(offset + 2);
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        height = view.getUint16(offset + 5); width = view.getUint16(offset + 7); break;
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return { width, height };
}
const MONTHS: Record<string,string> = {
  januari:"01",jan:"01",februari:"02",feb:"02",maret:"03",mar:"03",april:"04",apr:"04",
  mei:"05",juni:"06",jun:"06",juli:"07",jul:"07",agustus:"08",agu:"08",agt:"08",
  september:"09",sep:"09",oktober:"10",okt:"10",november:"11",nov:"11",desember:"12",des:"12",
};
function documentDate(text: string) {
  const source = text.replace(/,/g, " ");
  const numeric = source.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
  if (numeric) return numeric[3] + "-" + numeric[2].padStart(2,"0") + "-" + numeric[1].padStart(2,"0");
  const lower = source.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("id-ID");
  const named = lower.match(/\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/);
  if (named && MONTHS[named[2]]) return named[3] + "-" + MONTHS[named[2]] + "-" + named[1].padStart(2,"0");
  return null;
}
function parseMetadata(text: string, fileName: string, category: string, kind: string, pageCount: number | null, extra: Record<string,unknown> = {}) {
  const lines = text.split("\n").map(clean).filter(Boolean);
  const flat = text.replace(/\n/g, " ");
  const numberMatch = flat.match(/(?:nomor\s*(?:surat|dokumen)?|no\.?\s*(?:surat|dokumen)?)\s*[:.]?\s*([A-Z0-9][A-Z0-9./_-]{2,70})/i);
  const headingMatch = lines.slice(0, 30).find((line) =>
    line.length >= 5 && line.length <= 180 &&
    (/^(SURAT\s+UNDANGAN|UNDANGAN|NOTULENSI|BERITA ACARA|DAFTAR HADIR|DAFTAR ABSENSI|MATERI|LAPORAN|KEGIATAN|PELATIHAN|RAPAT)\b/i.test(line) ||
     (line === line.toLocaleUpperCase("id-ID") && /[A-Z]/.test(line)))
  );
  const titleMatch = flat.match(/(?:perihal|hal)\s*[:.]?\s*([^.\n]{4,180})/i);
  const title = clean(titleMatch?.[1] || headingMatch || fileName.replace(/\.[^.]+$/,"")).slice(0,300);
  const headings = [...new Set(lines.filter((line) => /^(agenda|pembahasan|hasil rapat|keputusan|kesimpulan|tindak lanjut|peserta|daftar hadir|tujuan|materi|waktu|tempat|perihal)\b/i.test(line)).slice(0,40))];
  const attendanceRowCount = category === "absensi" ? lines.filter((line) => /\b\d{1,3}\b/.test(line) && /[A-Za-zÀ-ÿ]{2,}/.test(line)).length : null;
  return {
    document_date: documentDate(text),
    document_number: numberMatch ? clean(numberMatch[1]).replace(/[;,]+$/,"").slice(0,100) : null,
    document_title: title,
    detected_headings: headings,
    extracted_line_count: lines.length,
    attendance_row_count: attendanceRowCount,
    page_count: pageCount,
    document_kind: kind,
    ...extra,
  };
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, ...(origin === "http://localhost:3000" ? { "Access-Control-Allow-Origin": origin } : {}) } });
  if (req.method !== "POST") return reply(405,{error:"Method not allowed"},origin);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i,"").trim();
  if (!jwt) return reply(401,{error:"Sesi pengguna tidak ditemukan."},origin);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return reply(500,{error:"Konfigurasi backend belum lengkap."},origin);
  let body: Record<string,unknown>; try { body = await req.json(); } catch { return reply(400,{error:"Format permintaan tidak valid."},origin); }
  const meetingId = typeof body.meeting_id === "string" ? body.meeting_id : "";
  const path = typeof body.storage_path === "string" ? body.storage_path : "";
  const fileName = typeof body.file_name === "string" ? body.file_name : "";
  const mime = typeof body.mime_type === "string" ? body.mime_type.toLowerCase() : "";
  const category = typeof body.document_type === "string" ? body.document_type : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meetingId)) return reply(400,{error:"Meeting ID tidak valid."},origin);
  if (!TYPES.includes(category)) return reply(400,{error:"Kategori dokumen tidak dikenal."},origin);
  if (!fileName || fileName.length > 180 || /[\/\\]/.test(fileName)) return reply(400,{error:"Nama file tidak valid."},origin);
  if (!path.startsWith("global/" + meetingId + "/" + category + "/") && !new RegExp("^\\d+/" + meetingId + "/" + category + "/").test(path)) return reply(400,{error:"Path objek tidak sesuai dengan Meeting ID atau kategori."},origin);

  const db = createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{autoRefreshToken:false,persistSession:false}});
  const {data:auth,error:authError}=await db.auth.getUser(jwt);
  if(authError||!auth.user)return reply(401,{error:"Sesi pengguna tidak valid."},origin);
  const {data:profile,error:profileError}=await db.schema("aureka_system").from("user_profiles")
    .select("is_active,role_id,must_change_password").eq("user_id",auth.user.id).maybeSingle();
  if(profileError||!profile?.is_active||profile.must_change_password)return reply(403,{error:"Akun tidak aktif atau masih wajib mengganti password."},origin);
  const {data:role,error:roleError}=await db.schema("aureka_system").from("app_roles")
    .select("code,is_active").eq("id",profile.role_id).maybeSingle();
  if(roleError||!role?.is_active||!ALLOWED_ROLES.includes(role.code))return reply(403,{error:"Role tidak memiliki kewenangan untuk membaca dokumen sekretariat."},origin);
  const {data:meeting,error:meetingError}=await db.schema("aureka_system").from("pmkp_meetings")
    .select("id,room_id").eq("id",meetingId).maybeSingle();
  if(meetingError||!meeting)return reply(404,{error:"Register kegiatan tidak ditemukan atau akses unit ditolak."},origin);
  if(meeting.room_id===null&&!["ADMIN","PMKP","MANAGEMENT"].includes(role.code))return reply(403,{error:"Register seluruh rumah sakit memerlukan role pengelola sekretariat."},origin);
  if(meeting.room_id!==null&&!path.startsWith(String(meeting.room_id)+"/"+meetingId+"/"))return reply(403,{error:"Path berkas tidak sesuai dengan unit register."},origin);

  try {
    const {data:file,error:downloadError}=await db.storage.from(BUCKET).download(path);
    if(downloadError||!file)return reply(404,{error:"File sumber tidak ditemukan atau akses Storage ditolak."},origin);
    if(file.size<1||file.size>MAX_SIZE)return reply(413,{error:"Ukuran file harus 1 byte sampai 15 MB."},origin);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "", kind = "UNSUPPORTED", pageCount: number|null = null, extra: Record<string,unknown> = {};
    const extension = fileName.toLowerCase().split(".").pop() || "";
    if (mime === "application/pdf" || extension === "pdf") {
      const result = await readPdf(file); text = result.text; pageCount = result.pageCount; kind = result.documentKind; extra.page_text_count = result.pageTextCount;
    } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") {
      const result = await readDocx(file); text = result.text; pageCount = result.pageCount; kind = result.documentKind; extra.embedded_image_count = result.embeddedImageCount;
    } else if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || extension === "xlsx") {
      const result = await readXlsx(file); text = result.text; pageCount = result.pageCount; kind = result.documentKind; extra = {sheet_count:result.sheetCount,total_rows:result.pageTextCount};
    } else if (mime === "text/csv" || extension === "csv" || mime === "text/plain" || extension === "txt") {
      const raw = new TextDecoder("utf-8",{fatal:false}).decode(bytes);
      text = safeText(extension === "csv" || mime === "text/csv" ? parseCsv(raw).join("\n") : raw);
      kind = extension === "csv" || mime === "text/csv" ? "CSV" : "TXT";
      extra.row_count = text.split("\n").length;
    } else if (mime.startsWith("image/") || ["png","jpg","jpeg","webp","gif"].includes(extension)) {
      kind = "IMAGE";
      extra = {image_mime_type:mime,image_bytes:bytes.length,...imageInfo(bytes,mime)};
      text = "";
    } else {
      return reply(415,{error:"Format belum didukung. Gunakan PDF, DOCX, XLSX, CSV, TXT atau PNG/JPG/WEBP/GIF."},origin);
    }
    const clipped = text.slice(0,MAX_TEXT);
    const scanned = (kind === "PDF" && !clipped.trim());
    const notes: string[] = [];
    if (kind === "IMAGE") notes.push("Gambar disimpan dan dapat ditinjau melalui pratinjau. Pembacaan teks/OCR gambar tidak dijalankan agar proses tidak menggunakan API AI atau mengarang isi.");
    if (scanned) notes.push("PDF tidak memiliki lapisan teks digital yang terbaca. Kemungkinan berupa hasil pemindaian; perlu peninjauan manual atau OCR lokal terpisah.");
    if (kind === "DOCX" && Number(extra.embedded_image_count || 0) > 0) notes.push("Dokumen mengandung gambar. Elemen teks dibaca, sedangkan tulisan yang hanya berada di dalam gambar tidak diekstrak.");
    if (!notes.length) notes.push("Teks diekstrak secara deterministik di Edge Function AUREKA. Tidak ada konten yang dikirim ke API AI eksternal.");
    const metadata = parseMetadata(clipped,fileName,category,kind,pageCount,extra);
    return reply(200,{
      success:true,
      extraction_engine:ENGINE,
      extraction_status:kind==="IMAGE"?"metadata_only":scanned?"manual_review":clipped.trim()?"completed":"metadata_only",
      extracted_text:clipped,
      parsed_metadata:metadata,
      notes,
      file:{name:fileName,mime_type:mime,size_bytes:file.size,sha256:null,storage_path:path},
    },origin);
  } catch(error) {
    console.error("aureka-secretariat-reader",error);
    return reply(422,{error:error instanceof Error?error.message:"Dokumen tidak dapat dibaca oleh parser deterministik AUREKA."},origin);
  }
});