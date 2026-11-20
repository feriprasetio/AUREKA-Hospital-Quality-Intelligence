// AUREKA SPO Analyzer: ekstraksi PDF/DOCX dengan Gemini di server. API key tidak pernah dikirim ke browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

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

function response(status:number, body:unknown, origin:string) {
  const headers: Record<string,string> = {...cors, "Content-Type":"application/json"};
  if (origin === "http://localhost:3000") headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), {status,headers});
}
function decodeXml(v:string) {
  return v.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'").replace(/&amp;/g,"&")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function b64(bytes:Uint8Array) {
  let raw="";
  for(let i=0;i<bytes.length;i+=0x8000) raw+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
  return btoa(raw);
}
async function readDocx(file:Blob) {
  const zip=await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()));
  const xmlNames=Object.keys(zip.files).filter(n=>/^word\/(document|header\d+|footer\d+)\.xml$/i.test(n));
  const paragraphs:string[]=[];
  for(const name of xmlNames){
    const xml=await zip.file(name)?.async("string");
    if(!xml)continue;
    for(const p of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)){
      const text=[...p[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x=>decodeXml(x[1])).join("").trim();
      if(text)paragraphs.push(text);
    }
  }
  const images:Array<{inline_data:{mime_type:string;data:string}}>=[];let total=0;
  const media=Object.keys(zip.files).filter(n=>/^word\/media\/.+\.(png|jpe?g|webp)$/i.test(n)).slice(0,8);
  for(const name of media){
    const item=zip.file(name);if(!item)continue;
    const bytes=await item.async("uint8array");total+=bytes.byteLength;
    if(total>5*1024*1024)break;
    const ext=name.toLowerCase().split(".").pop()||"";
    const mime=ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";
    images.push({inline_data:{mime_type:mime,data:b64(bytes)}});
  }
  return {text:paragraphs.join("\n"),images,mediaCount:media.length};
}
function str(v:unknown,max=16000){return typeof v==="string"?v.trim().slice(0,max):""}
function stepsOf(v:unknown){
  if(!Array.isArray(v))return [];
  return v.slice(0,120).map((item,index)=>{
    if(typeof item==="string")return {step_number:index+1,content:item.trim().slice(0,5000)};
    const s=item&&typeof item==="object"?item as Record<string,unknown>:{};
    return {step_number:Number.isFinite(Number(s.step_number))?Number(s.step_number):index+1,content:str(s.content??s.description,5000)};
  }).filter(s=>s.content);
}
function normalize(value:unknown){
  const r=value&&typeof value==="object"?value as Record<string,unknown>:{};
  const arr=(v:unknown,max=100)=>Array.isArray(v)?v.map(x=>str(x,1000)).filter(Boolean).slice(0,max):[];
  const date=str(r.issue_date,20);
  return {
    title:str(r.title,300),document_number:str(r.document_number,160),revision_number:str(r.revision_number,40)||"00",
    page_count:Number.isInteger(Number(r.page_count))&&Number(r.page_count)>0?Number(r.page_count):null,
    issue_date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:"",
    approval_title:str(r.approval_title,160),approval_name:str(r.approval_name,200),approval_identifier:str(r.approval_identifier,80),
    understanding:str(r.understanding),purpose:str(r.purpose),policy:str(r.policy),procedure_steps:stepsOf(r.procedure_steps),
    related_units:arr(r.related_units),flowchart_mermaid:str(r.flowchart_mermaid,12000),
    analysis_notes:arr(r.analysis_notes,30),confidence:r.confidence&&typeof r.confidence==="object"?r.confidence:null,
  };
}
const INSTRUCTIONS=`Anda adalah mesin ekstraksi dokumen Standar Prosedur Operasional (SPO) rumah sakit.
Baca semua halaman, tabel, header, footer, dan diagram yang terlihat. Keluarkan SATU objek JSON valid saja tanpa Markdown.
Ekstrak sesuai sumber. Jangan mengarang, melengkapi dengan pengetahuan umum, atau memperbaiki isi.
Pertahankan istilah, nomor dokumen, revisi, tanggal, nama pejabat, NIP, dan urutan prosedur.
Jika tidak ada atau tidak terbaca, gunakan string kosong, null, atau array kosong sesuai tipe.
Nama/jabatan pada lembar persetujuan adalah informasi dokumen; jangan menyatakan bahwa dokumen telah disahkan secara elektronik oleh AUREKA.
Field:
{
 "title":string,"document_number":string,"revision_number":string,"page_count":number|null,
 "issue_date":"YYYY-MM-DD" atau "",
 "approval_title":string,"approval_name":string,"approval_identifier":string,
 "understanding":string,"purpose":string,"policy":string,
 "procedure_steps":[{"step_number":number,"content":string}],
 "related_units":[string],
 "flowchart_mermaid":string atau "",
 "analysis_notes":[string],
 "confidence":{"metadata":"high|medium|low","text":"high|medium|low","flowchart":"high|medium|low|not_present"}
}
Flowchart hanya diisi jika diagram alir benar-benar terlihat dalam sumber. Jangan membuat diagram baru dari prosedur bernomor.
Konversi tanggal Indonesia ke YYYY-MM-DD hanya jika tanggal jelas. Catat teks samar, konflik, atau tabel yang tidak terbaca dalam analysis_notes.`;

