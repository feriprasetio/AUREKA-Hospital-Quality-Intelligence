/**
 * NARA AI — governed skill registry and deterministic intent orchestration.
 * Registry metadata is executable routing policy, not UI navigation.
 */
export type NaraSkillId =
  | "executive" | "quality" | "statistics" | "clinical" | "patient_safety"
  | "risk" | "visual" | "knowledge" | "workforce" | "audit" | "research" | "data_quality"
  | "engineering" | "governance";

export type NaraSkill = {
  id: NaraSkillId;
  label: string;
  intents: RegExp[];
  domains: string[];
  instructions: string[];
  requiresAggregateData: boolean;
};

export const NARA_SKILL_REGISTRY: readonly NaraSkill[] = [
  { id: "executive", label: "Executive Intelligence", intents: [/direktur|manajemen|eksekutif|prioritas strategis|kinerja rumah sakit|dashboard pimpinan|keputusan strategis/i], domains: ["quality", "risk", "patient_safety", "governance"], instructions: ["Sintesis lintas domain untuk pimpinan: kondisi, gap, risiko, implikasi, dan keputusan yang diperlukan.", "Bedakan fakta, interpretasi, dan rekomendasi."], requiresAggregateData: true },
  { id: "quality", label: "Quality Intelligence", intents: [/mutu|indikator|inm|spm|capaian|target|logbook|belum input|belum lapor|pdsa|tren mutu/i], domains: ["quality"], instructions: ["Pisahkan profil indikator, definisi operasional, target, dan capaian aktual.", "Untuk status belum input, gunakan daftar unit tanpa entri pada periode yang tersedia; jangan menyimpulkan dari data yang gagal dimuat."], requiresAggregateData: true },
  { id: "statistics", label: "Statistical Intelligence", intents: [/statistik|statistika|signifikansi|p.value|confidence interval|interval kepercayaan|rerata|median|proporsi|persentase|korelasi|regresi|uji statistik|sampel|denominator|pembilang|penyebut/i], domains: [], instructions: ["Nyatakan unit analisis, numerator/denominator, periode, dan keterbatasan data.", "Jangan mengarang uji, nilai p, interval kepercayaan, atau ukuran sampel; hitung hanya bila data/engine mendukung. Data agregat hanya digunakan bila skill domain yang relevan juga terpilih."], requiresAggregateData: false },
  { id: "clinical", label: "Clinical Intelligence", intents: [/diagnosis|diagnosa|dpjp|icd.?10|penyakit|pasien|episode|klinis|clinical pathway|kematian|igd|konsul/i], domains: ["clinical"], instructions: ["Bedakan diagnosis terakhir per pasien dari diagnosis per episode/kunjungan.", "Kode ICD-10 yang belum disetujui harus disebut usulan; keputusan klinis dan koding final tetap pada reviewer berwenang."], requiresAggregateData: true },
  { id: "patient_safety", label: "Patient Safety Intelligence", intents: [/ikp|insiden|keselamatan pasien|ktd|knc|ktc|kpc|rca|investigasi|budaya keselamatan|survei/i], domains: ["patient_safety"], instructions: ["Gunakan agregat keselamatan pasien yang tersedia; jangan merekonstruksi kronologi atau identitas dari agregat.", "Pisahkan pelaporan insiden, investigasi, dan pembelajaran/perbaikan."], requiresAggregateData: true },
  { id: "risk", label: "Risk Intelligence", intents: [/risiko|risk|fmea|rpn|mitigasi|rencana tindak|rtp|konektor risiko|selera risiko/i], domains: ["risk"], instructions: ["Prioritaskan risiko berdasarkan tingkat, skor, status pengendalian, dan tenggat yang benar-benar tersedia.", "Jangan menyamakan jumlah risiko dengan besarnya eksposur; jelaskan keterbatasan register."], requiresAggregateData: true },
  { id: "visual", label: "Visual Intelligence", intents: [/grafik|visualisasi|diagram|infografis|chart|peta|heatmap|matriks|perbandingan visual|komposisi|proporsi visual/i], domains: [], instructions: ["Pilih bentuk visual sesuai struktur data: tren=garis, perbandingan=batang, komposisi=pie, dua dimensi kategorik=heatmap, likelihood×impact=matriks risiko.", "Setiap visual wajib menyebut unit analisis, denominator bila relevan, variabel, periode, sumber, dan keterbatasan; jangan membuat angka rekaan.", "Jangan menghasilkan peta geografis tanpa koordinat terverifikasi dan jangan mengubah kategori menjadi nilai numerik tanpa dasar. Visualisasi data rumah sakit hanya dibuat jika skill domain yang relevan juga terpilih."], requiresAggregateData: false },
  { id: "knowledge", label: "Knowledge Intelligence", intents: [/sop|spo|regulasi|peraturan|snars|starkes|standar|pedoman|kebijakan|definisi|apa itu|jelaskan konsep/i], domains: ["knowledge", "governance"], instructions: ["Bedakan pengetahuan umum dari dokumen internal AUREKA.", "Jangan mengklaim dokumen atau regulasi tertentu tersedia bila sumbernya tidak dimuat."], requiresAggregateData: false },
  { id: "workforce", label: "Workforce Intelligence", intents: [/sdm|tenaga|staf|pegawai|oppe|fppe|kompetensi|profesi|beban kerja|kinerja klinis/i], domains: ["workforce"], instructions: ["Gunakan ringkasan agregat profesi/unit/status; hindari nama dan evaluasi individu.", "Jangan membuat kesimpulan kinerja individual dari agregat."], requiresAggregateData: true },
  { id: "audit", label: "Audit Intelligence", intents: [/audit|kepatuhan|kelengkapan|temuan|verifikasi|validasi|evidence|bukti/i], domains: [], instructions: ["Rumuskan temuan berdasarkan kriteria, bukti, cakupan sampel, dan periode.", "Jangan menyebut patuh/tidak patuh tanpa denominator atau kriteria yang eksplisit. Data audit hanya digunakan bila skill domain yang relevan juga terpilih."], requiresAggregateData: false },
  { id: "research", label: "Research Intelligence", intents: [/penelitian|riset|jurnal|publikasi|scopus|q1|metodologi|hipotesis|variabel|plsem|pls.sem|regresi|validitas|reliabilitas/i], domains: [], instructions: ["Bedakan analisis eksploratif, inferensial, dan kausal.", "Jangan mengklaim novelty atau bukti literatur tanpa sumber yang dapat diverifikasi. Data rumah sakit hanya digunakan bila skill domain yang relevan juga terpilih."], requiresAggregateData: false },
  { id: "data_quality", label: "Data Quality Intelligence", intents: [/kualitas data|data quality|duplikasi|missing|kosong|anomali|inkonsisten|kelengkapan data|validitas data|rekonsiliasi/i], domains: [], instructions: ["Periksa kelengkapan, konsistensi, duplikasi, validitas rentang, dan provenance.", "Tandai data yang tidak terbaca sebagai missing/unavailable, bukan nol. Data operasional hanya dimuat bila pertanyaan secara eksplisit mengaktifkan skill domain terkait."], requiresAggregateData: false },
  { id: "engineering", label: "Engineering Intelligence", intents: [/supabase|next\.js|react|typescript|javascript|sql|database|basis data|schema|migrasi|migration|rls|edge function|api|frontend|backend|full.?stack|debug(?:ging)?|deploy(?:ment)?|ci\/?cd|github|repository|repositori|kode program|bug|error teknis|integrasi sistem|arsitektur sistem|performa aplikasi|pipeline/i], domains: ["engineering"], instructions: ["Berikan panduan rekayasa perangkat lunak yang spesifik: arsitektur, frontend, backend, API, Supabase, skema, migrasi, RLS, pengujian, dan CI/CD sesuai konteks yang benar-benar tersedia.", "Jangan mengklaim dapat membaca repository, menjalankan shell, mengubah kode, mengakses secret, mengeksekusi SQL, atau melakukan deployment dari gateway NARA apabila tool tersebut tidak tersedia.", "Jangan pernah meminta, menampilkan, atau menanam API key, service-role key, kredensial, token, URL privat, atau data pasien di kode klien. Untuk perubahan database, utamakan migrasi versioned, least privilege, RLS, dan pengujian."], requiresAggregateData: false },
  { id: "governance", label: "Governance Intelligence", intents: [/tata kelola|governance|dewan pengawas|rekomendasi dewan|rekomendasi manajemen|prioritas tahunan|program kerja|keputusan direksi|keputusan manajemen|kebijakan rumah sakit|pemantauan rtl|rencana tindak lanjut|akuntabilitas|penanggung jawab strategis/i], domains: ["governance", "quality", "risk", "patient_safety", "clinical", "workforce"], instructions: ["Sintesis tata kelola berdasarkan rekomendasi, prioritas, tindak lanjut, pemilik tanggung jawab, tenggat, dan indikator hasil yang tersedia.", "Pisahkan fakta data, interpretasi, risiko pelaksanaan, dan rekomendasi; jangan menyimpulkan kepatuhan atau efektivitas tanpa bukti dan periode yang memadai.", "Bedakan saran analitis dari keputusan Direksi, Dewan Pengawas, Komite Medik, atau pejabat berwenang. NARA tidak mengesahkan kebijakan, menutup temuan, atau mengubah status tindak lanjut."], requiresAggregateData: true },
];

