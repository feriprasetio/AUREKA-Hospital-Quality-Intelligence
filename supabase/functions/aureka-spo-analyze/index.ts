// Deterministic AUREKA SPO parser. No generative-AI provider/API is called.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import JSZip from "https://esm.sh/jszip@3.10.1";
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
  "Vary": "Origin",
};
const ROLES = ["ADMIN", "PMKP", "MANAGEMENT", "KABID", "DIREKTUR"];
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_SIZE = 15 * 1024 * 1024;
const ENGINE = "AUREKA Local Document Parser v1";

function reply(status: number, body: unknown, origin: string) {
  const headers: Record<string, string> = { ...cors, "Content-Type": "application/json" };
  if (origin === "http://localhost:3000") headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}
function xmlText(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function cleanLine(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").trim();
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("id-ID").replace(/\s+/g, " ").trim();
}
function decodeXmlParagraphs(xml: string) {
  const out: string[] = [];
  for (const match of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const text = [...match[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(item => xmlText(item[1])).join("");
    const line = cleanLine(text);
    if (line) out.push(line);
  }
  return out;
}
async function extractDocx(file: Blob) {
  const zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()));
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Struktur utama DOCX (word/document.xml) tidak ditemukan.");
  const lines = decodeXmlParagraphs(xml);
  const shapeLabels = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
    .map(match => cleanLine(xmlText(match[1]))).filter(Boolean);
  const headerFooter: string[] = [];
  for (const name of Object.keys(zip.files).filter(path => /^word\/(?:header|footer)\d+\.xml$/i.test(path)).slice(0, 20)) {
    const content = await zip.file(name)?.async("string");
    if (content) headerFooter.push(...decodeXmlParagraphs(content));
  }
  let pageCount: number | null = null;
  const app = await zip.file("docProps/app.xml")?.async("string");
  const pageMatch = app?.match(/<Pages>(\d+)<\/Pages>/i);
  if (pageMatch) pageCount = Number(pageMatch[1]) || null;
  return { lines: [...headerFooter, ...lines], pageCount, drawingLabels: [...new Set(shapeLabels)].slice(0, 80), documentKind: "DOCX" };
}
async function extractPdf(file: Blob) {
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableWorker: true, useSystemFonts: true, isEvalSupported: false, verbosity: 0,
  });
  const document = await loading.promise;
  const pages: Array<{ page: number; lines: string[]; text: string }> = [];
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
        bucket.push({ x: item.x, text: item.text }); grouped.set(item.y, bucket);
      }
      const lines = [...grouped.entries()].sort((a,b)=>b[0]-a[0])
        .map(([,row])=>cleanLine(row.sort((a,b)=>a.x-b.x).map(x=>x.text).join(" "))).filter(Boolean);
      pages.push({ page: pageNo, lines, text: lines.join("\n") });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  const diagramPage = pages.find(page => /(?:diagram\s+alir|bagan\s+alir|flow\s*chart)/i.test(page.text)) || null;
  return { lines: pages.flatMap(page=>page.lines), pageCount: pages.length, diagramPage, drawingLabels: [], documentKind: "PDF" };
}
const SECTION_PATTERN = /^(?:\d+(?:\.\d+)*[.)]?|[A-Z][.)]|[IVXLCDM]+[.)])?\s*(PENGERTIAN|DEFINISI|TUJUAN|MAKSUD DAN TUJUAN|KEBIJAKAN|PROSEDUR|UNIT TERKAIT|UNIT YANG TERKAIT|REFERENSI|DOKUMEN TERKAIT|DISTRIBUSI|RUANG LINGKUP)\s*[:\-]?\s*(.*)$/i;
const SECTION_KEYS: Record<string,string> = {
  pengertian:"understanding", definisi:"understanding", tujuan:"purpose", "maksud dan tujuan":"purpose",
  kebijakan:"policy", prosedur:"procedure", "unit terkait":"related_units", "unit yang terkait":"related_units",
  referensi:"references", "dokumen terkait":"related_documents", distribusi:"distribution", "ruang lingkup":"scope",
};
function readSections(lines: string[]) {
  const result: Record<string,string[]> = {}; let active = "";
  for (const raw of lines) {
    const line = cleanLine(raw); if (!line) continue;
    const match = line.match(SECTION_PATTERN);
    if (match) {
      active = SECTION_KEYS[normalize(match[1])] || "";
      if (active) { result[active] ||= []; if (match[2]?.trim()) result[active].push(cleanLine(match[2])); }
      continue;
    }
    if (active) result[active].push(line);
  }
  return result;
}
function labelledValue(lines: string[], pattern: RegExp) {
  for (let i=0;i<lines.length;i++) {
    const match=cleanLine(lines[i]).match(pattern); if(!match)continue;
    const inline=cleanLine(match[1]||"").replace(/^[:\-–|]+\s*/,"");
    if(inline)return inline.slice(0,300);
    for(let j=i+1;j<Math.min(lines.length,i+4);j++){
      const next=cleanLine(lines[j]);
      if(next&&!/^(?:no\.?\s*dokumen|nomor\s*dokumen|no\.?\s*revisi|revisi|tanggal\s*terbit|tgl\.?\s*terbit|halaman)\b/i.test(next))return next.slice(0,300);
    }
  }
  return "";
}
const MONTHS:Record<string,string>={januari:"01",jan:"01",februari:"02",feb:"02",maret:"03",mar:"03",april:"04",apr:"04",mei:"05",juni:"06",jun:"06",juli:"07",jul:"07",agustus:"08",agu:"08",agt:"08",september:"09",sep:"09",oktober:"10",okt:"10",november:"11",nov:"11",desember:"12",des:"12"};
function isoDate(raw:string) {
  const value=cleanLine(raw).replace(/,/g," ");
  let match=value.match(/\b(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{4})\b/);
  if(match)return match[3]+"-"+match[2].padStart(2,"0")+"-"+match[1].padStart(2,"0");
  match=normalize(value).match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/);
  if(match&&MONTHS[match[2]])return match[3]+"-"+MONTHS[match[2]]+"-"+match[1].padStart(2,"0");
  return "";
}
function isBoilerplate(line:string) {
  const n=normalize(line);
  return !n||n.length<4||/^(upt|rsud|rumah sakit|standar operasional prosedur|standar prosedur operasional|dokumen terkendali|nomor dokumen|no dokumen|nomor revisi|no revisi|tanggal terbit|halaman|pengertian|tujuan|kebijakan|prosedur|unit terkait)\b/.test(n);
}
function pickTitle(lines:string[],fileName:string) {
  const candidates=lines.map(cleanLine).filter(line=>!isBoilerplate(line)&&line.length>=5&&line.length<=180);
  const upper=candidates.find(line=>line===line.toLocaleUpperCase("id-ID")&&/[A-Z]/.test(line));
  return (upper||candidates[0]||fileName.replace(/\.(pdf|docx)$/i,"")).slice(0,300);
}
function makeSteps(lines:string[]) {
  const out:Array<{step_number:number;content:string}>=[];
  for(const raw of lines){
    const line=cleanLine(raw);if(!line)continue;
    const match=line.match(/^(?:(?:\d+(?:\.\d+)*|[a-zA-Z])[.)]|[-•▪])\s*(.+)$/);
    if(match||!out.length)out.push({step_number:out.length+1,content:(match?.[1]||line).slice(0,5000)});
    else out[out.length-1].content=(out[out.length-1].content+" "+line).slice(0,5000);
    if(out.length>=120)break;
  }
  return out;
}
function approvalValues(lines:string[]) {
  const index=lines.findIndex(line=>/ditetapkan\s+oleh|disahkan\s+oleh/i.test(line));
  if(index<0)return {title:"",name:"",identifier:""};
  const items=lines.slice(index,index+8).map(cleanLine).filter(Boolean);
  const title=items.find(line=>/direktur|direksi|kepala\s+upt|kepala\s+rumah\s+sakit/i.test(line))||"";
  const identifier=items.find(line=>/\b(?:nip|nrp)\b\s*[:.]?\s*[0-9]{6,}/i.test(line))||"";
  const name=items.find(line=>line!==items[0]&&line!==title&&!/ditetapkan|disahkan|\b(?:nip|nrp)\b/i.test(line)&&/^[A-Z][A-Za-z .,'-]{2,100}$/.test(line))||"";
  return {title:title.slice(0,160),name:name.slice(0,200),identifier:identifier.slice(0,80)};
}
function parseStructuredSPO(input:{lines:string[];pageCount:number|null;drawingLabels:string[];diagramPage?:{page:number;lines:string[]}|null;documentKind:string},fileName:string) {
  const lines=input.lines.map(cleanLine).filter(Boolean), sections=readSections(lines);
  const documentNumber=labelledValue(lines,/(?:no\.?\s*dokumen|nomor\s*dokumen|no\.?\s*doc)\s*[:\-]?\s*(.*)$/i);
  const revision=labelledValue(lines,/(?:no\.?\s*revisi|nomor\s*revisi|revisi)\s*[:\-]?\s*(.*)$/i);
  const rawDate=labelledValue(lines,/(?:tanggal\s*terbit|tgl\.?\s*terbit)\s*[:\-]?\s*(.*)$/i);
  const rawPages=labelledValue(lines,/(?:jumlah\s*)?halaman\s*[:\-]?\s*(.*)$/i);
  const approval=approvalValues(lines), notes=[
    "Dokumen dibaca oleh parser deterministik AUREKA. Tidak ada isi dokumen yang dikirim ke API AI eksternal.",
    "Periksa hasil ekstraksi terhadap dokumen sumber sebelum draf diajukan untuk review dan pengesahan.",
  ];
  if(!lines.length)notes.push("Tidak ditemukan teks digital. Berkas mungkin berupa hasil pemindaian gambar; diperlukan OCR lokal untuk membaca isi scan.");
  for(const [key,label] of [["understanding","Pengertian"],["purpose","Tujuan"],["policy","Kebijakan"],["procedure","Prosedur"]] as const)if(!sections[key]?.length)notes.push("Bagian "+label+" tidak dikenali dari heading dokumen.");
  let flowchart:Record<string,unknown>|null=null;
  if(input.drawingLabels.length>=2)flowchart={format:"extracted_diagram_labels",labels:input.drawingLabels.slice(0,80),note:"Label teks objek diagram DOCX diekstrak. Hubungan panah dan tata letak visual tetap diperiksa melalui dokumen sumber."};
  else if(input.diagramPage&&input.diagramPage.lines.length>2)flowchart={format:"source_page_text",page_number:input.diagramPage.page,labels:input.diagramPage.lines.slice(0,40),note:"Teks pada halaman yang memuat heading diagram alir ditemukan. Arah panah dan tata letak visual tetap diperiksa melalui dokumen sumber."};
  if(flowchart)notes.push("Elemen teks diagram terdeteksi; diagram visual asli tetap berada di berkas sumber.");
  const related=(sections.related_units||[]).flatMap(x=>x.split(/[;,\n]+/)).map(cleanLine).filter(Boolean).slice(0,100);
  const pages=input.pageCount||Number(rawPages.match(/\d+/)?.[0])||null;
  const steps=makeSteps(sections.procedure||[]);
  return {
    title:pickTitle(lines,fileName),document_number:documentNumber,revision_number:revision.replace(/^revisi\s*/i,"").trim()||"00",
    page_count:pages,issue_date:isoDate(rawDate),approval_title:approval.title,approval_name:approval.name,approval_identifier:approval.identifier,
    understanding:(sections.understanding||[]).join("\n").slice(0,16000),purpose:(sections.purpose||[]).join("\n").slice(0,16000),
    policy:(sections.policy||[]).join("\n").slice(0,16000),procedure_steps:steps,related_units:related,flowchart,
    analysis_notes:notes,confidence:{metadata:documentNumber||rawDate?"medium":"low",text:steps.length&&sections.purpose?.length?"high":"medium",flowchart:flowchart?"medium":"not_present"},
  };
}
async function parseDocument(file:Blob,mime:string,fileName:string) {
  const parsed=mime===PDF?await extractPdf(file):await extractDocx(file);
  return {success:true,extracted:parseStructuredSPO(parsed,fileName),engine:ENGINE};
}
Deno.serve(async(req)=>{
  const origin=req.headers.get("Origin")||"";
  if(req.method==="OPTIONS")return new Response("ok",{headers:{...cors,...(origin==="http://localhost:3000"?{"Access-Control-Allow-Origin":origin}:{})}});
  if(req.method!=="POST")return reply(405,{error:"Method not allowed"},origin);
  const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!jwt)return reply(401,{error:"Sesi pengguna tidak ditemukan."},origin);
  let body:Record<string,unknown>;try{body=await req.json();}catch{return reply(400,{error:"Format permintaan tidak valid."},origin);}
  const path=typeof body.storage_path==="string"?body.storage_path:"",fileName=typeof body.file_name==="string"?body.file_name:"",mime=typeof body.mime_type==="string"?body.mime_type:"";
  if(!/^spo\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i.test(path))return reply(400,{error:"Path file SPO tidak valid."},origin);
  if(!((mime===PDF&&/\.pdf$/i.test(fileName))||(mime===DOCX&&/\.docx$/i.test(fileName))))return reply(415,{error:"Hanya PDF dan DOCX yang didukung."},origin);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!anon)return reply(500,{error:"Konfigurasi autentikasi backend belum lengkap."},origin);
  const supabase=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{autoRefreshToken:false,persistSession:false}});
  const {data:auth,error:authError}=await supabase.auth.getUser(jwt);
  if(authError||!auth.user)return reply(401,{error:"Sesi pengguna tidak valid."},origin);
  const {data:profile,error:profileError}=await supabase.schema("aureka_system").from("user_profiles").select("is_active,role_id,must_change_password").eq("user_id",auth.user.id).maybeSingle();
  if(profileError||!profile?.is_active||profile.must_change_password)return reply(403,{error:"Akun tidak aktif atau masih wajib mengganti password."},origin);
  const {data:role,error:roleError}=await supabase.schema("aureka_system").from("app_roles").select("code,is_active").eq("id",profile.role_id).maybeSingle();
  if(roleError||!role?.is_active||!ROLES.includes(role.code))return reply(403,{error:"Role akun tidak memiliki kewenangan mengunggah dan membaca SPO."},origin);
  try{
    const {data:file,error:downloadError}=await supabase.storage.from("aureka-documents").download(path);
    if(downloadError||!file)return reply(404,{error:"Berkas sumber tidak ditemukan atau akses Storage ditolak."},origin);
    if(file.size<1||file.size>MAX_SIZE)return reply(413,{error:"Ukuran dokumen melewati batas 15 MB."},origin);
    return reply(200,await parseDocument(file,mime,fileName),origin);
  }catch(error){console.error("aureka-spo-parser",error);return reply(422,{error:error instanceof Error?error.message:"Dokumen tidak dapat dibaca oleh parser AUREKA."},origin);}
});
