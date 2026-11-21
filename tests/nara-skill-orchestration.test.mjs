import test from "node:test";
import assert from "node:assert/strict";
import { planNaraSkills, isNaraSmallTalk, NARA_SKILL_REGISTRY } from "../supabase/functions/aureka-tanya/skills.ts";
import { scopeSnapshotForSkills } from "../supabase/functions/aureka-tanya/skill-policy.ts";

test("registry exposes fourteen specialist skill families", () => {
  assert.equal(NARA_SKILL_REGISTRY.length, 14);
});

test("quality intent routes to Quality Intelligence", () => {
  const plan = planNaraSkills("Unit mana yang belum input logbook mutu triwulan ini?");
  assert.equal(plan.primary, "quality");
  assert.ok(plan.selected.includes("quality"));
});

test("risk and quality questions compose cross-domain skills", () => {
  const plan = planNaraSkills("Analisis hubungan capaian indikator mutu dan risiko rumah sakit");
  assert.equal(plan.mode, "cross-domain");
  assert.ok(plan.selected.includes("quality"));
  assert.ok(plan.selected.includes("risk"));
});

test("quality skill does not implicitly activate governance data", () => {
  const plan = planNaraSkills("Analisis tren capaian indikator mutu dan logbook.");
  assert.ok(plan.selected.includes("quality"));
  assert.ok(plan.domains.includes("quality"));
  assert.ok(!plan.domains.includes("governance"));
});

test("generic data-quality review does not automatically load multiple hospital domains", () => {
  const plan = planNaraSkills("Periksa kualitas data, duplikasi, missing, dan inkonsistensi.");
  assert.deepEqual(plan.selected, ["data_quality"]);
  assert.deepEqual(plan.domains, []);
  assert.equal(plan.requiresAggregateData, false);
});

test("risk-management terminology does not activate executive intelligence", () => {
  const plan = planNaraSkills("Jelaskan SOP manajemen risiko rumah sakit.");
  assert.ok(plan.selected.includes("risk"));
  assert.ok(plan.selected.includes("knowledge"));
  assert.ok(!plan.selected.includes("executive"));
  assert.ok(!plan.domains.includes("governance"));
});

test("director-level strategy questions still activate executive intelligence", () => {
  const plan = planNaraSkills("Direktur membutuhkan prioritas strategis dan kinerja rumah sakit.");
  assert.equal(plan.primary, "executive");
  assert.ok(plan.domains.includes("governance"));
  assert.ok(plan.domains.includes("quality"));
});

test("general knowledge enrichment does not inject governance data into a risk question", () => {
  const plan = planNaraSkills("Jelaskan SOP manajemen risiko rumah sakit.");
  assert.ok(plan.selected.includes("risk"));
  assert.ok(plan.selected.includes("knowledge"));
  assert.ok(plan.domains.includes("risk"));
  assert.ok(!plan.domains.includes("governance"));
});

test("clinical coding routes through clinical specialist", () => {
  const plan = planNaraSkills("Tolong telaah diagnosis DPJP dan usulan ICD-10");
  assert.equal(plan.primary, "clinical");
  assert.ok(plan.domains.includes("clinical"));
});

test("unmatched intent safely falls back to knowledge without inventing tools", () => {
  const plan = planNaraSkills("Bantu saya menyusun kalimat pembuka rapat");
  assert.deepEqual(plan.selected, ["knowledge"]);
  assert.equal(plan.mode, "single-domain");
});

test("orchestration remains bounded to five specialist skills", () => {
  const plan = planNaraSkills("Direktur perlu statistik audit indikator mutu, risiko, IKP, diagnosis, OPPE dan grafik");
  assert.ok(plan.selected.length <= 5);
});

test("engineering questions route to a non-data skill and do not require a hospital snapshot", () => {
  const plan = planNaraSkills("Bagaimana memperbaiki migration Supabase dan konfigurasi RLS?");
  assert.equal(plan.primary, "engineering");
  assert.ok(plan.selected.includes("engineering"));
  assert.ok(plan.domains.includes("engineering"));
  assert.equal(plan.requiresAggregateData, false);
});

