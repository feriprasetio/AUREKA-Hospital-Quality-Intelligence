/**
 * NARA AI — context minimization by deterministic skill domains.
 *
 * This is a data-minimization layer, NOT an authorization mechanism.
 * Supabase JWT + RLS remain the hard access-control boundary. This module
 * only removes unrelated, already-authorized aggregates before an LLM sees them.
 */
export type NaraDataDomain =
  | "quality"
  | "risk"
  | "patient_safety"
  | "clinical"
  | "governance"
  | "workforce";

const SNAPSHOT_DOMAINS: Readonly<Record<string, readonly NaraDataDomain[]>> = {
  ikhtisar_governance_aureka: ["governance"],
  analisis_diagnosis_klinis: ["clinical"],
  profil_indikator_mutu: ["quality"],
  analisis_fmea: ["risk"],
  sumber_daya_manusia_agregat: ["workforce"],
  audit_klinis: ["clinical", "quality"],
  response_time_konsul_igd: ["clinical", "quality"],
  manajemen_risiko: ["risk"],
  rencana_tindak: ["risk", "governance"],
  mutu_klinis_logbook: ["quality"],
  keselamatan_pasien: ["patient_safety"],
  evaluasi_profesional: ["workforce"],
  tata_kelola_dan_prioritas: ["governance"],
};

const DOMAIN_NAMES: readonly NaraDataDomain[] = [
  "quality", "risk", "patient_safety", "clinical", "governance", "workforce",
];

const SOURCE_NOTE_DOMAINS: ReadonlyArray<{ match: RegExp; domains: readonly NaraDataDomain[] }> = [
  { match: /risiko|FMEA/i, domains: ["risk"] },
  { match: /rencana tindak/i, domains: ["risk", "governance"] },
  { match: /IKP|investigasi IKP|budaya keselamatan/i, domains: ["patient_safety"] },
  { match: /logbook mutu|profil indikator/i, domains: ["quality"] },
  { match: /tenaga|OPPE\/FPPE/i, domains: ["workforce"] },
  { match: /konsultasi IGD/i, domains: ["quality", "clinical"] },
  { match: /clinical pathway|audit kematian|diagnosis klinis/i, domains: ["clinical"] },
  { match: /tata kelola|rekomendasi|prioritas tahunan/i, domains: ["governance"] },
  { match: /daftar unit/i, domains: DOMAIN_NAMES },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Return only snapshot aggregates relevant to the selected skill domains.
 * Unknown top-level keys are deliberately excluded (fail closed).
 */
export function scopeSnapshotForSkills(
  snapshot: unknown,
  domains: readonly string[],
): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;

  const allowed = new Set(domains.filter((domain): domain is NaraDataDomain =>
    DOMAIN_NAMES.includes(domain as NaraDataDomain),
  ));
  if (!allowed.size) return null;

  const scoped: Record<string, unknown> = {};
  for (const key of ["tanggal_hari_ini", "triwulan_berjalan"]) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) scoped[key] = snapshot[key];
  }

  const includedDomains = new Set<NaraDataDomain>();
  for (const [key, requiredDomains] of Object.entries(SNAPSHOT_DOMAINS)) {
    if (!requiredDomains.some((domain) => allowed.has(domain))) continue;
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) continue;
    scoped[key] = snapshot[key];
    for (const domain of requiredDomains) {
      if (allowed.has(domain)) includedDomains.add(domain);
    }
  }

  if (Array.isArray(snapshot.catatan_sumber)) {
    scoped.catatan_sumber = snapshot.catatan_sumber.filter((note) => {
      if (typeof note !== "string") return false;
      const rule = SOURCE_NOTE_DOMAINS.find((item) => item.match.test(note));
      return Boolean(rule && rule.domains.some((domain) => allowed.has(domain)));
    });
  }

  if (Object.prototype.hasOwnProperty.call(snapshot, "daftar_unit_aktif")) {
    scoped.daftar_unit_aktif = snapshot.daftar_unit_aktif;
  }

  scoped._nara_context = {
    scope: "skill-domain-minimized",
    included_domains: [...includedDomains],
    excluded_domains: DOMAIN_NAMES.filter((domain) => !allowed.has(domain)),
    note: "Data tetap dibatasi oleh JWT dan RLS Supabase. Penyaringan domain ini hanya meminimalkan konteks yang dikirim ke model AI.",
  };
  return scoped;
}

export const NARA_SNAPSHOT_DOMAIN_KEYS = Object.keys(SNAPSHOT_DOMAINS);
