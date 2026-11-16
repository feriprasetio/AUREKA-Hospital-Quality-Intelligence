import test from "node:test";
import assert from "node:assert/strict";
import { planNaraSkills, NARA_SKILL_REGISTRY } from "../supabase/functions/aureka-tanya/skills.ts";

test("registry exposes twelve specialist skill families", () => {
  assert.equal(NARA_SKILL_REGISTRY.length, 12);
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
