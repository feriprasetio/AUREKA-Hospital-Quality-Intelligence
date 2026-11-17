import test from "node:test";
import assert from "node:assert/strict";
import { parseNaraVisual } from "../lib/nara-visual.ts";

const payload = {
  title: "Tren indikator",
  chartType: "line",
  xKey: "bulan",
  series: [{ dataKey: "capaian", label: "Capaian (%)" }],
  data: [{ bulan: "Jan", capaian: 75 }, { bulan: "Feb", capaian: 82 }],
  source: "DATA AUREKA",
  period: "2026",
  unit: "%",
};

test("parses a valid structured visual block and preserves narrative", () => {
  const result = parseNaraVisual("Analisis tren.\n[[NARA_VISUAL]]" + JSON.stringify(payload) + "[[/NARA_VISUAL]]");
  assert.equal(result.text, "Analisis tren.");
  assert.equal(result.visual?.data.length, 2);
  assert.equal(result.visual?.chartType, "line");
});

test("rejects chart payloads containing missing or non-numeric series values", () => {
  const invalid = { ...payload, data: [{ bulan: "Jan", capaian: "75%" }] };
  const result = parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(invalid) + "[[/NARA_VISUAL]]");
  assert.equal(result.visual, undefined);
  assert.match(result.text, /tidak valid/);
});

test("rejects oversized chart payloads", () => {
  const invalid = { ...payload, data: Array.from({ length: 25 }, (_, i) => ({ bulan: String(i), capaian: i })) };
  const result = parseNaraVisual("[[NARA_VISUAL]]" + JSON.stringify(invalid) + "[[/NARA_VISUAL]]");
  assert.equal(result.visual, undefined);
});

test("leaves ordinary text unchanged when no visual marker is present", () => {
  assert.deepEqual(parseNaraVisual("Jawaban biasa."), { text: "Jawaban biasa." });
});
