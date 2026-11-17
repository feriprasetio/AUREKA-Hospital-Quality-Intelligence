import test from "node:test";
import assert from "node:assert/strict";
import { parseNaraVisual } from "../lib/nara-visual.ts";

const payload = {
  title: "Tren indikator", chartType: "line", xKey: "bulan",
  series: [{ dataKey: "capaian", label: "Capaian (%)" }],
  data: [{ bulan: "Jan", capaian: 75 }, { bulan: "Feb", capaian: 82 }],
  source: "DATA AUREKA", period: "2026", unit: "%",
};

test("parses valid bar and line structured visual blocks", () => {
  for (const chartType of ["bar", "line"]) {
    const result = parseNaraVisual("Analisis tren.\n[[NARA_VISUAL]]" + JSON.stringify({ ...payload, chartType }) + "[[/NARA_VISUAL]]");
    assert.equal(result.text, "Analisis tren.");
    assert.equal(result.visual?.data.length, 2);
    assert.equal(result.visual?.chartType, chartType);
  }
});

test("parses pie composition with nonnegative values", () => {
  const pie = { title: "Komposisi IKP", chartType: "pie", xKey: "kategori", valueKey: "jumlah", data: [{ kategori: "KTD", jumlah: 8 }, { kategori: "KNC", jumlah: 3 }] };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(pie) + "[[/NARA_VISUAL]]").visual?.chartType, "pie");
  const invalid = { ...pie, data: [{ kategori: "KTD", jumlah: -1 }] };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(invalid) + "[[/NARA_VISUAL]]").visual, undefined);
});

test("parses heatmap and validates both dimensions and numeric value", () => {
  const heat = { title: "Heatmap unit dan bulan", chartType: "heatmap", xKey: "unit", yKey: "bulan", valueKey: "capaian", data: [{ unit: "IGD", bulan: "Jan", capaian: 82 }] };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(heat) + "[[/NARA_VISUAL]]").visual?.chartType, "heatmap");
  const invalid = { ...heat, data: [{ unit: "IGD", bulan: "Jan", capaian: "82%" }] };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(invalid) + "[[/NARA_VISUAL]]").visual, undefined);
});

test("parses risk matrix only for valid 1-to-5 likelihood and impact", () => {
  const matrix = { title: "Matriks risiko", chartType: "risk_matrix", data: [{ likelihood: 5, impact: 4, count: 3 }, { likelihood: 2, impact: 3, count: 1 }] };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(matrix) + "[[/NARA_VISUAL]]").visual?.chartType, "risk_matrix");
  const fullMatrix = { ...matrix, data: Array.from({ length: 25 }, (_, i) => ({ likelihood: Math.floor(i / 5) + 1, impact: (i % 5) + 1, count: i })) };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(fullMatrix) + "[[/NARA_VISUAL]]").visual?.data.length, 25);
  const invalid = { ...matrix, data: [{ likelihood: 6, impact: 3, count: 1 }] };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(invalid) + "[[/NARA_VISUAL]]").visual, undefined);
});

test("rejects missing or non-numeric series values", () => {
  const invalid = { ...payload, data: [{ bulan: "Jan", capaian: "75%" }] };
  const result = parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(invalid) + "[[/NARA_VISUAL]]");
  assert.equal(result.visual, undefined);
  assert.match(result.text, /tidak valid/);
});

test("rejects oversized chart payloads", () => {
  const invalid = { ...payload, data: Array.from({ length: 25 }, (_, i) => ({ bulan: String(i), capaian: i })) };
  assert.equal(parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(invalid) + "[[/NARA_VISUAL]]").visual, undefined);
});

test("leaves ordinary text unchanged when no visual marker is present", () => {
  assert.deepEqual(parseNaraVisual("Jawaban biasa."), { text: "Jawaban biasa." });
});

test("accepts explicitly suppressed small risk-matrix cells without treating them as zero", () => {
  const matrix = { title: "Matriks risiko", chartType: "risk_matrix", data: Array.from({ length: 25 }, (_, i) => ({ likelihood: Math.floor(i / 5) + 1, impact: (i % 5) + 1, count: i === 0 ? "disembunyikan (<5)" : i })) };
  const result = parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(matrix) + "[[/NARA_VISUAL]]");
  assert.equal(result.visual?.data.length, 25);
  assert.equal(result.visual?.data[0].count, "disembunyikan (<5)");
});