async function analyze(parts:unknown[],key:string){
  const models=[Deno.env.get("GEMINI_MODEL")||"gemini-flash-lite-latest",Deno.env.get("GEMINI_FALLBACK_MODEL")||"gemini-flash-latest"];
  let last="Mesin analisis dokumen belum tersedia.";
  for(const model of [...new Set(models)]){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),65000);
    try{
      const res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{
        method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,
        body:JSON.stringify({contents:[{role:"user",parts}],generationConfig:{responseMimeType:"application/json",temperature:0.1,maxOutputTokens:9000}}),
      });
      const body=await res.json().catch(()=>({}));
      if(!res.ok){last=str(body?.error?.message,400)||"Gemini HTTP "+res.status;if([404,429,500,502,503,504].includes(res.status))continue;break;}
      const text=(body?.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||"").join("").trim();
      if(!text){last="Mesin AI tidak mengembalikan hasil.";continue;}
      const json=JSON.parse(text.replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim());
      return {extracted:normalize(json),engine:model};
    }catch(error){last=error instanceof Error?error.message:String(error);if(error instanceof DOMException&&error.name==="AbortError")last="Analisis dokumen melebihi batas waktu.";}
    finally{clearTimeout(timer);}
  }
  throw new Error(last);
}

Deno.serve(async(req)=>{
  const origin=req.headers.get("Origin")||"";
  if(req.method==="OPTIONS")return new Response("ok",{headers:{...cors,...(origin==="http://localhost:3000"?{"Access-Control-Allow-Origin":origin}:{})}});
  if(req.method!=="POST")return response(405,{error:"Method not allowed"},origin);
  const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!jwt)return response(401,{error:"Sesi pengguna tidak ditemukan."},origin);
  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return response(400,{error:"Format permintaan tidak valid."},origin);}
  const path=typeof body.storage_path==="string"?body.storage_path:"";
  const name=typeof body.file_name==="string"?body.file_name:"";
  const mime=typeof body.mime_type==="string"?body.mime_type:"";
  if(!/^spo\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i.test(path))return response(400,{error:"Path file SPO tidak valid."},origin);
  if(!((mime===PDF&&/\.pdf$/i.test(name))||(mime===DOCX&&/\.docx$/i.test(name))))return response(415,{error:"Hanya PDF dan DOCX yang didukung."},origin);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),key=Deno.env.get("GEMINI_API_KEY");
  if(!url||!anon)return response(500,{error:"Konfigurasi autentikasi backend belum lengkap."},origin);
  if(!key)return response(503,{error:"Secret GEMINI_API_KEY belum dikonfigurasi di Supabase. File tetap berada privat dan dapat dilengkapi manual."},origin);

  const supabase=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{autoRefreshToken:false,persistSession:false}});
  const {data:auth,error:authErr}=await supabase.auth.getUser(jwt);
  if(authErr||!auth.user)return response(401,{error:"Sesi pengguna tidak valid."},origin);
  const {data:profile,error:profileErr}=await supabase.schema("aureka_system").from("user_profiles")
    .select("is_active,role_id,must_change_password").eq("user_id",auth.user.id).maybeSingle();
  if(profileErr||!profile?.is_active||profile.must_change_password)return response(403,{error:"Akun tidak aktif atau masih wajib mengganti password."},origin);
  const {data:role,error:roleErr}=await supabase.schema("aureka_system").from("app_roles").select("code,is_active").eq("id",profile.role_id).maybeSingle();
  if(roleErr||!role?.is_active||!ROLES.includes(role.code))return response(403,{error:"Role akun tidak memiliki kewenangan unggah dan analisis SPO."},origin);

  try{
    const {data:file,error:downloadErr}=await supabase.storage.from("aureka-documents").download(path);
    if(downloadErr||!file)return response(404,{error:"File sumber tidak ditemukan atau akses Storage ditolak."},origin);
    if(file.size<1||file.size>MAX_SIZE)return response(413,{error:"Ukuran berkas melewati batas analisis 15 MB."},origin);
    const parts:any[]=[{text:INSTRUCTIONS}];
    if(mime===PDF)parts.push({inline_data:{mime_type:PDF,data:b64(new Uint8Array(await file.arrayBuffer()))}});
    else{
      const doc=await readDocx(file);
      if(!doc.text.trim())return response(422,{error:"Teks DOCX tidak dapat diekstrak. Periksa file atau gunakan PDF."},origin);
      parts.push({text:"TEKS HASIL EKSTRAKSI DOCX (urutan paragraf/tabel dipertahankan):\n"+doc.text.slice(0,120000)});
      parts.push(...doc.images);
      if(doc.mediaCount>doc.images.length)parts.push({text:"Sebagian gambar DOCX tidak disertakan karena batas ukuran analisis."});
    }
    const result=await analyze(parts,key);
    if(!result.extracted.title)return response(422,{error:"Judul SPO tidak berhasil diidentifikasi. Lengkapi secara manual.",extracted:result.extracted},origin);
    return response(200,{success:true,extracted:result.extracted,engine:result.engine},origin);
  }catch(error){console.error("aureka-spo-analyze",error);return response(502,{error:error instanceof Error?error.message:"Analisis SPO gagal."},origin);}
});