test("governance questions route to Governance Intelligence and its aggregate domains", () => {
  const plan = planNaraSkills("Buat analisis rekomendasi Dewan Pengawas dan RTL tindak lanjut.");
  assert.equal(plan.primary, "governance");
  assert.ok(plan.selected.includes("governance"));
  assert.ok(plan.domains.includes("governance"));
  assert.equal(plan.requiresAggregateData, true);
});

test("quality skill receives only quality-related snapshot aggregates", () => {
  const snapshot = {
    tanggal_hari_ini: "2026-11-17",
    triwulan_berjalan: "Triwulan IV 2026",
    profil_indikator_mutu: { total_profil: 20 },
    mutu_klinis_logbook: { total_entri: 500 },
    manajemen_risiko: { total_risiko: 100 },
    keselamatan_pasien: { total_laporan_ikp: 30 },
    evaluasi_profesional: { total_oppe_fppe: 25 },
    unknown_future_domain: { secret: true },
  };
  const scoped = scopeSnapshotForSkills(snapshot, ["quality"]);
  assert.ok(scoped);
  assert.deepEqual(scoped.profil_indikator_mutu, { total_profil: 20 });
  assert.deepEqual(scoped.mutu_klinis_logbook, { total_entri: 500 });
  assert.equal(scoped.manajemen_risiko, undefined);
  assert.equal(scoped.keselamatan_pasien, undefined);
  assert.equal(scoped.evaluasi_profesional, undefined);
  assert.equal(scoped.unknown_future_domain, undefined);
  assert.deepEqual(scoped._nara_context.included_domains, ["quality"]);
});

test("cross-domain quality and risk skills receive both domains but not unrelated workforce data", () => {
  const snapshot = {
    profil_indikator_mutu: { total_profil: 20 },
    manajemen_risiko: { total_risiko: 100 },
    keselamatan_pasien: { total_laporan_ikp: 30 },
    evaluasi_profesional: { total_oppe_fppe: 25 },
  };
  const scoped = scopeSnapshotForSkills(snapshot, ["quality", "risk"]);
  assert.ok(scoped?.profil_indikator_mutu);
  assert.ok(scoped?.manajemen_risiko);
  assert.equal(scoped?.keselamatan_pasien, undefined);
  assert.equal(scoped?.evaluasi_profesional, undefined);
  assert.deepEqual(scoped?._nara_context.included_domains, ["quality", "risk"]);
});

test("snapshot scoping fails closed for non-data or unknown domains", () => {
  const snapshot = { manajemen_risiko: { total_risiko: 100 } };
  assert.equal(scopeSnapshotForSkills(snapshot, ["engineering"]), null);
  assert.equal(scopeSnapshotForSkills(snapshot, ["unknown-domain"]), null);
  assert.equal(scopeSnapshotForSkills(null, ["risk"]), null);
});


test("short audit and engineering requests are routed, not dismissed as small talk", () => {
  assert.equal(isNaraSmallTalk("Halo!"), true);
  assert.equal(isNaraSmallTalk("Terima kasih."), true);
  assert.equal(isNaraSmallTalk("Audit seluruh fitur AUREKA"), false);
  assert.equal(isNaraSmallTalk("Debug UI AUREKA"), false);
  assert.equal(planNaraSkills("Audit seluruh fitur AUREKA").primary, "audit");
});

test("broad cross-domain questions retain explicitly requested engineering and governance specialties", () => {
  const plan = planNaraSkills("Direktur: statistik audit indikator mutu, risiko, IKP, diagnosis, OPPE, diagram, Supabase, tata kelola");
  assert.ok(plan.selected.length <= 5);
  assert.equal(plan.primary, "executive");
  assert.ok(plan.selected.includes("engineering"));
  assert.ok(plan.selected.includes("governance"));
});