const CROSS_DOMAIN = [
  { pattern: /mutu.*risiko|risiko.*mutu|indikator.*insiden|insiden.*indikator/i, ids: ["quality", "risk", "patient_safety"] as NaraSkillId[] },
  { pattern: /diagnosis.*mutu|mutu.*diagnosis|clinical pathway.*indikator/i, ids: ["clinical", "quality", "statistics"] as NaraSkillId[] },
  { pattern: /sdm.*mutu|mutu.*sdm|oppe.*risiko|risiko.*oppe/i, ids: ["workforce", "quality", "risk"] as NaraSkillId[] },
  { pattern: /supabase.*mutu|mutu.*supabase|integrasi sistem.*indikator|indikator.*integrasi sistem/i, ids: ["engineering", "quality"] as NaraSkillId[] },
  { pattern: /tata kelola.*risiko|risiko.*tata kelola|rtl.*risiko|risiko.*rtl/i, ids: ["governance", "risk"] as NaraSkillId[] },
  { pattern: /direktur|manajemen|eksekutif|strategis|prioritas rumah sakit/i, ids: ["executive", "quality", "risk", "patient_safety"] as NaraSkillId[] },
];

export function planNaraSkills(question: string): { primary: NaraSkillId; selected: NaraSkillId[]; labels: string[]; domains: string[]; instructions: string[]; requiresAggregateData: boolean; mode: "single-domain" | "cross-domain" } {
  const q = question.trim();
  const matched = NARA_SKILL_REGISTRY.filter((skill) => skill.intents.some((pattern) => pattern.test(q)));
  let selected = matched.map((skill) => skill.id);
  const cross = CROSS_DOMAIN.find((rule) => rule.pattern.test(q));
  if (cross) selected = [...new Set([...selected, ...cross.ids])];
  if (!selected.length) selected = ["knowledge"];
  // Keep orchestration bounded and deterministic; specialist skills are not invented by the model.
  selected = selected.slice(0, 5);
  const skills = selected.map((id) => NARA_SKILL_REGISTRY.find((skill) => skill.id === id)!).filter(Boolean);
  return {
    primary: selected[0],
    selected,
    labels: skills.map((skill) => skill.label),
    domains: [...new Set(skills.flatMap((skill) => skill.domains))],
    instructions: skills.flatMap((skill) => skill.instructions),
    requiresAggregateData: skills.some((skill) => skill.requiresAggregateData),
    mode: selected.length > 1 ? "cross-domain" : "single-domain",
  };
}
