import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateClinicalDeathAudits,
  aggregateClinicalPathwayRows,
  aggregatePathwayByMonth,
  calculateIndicatorResult,
  diagnoseIndicator,
  calculateIndicatorResultsForProfiles,
  calculatePathwayAuditMetrics,
} from '../lib/aureka/quality-results-engine.ts'

function qualityRow(date, status, numerator, denominator, updatedAt) {
  return {
    room_id: 1,
    record_date: date,
    status,
    updated_at: updatedAt,
    core_data: {
      indicator_values: {
        '1.1': { numerator, denominator },
      },
    },
  }
}

test('indicator results pool numerators and denominators instead of averaging monthly rates', () => {
  const profile = {
    id: 'p1',
    room_id: 1,
    code: '1.1',
    title: 'Kecepatan Respon',
    measurement_grain: 'daily_metric',
    numerator_definition: 'Respon tepat waktu',
    denominator_definition: 'Seluruh komplain',
    target_text: '≥ 80%',
    target_operator: '>=',
    target_value: 80,
  }
  const rows = [
    qualityRow('2026-01-04', 'ready', 1, 2, '2026-01-05T08:00:00Z'),
    qualityRow('2026-02-04', 'validated', 8, 10, '2026-02-05T08:00:00Z'),
    qualityRow('2026-03-04', 'draft', 10, 10, '2026-03-05T08:00:00Z'),
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)

  assert.equal(result.observations, 2)
  assert.equal(result.annualNumerator, 8)
  assert.equal(result.annualDenominator, 10)
  assert.equal(result.annualRate, 80)
  assert.equal(result.monthlyMeanRate, 80)
  assert.equal(result.readyRecords, 1)
  assert.equal(result.validatedRecords, 1)
  assert.equal(result.observations, 2)
  assert.equal(result.targetMet, true)
  assert.equal(result.latestInputAt, '2026-02-05T08:00:00Z')
  assert.equal(result.monthly[0].rate, null)
  assert.equal(result.monthly[0].readyRecords, 1)
  assert.equal(result.monthly[0].validatedRecords, 0)
  assert.equal(result.monthly[1].validatedRecords, 1)
  assert.equal(result.monthly[2].rate, null)
})

test('hospital-wide indicator aggregation isolates reused indicator codes by room', () => {
  const profiles = [
    { id: 'p-room-1', room_id: 1, code: '1.1', title: 'Respon unit 1', measurement_grain: 'daily_metric', numerator_definition: 'Respon tepat waktu', denominator_definition: 'Seluruh komplain', target_text: '≥ 80%', target_operator: '>=', target_value: 80 },
    { id: 'p-room-2', room_id: 2, code: '1.1', title: 'Respon unit 2', measurement_grain: 'daily_metric', numerator_definition: 'Respon tepat waktu', denominator_definition: 'Seluruh komplain', target_text: '≥ 80%', target_operator: '>=', target_value: 80 },
  ]
  const rows = [
    { room_id: 1, record_date: '2026-01-01', status: 'validated', core_data: { indicator_values: { '1.1': { numerator: 1, denominator: 2 } } } },
    { room_id: 2, record_date: '2026-01-01', status: 'validated', core_data: { indicator_values: { '1.1': { numerator: 9, denominator: 10 } } } },
  ]
  const results = calculateIndicatorResultsForProfiles(profiles, rows, 2026)
  assert.equal(results.length, 2)
  assert.equal(results[0].annualRate, 50)
  assert.equal(results[1].annualRate, 90)
  assert.equal(results[0].observations, 1)
  assert.equal(results[1].observations, 1)
})

test('option results use the published numerator mapping, not the option code alone', () => {
  const profile = {
    id: 'p2',
    room_id: 1,
    code: '1.2',
    title: 'Pemahaman Pasien',
    measurement_grain: 'event',
    options_json: [
      { code: 1, label: 'Pasien Mengerti', numerator: false, denominator: true },
      { code: 3, label: 'Pasien Tidak Mengerti', numerator: true, denominator: true },
    ],
    target_text: '≤ 5%',
    target_operator: '<=',
    target_value: 5,
  }
  const rows = [
    {
      record_date: '2026-01-03',
      status: 'validated',
      core_data: { indicator_values: { '1.2': { answer: 'Pasien Mengerti', code: 1 } } },
    },
    {
      record_date: '2026-01-04',
      status: 'validated',
      core_data: { indicator_values: { '1.2': { answer: 'Pasien Tidak Mengerti', code: 3 } } },
    },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 50)
  assert.equal(result.observations, 2)
})

test('positive option indicators count code 1 as the numerator regardless of legacy option flags', () => {
  const profile = {
    id: 'p-positive',
    room_id: 4,
    code: '4.4',
    title: 'Ketepatan Verifikasi Operasi',
    measurement_grain: 'patient_episode',
    schema_json: { indicator_direction: 'positive' },
    options_json: [
      { code: 1, label: 'Tepat', numerator: false, denominator: false },
      { code: 2, label: 'Pengecualian', numerator: true, denominator: false },
      { code: 3, label: 'Tidak Tepat', numerator: true, denominator: false },
    ],
    target_text: '≥ 50%',
    target_operator: '>=',
    target_value: 50,
  }
  const rows = [1, 1, 2, 3].map((code, index) => ({
    record_date: '2026-01-0' + (index + 1),
    status: 'validated',
    core_data: { indicator_values: { '4.4': { answer: code === 1 ? 'Tepat' : code === 2 ? 'Pengecualian' : 'Tidak Tepat', code } } },
  }))
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 2)
  assert.equal(result.annualDenominator, 4)
  assert.equal(result.annualRate, 50)
  assert.equal(result.targetMet, true)
})

test('negative option indicators count code 3 as events; code 2 stays in the denominator', () => {
  const profile = {
    id: 'p-negative',
    room_id: 33,
    code: '33.2',
    title: 'Kejadian Ruptur Perineum Tingkat III dan IV',
    measurement_grain: 'patient_episode',
    schema_json: { indicator_direction: 'negative' },
    options_json: [
      { code: 1, label: 'Aman', numerator: true, denominator: true },
      { code: 2, label: 'Ruptur faktor ibu', numerator: false, denominator: true },
      { code: 3, label: 'Ruptur faktor teknis', numerator: false, denominator: true },
    ],
    target_text: '≤ 5%',
    target_operator: '<=',
    target_value: 5,
  }
  const codes = [1, 1, 1, 1, 2, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  const rows = codes.map((code, index) => ({
    record_date: '2026-01-' + String(index + 1).padStart(2, '0'),
    status: 'validated',
    core_data: { indicator_values: { '33.2': { answer: code === 1 ? 'Aman' : code === 2 ? 'Ruptur faktor ibu' : 'Ruptur faktor teknis', code } } },
  }))
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 20)
  assert.equal(result.annualRate, 5)
  assert.equal(result.targetMet, true)
})

test('negative zero-event indicators reach a 0% target when every response is code 1', () => {
  const profile = {
    id: 'p-falls',
    room_id: 12,
    code: '12.3',
    title: 'Kejadian Jatuh Saat Program Rehab Medik',
    measurement_grain: 'patient_episode',
    schema_json: { indicator_direction: 'negative' },
    options_json: [
      { code: 1, label: 'Tidak Ada Kejadian Jatuh', numerator: true, denominator: true },
      { code: 2, label: 'Jatuh karena kondisi medis mendadak', numerator: false, denominator: true },
      { code: 3, label: 'Jatuh terkait faktor teknis', numerator: false, denominator: true },
    ],
    target_text: '0%',
    target_operator: '=',
    target_value: 0,
  }
  const rows = [1, 1, 1].map((code, index) => ({
    record_date: '2026-02-0' + (index + 1),
    status: 'validated',
    core_data: { indicator_values: { '12.3': { answer: 'Tidak Ada Kejadian Jatuh', code } } },
  }))
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 0)
  assert.equal(result.annualDenominator, 3)
  assert.equal(result.annualRate, 0)
  assert.equal(result.targetMet, true)
})

test('approved direction resolves exact categorical labels with pending legacy flags but keeps source conflicts excluded', () => {
  const profile = {
    id: 'p-ponek-pending',
    room_id: 33,
    code: '33.2',
    title: 'Ruptur Perineum III/IV',
    measurement_grain: 'patient_episode',
    schema_json: { indicator_direction: 'negative' },
    options_json: [
      { code: 1, label: 'Aman', numerator: null, denominator: true, review_required: true },
      { code: 2, label: 'Ruptur faktor ibu', numerator: null, denominator: true, review_required: true },
      { code: 3, label: 'Ruptur faktor teknis', numerator: null, denominator: true, review_required: true },
    ],
    target_text: '0%',
    target_operator: '=',
    target_value: 0,
  }
  const rows = [
    {
      record_date: '2026-04-01',
      status: 'validated',
      core_data: { indicator_values: { '33.2': {
        answer: 'Ruptur faktor ibu', code: 2, source_code: 2,
        review_required: true, mapping_status: 'mapped_pending_classification',
      } } },
    },
    {
      record_date: '2026-04-02',
      status: 'validated',
      core_data: { indicator_values: { '33.2': {
        answer: 'Aman', code: 1, source_code: 1,
        review_required: false, mapping_status: 'mapped',
      } } },
    },
    {
      record_date: '2026-04-03',
      status: 'validated',
      core_data: { indicator_values: { '33.2': {
        answer: 'Ruptur faktor teknis', code: 3, source_code: 2,
        review_required: true, mapping_status: 'source_code_conflict',
      } } },
    },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 0)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 0)
  assert.equal(result.observations, 2)
})


test('directional indicators exclude explicitly ineligible responses from the denominator', () => {
  const profile = {
    id: 'p-eligible-only',
    room_id: 19,
    code: '19.2',
    title: 'Inisiasi Menyusu Dini',
    measurement_grain: 'patient_episode',
    schema_json: { indicator_direction: 'positive' },
    options_json: [
      { code: 1, label: 'IMD dilakukan', numerator: null, denominator: true, review_required: true },
      { code: 2, label: 'Ibu tidak stabil', numerator: null, denominator: true, eligible: false, review_required: true },
      { code: 3, label: 'Petugas tidak melakukan IMD', numerator: null, denominator: true, review_required: true },
    ],
  }
  const rows = [
    { record_date: '2026-05-01', status: 'validated', core_data: { indicator_values: { '19.2': {
      answer: 'IMD dilakukan', code: 1, source_code: 1, review_required: true, mapping_status: 'mapped_pending_classification',
    } } } },
    { record_date: '2026-05-02', status: 'validated', core_data: { indicator_values: { '19.2': {
      answer: 'Ibu tidak stabil', code: 2, source_code: 2, review_required: true, mapping_status: 'mapped_pending_classification',
    } } } },
    { record_date: '2026-05-03', status: 'validated', core_data: { indicator_values: { '19.2': {
      answer: 'Petugas tidak melakukan IMD', code: 3, source_code: 3, review_required: true, mapping_status: 'mapped_pending_classification',
    } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 50)
  assert.equal(result.observations, 2)
})


test('directional option mapping rejects an answer label that conflicts with its numeric code', () => {
  const profile = {
    id: 'p-label-conflict',
    room_id: 4,
    code: '4.3',
    title: 'Penundaan Operasi Elektif',
    measurement_grain: 'patient_episode',
    schema_json: { indicator_direction: 'negative', measurement_type: 'compliance' },
    options_json: [
      { code: 1, label: 'Operasi tepat waktu', numerator: false, denominator: true },
      { code: 2, label: 'Ditunda karena alasan medis', numerator: false, denominator: true },
      { code: 3, label: 'Ditunda karena kesiapan rumah sakit', numerator: true, denominator: true },
    ],
  }
  const rows = [
    { record_date: '2026-06-01', status: 'validated', core_data: { indicator_values: { '4.3': {
      answer: 'Operasi tepat waktu', code: 3, source_code: 3, mapping_status: 'mapped', review_required: false,
    } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 0)
  assert.equal(result.annualDenominator, 0)
  assert.equal(result.observations, 0)
})

test('negative event indicators honor the inclusive 1% threshold', () => {
  const profile = {
    id: 'p-blood-waste',
    room_id: 9,
    code: '9.1',
    title: 'Darah yang terbuang setelah crossmatch',
    measurement_grain: 'patient_episode',
    schema_json: { indicator_direction: 'negative' },
    options_json: [
      { code: 1, label: 'Darah terpakai atau dikembalikan', numerator: true, denominator: true },
      { code: 2, label: 'Darah terbuang dengan alasan klinis', numerator: false, denominator: true },
      { code: 3, label: 'Darah terbuang karena faktor teknis', numerator: false, denominator: true },
    ],
    target_text: '≤ 1%',
    target_operator: '<=',
    target_value: 1,
  }
  const makeRows = (wastedCount) => Array.from({ length: 100 }, (_, index) => {
    const code = index < wastedCount ? 3 : 1
    return {
      record_date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
      status: 'validated',
      core_data: { indicator_values: { '9.1': { answer: code === 1 ? 'Darah terpakai atau dikembalikan' : 'Darah terbuang karena faktor teknis', code } } },
    }
  })
  const atThreshold = calculateIndicatorResult(profile, makeRows(1), 2026)
  const aboveThreshold = calculateIndicatorResult(profile, makeRows(2), 2026)
  assert.equal(atThreshold.annualNumerator, 1)
  assert.equal(atThreshold.annualDenominator, 100)
  assert.equal(atThreshold.annualRate, 1)
  assert.equal(atThreshold.targetMet, true)
  assert.equal(aboveThreshold.annualRate, 2)
  assert.equal(aboveThreshold.targetMet, false)
})

function cpRow(status, admissionDate, dayOne, dayTwo) {
  return {
    status,
    admission_date: admissionDate,
    template_code: 'CP-TEST',
    template_name: 'Clinical Pathway Uji',
    template_snapshot: {
      name: 'Clinical Pathway Uji',
      items: [{
        id: 'item-1',
        schedule: [
          { day: 'H0', policy: 'required' },
          { day: 'H1', policy: 'required' },
        ],
      }],
      scoring_rules: {
        completion_threshold_pct: 80,
        compliance_target_pct: 75,
        variation_required: false,
        inclusion_criteria: [{ id: 'eligible', expected: true }],
      },
    },
    selected_items_json: { 'item-1': true },
    additional_phases_json: [],
    inclusion_json: { eligible: true },
    answers_json: {
      'item-1': {
        H0: { status: dayOne },
        H1: { status: dayTwo },
      },
    },
    variations_json: { reviewed: true, items: [] },
  }
}

test('Clinical Pathway calculates pooled compliance with N/A excluded and includes all PIC-submitted final reports', () => {
  const rows = [
    cpRow('validated', '2026-01-01', 'done', 'not_done'),
    cpRow('validated', '2026-02-01', 'done', 'not_applicable'),
    cpRow('submitted', '2026-03-01', 'done', 'done'),
    cpRow('draft', '2026-04-01', 'done', 'done'),
  ]
  const one = calculatePathwayAuditMetrics(rows[1])
  assert.equal(one.expected, 2)
  assert.equal(one.filled, 2)
  assert.equal(one.done, 1)
  assert.equal(one.notApplicable, 1)
  assert.equal(one.compliancePct, 100)
  assert.equal(one.targetMet, true)

  const aggregate = aggregateClinicalPathwayRows(rows)
  assert.equal(aggregate.overall.totalRecords, 4)
  assert.equal(aggregate.overall.validatedRecords, 3)
  assert.equal(aggregate.overall.expected, 6)
  assert.equal(aggregate.overall.filled, 6)
  assert.equal(aggregate.overall.done, 4)
  assert.equal(aggregate.overall.notDone, 1)
  assert.equal(aggregate.overall.compliancePct, 80)
  assert.equal(aggregate.overall.episodeTargetMetPct, 66.67)
  assert.equal(aggregate.overall.sectionDPassPct, 66.67)

  const monthly = aggregatePathwayByMonth(rows, 2026)
  assert.equal(monthly[0].cases, 1)
  assert.equal(monthly[0].compliancePct, 50)
  assert.equal(monthly[1].cases, 1)
  assert.equal(monthly[1].compliancePct, 100)
  assert.equal(monthly[2].cases, 1)
  assert.equal(monthly[2].compliancePct, 100)
})

test('Clinical death results include PIC-submitted final reports in ordinal distributions', () => {
  const rows = [
    {
      audit_type: 'clinical',
      review_period: '2026',
      status: 'validated',
      overall_care_score: 5,
      care_issue_identified: 'yes',
      review_json: { phases: { admission: { score: 4 }, ongoing: { score: 5 }, procedure: { score: 3, notApplicable: true } }, recommended_actions: 'Perbaiki eskalasi klinis', learning_points: 'Perkuat monitoring' },
    },
    {
      audit_type: 'clinical',
      review_period: '2026',
      status: 'submitted',
      overall_care_score: 1,
      care_issue_identified: 'no',
      review_json: { phases: { admission: { score: 1 } } },
    },
    {
      audit_type: 'death',
      review_period: '2026',
      status: 'validated',
      overall_care_score: 2,
      care_issue_identified: 'yes',
      contribution_to_outcome: 'uncertain',
      avoidability_score: 3,
      review_json: { phases: { admission: { score: 2 }, end_of_life: { score: 4 } }, recommended_actions: 'Perbaiki komunikasi akhir hayat', learning_points: 'Evaluasi keterlambatan pengenalan perburukan' },
    },
  ]

  const clinical = aggregateClinicalDeathAudits(rows, 'clinical')
  assert.equal(clinical.totalRecords, 2)
  assert.equal(clinical.validatedRecords, 2)
  assert.equal(clinical.overallScore.median, 3)
  assert.equal(clinical.overallScore.n, 2)
  assert.equal(clinical.phases[0].summary.median, 2.5)
  assert.equal(clinical.phases[2].summary.n, 0)
  assert.equal(clinical.careIssue.yes, 1)
  assert.equal(clinical.careIssue.no, 1)
  assert.equal(clinical.createdActions, 1)
  assert.equal(clinical.learningDocumented, 1)

  const death = aggregateClinicalDeathAudits(rows, 'death')
  assert.equal(death.validatedRecords, 1)
  assert.equal(death.contribution.uncertain, 1)
  assert.equal(death.avoidability.median, 3)
  assert.equal(death.avoidability.distribution[3], 1)
  assert.equal(death.avoidability.distribution[1], 0)
})


test('positive and negative categorical indicators calculate numerators using their declared direction and operator', () => {
  const makeRows = (code, label, count) => Array.from({ length: 4 }, (_, index) => ({
    record_date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    status: 'validated',
    core_data: { indicator_values: { 'TEST': { answer: index < count ? label.good : label.adverse, code: index < count ? 1 : 3 } } },
  }))

  const positiveProfile = {
    room_id: 1,
    code: 'TEST',
    title: 'Kepatuhan tindakan',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'compliance', indicator_direction: 'positive' },
    options_json: [
      { code: 1, label: 'Tindakan sesuai standar' },
      { code: 3, label: 'Tindakan tidak sesuai standar' },
    ],
    target_text: '≥ 75%',
    target_operator: '>=',
    target_value: 75,
  }
  const positive = calculateIndicatorResult(
    positiveProfile,
    makeRows(1, { good: 'Tindakan sesuai standar', adverse: 'Tindakan tidak sesuai standar' }, 3),
    2026,
  )
  assert.equal(positive.annualNumerator, 3)
  assert.equal(positive.annualDenominator, 4)
  assert.equal(positive.annualRate, 75)
  assert.equal(positive.targetMet, true)

  const negativeProfile = {
    ...positiveProfile,
    code: 'TEST',
    title: 'Kejadian tidak diharapkan',
    schema_json: { measurement_type: 'compliance', indicator_direction: 'negative' },
    options_json: [
      { code: 1, label: 'Tidak terjadi kejadian' },
      { code: 3, label: 'Terjadi kejadian' },
    ],
    target_text: '≤ 25%',
    target_operator: '<=',
    target_value: 25,
  }
  const negative = calculateIndicatorResult(
    negativeProfile,
    makeRows(1, { good: 'Tidak terjadi kejadian', adverse: 'Terjadi kejadian' }, 3).map((row, index) => ({
      ...row,
      core_data: { indicator_values: { TEST: {
        answer: index < 3 ? 'Tidak terjadi kejadian' : 'Terjadi kejadian',
        code: index < 3 ? 1 : 3,
      } } },
    })),
    2026,
  )
  assert.equal(negative.annualNumerator, 1)
  assert.equal(negative.annualDenominator, 4)
  assert.equal(negative.annualRate, 25)
  assert.equal(negative.targetMet, true)
})

test('profiles without an approved target still calculate observations but remain unassessed against target', () => {
  const profile = {
    room_id: 1,
    code: 'TEST',
    title: 'Indikator tanpa target',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'compliance', indicator_direction: 'positive', target_not_defined_in_source: true },
    options_json: [
      { code: 1, label: 'Memenuhi' },
      { code: 3, label: 'Tidak memenuhi' },
    ],
    target_text: 'Belum ditetapkan pada dokumen sumber 2026',
    target_operator: '=',
    target_value: null,
  }
  const rows = [
    { record_date: '2026-01-01', status: 'validated', core_data: { indicator_values: { TEST: { answer: 'Memenuhi', code: 1 } } } },
    { record_date: '2026-01-02', status: 'validated', core_data: { indicator_values: { TEST: { answer: 'Tidak memenuhi', code: 3 } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.observations, 2)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 50)
  assert.equal(result.targetMet, null)
})

test('ratio profiles derive N/D from coded categorical responses when raw N/D fields are absent', () => {
  const profile = {
    id: 'p-icu-14-2',
    room_id: 14,
    code: '14.2',
    title: 'Kelengkapan Assessment Pengantar Transfer Pasien dari IGD',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'ratio', indicator_direction: 'positive' },
    options_json: [
      { code: 1, label: 'Formulir Transfer Terisi Lengkap', numerator: true, denominator: true, review_required: false },
      { code: 2, label: 'Tidak Lengkap karena kondisi klinis', numerator: false, denominator: true, review_required: true },
      { code: 3, label: 'Tidak Ada Formulir Transfer', numerator: false, denominator: true, review_required: true },
    ],
    target_text: '≥ 100%',
    target_operator: '>=',
    target_value: 100,
  }
  const rows = [
    {
      record_date: '2026-01-03',
      status: 'validated',
      core_data: { indicator_values: { '14.2': {
        answer: 'Formulir Transfer Terisi Lengkap',
        code: 1,
        source_code: 1,
        review_required: false,
        mapping_status: 'mapped',
      } } },
    },
    {
      record_date: '2026-01-04',
      status: 'validated',
      core_data: { indicator_values: { '14.2': {
        answer: 'Tidak Lengkap karena kondisi klinis',
        code: null,
        source_code: 2,
        review_required: true,
        mapping_status: 'master_pending',
      } } },
    },
    {
      record_date: '2026-01-05',
      status: 'validated',
      core_data: { indicator_values: { '14.2': {
        answer: 'Tidak Ada Formulir Transfer',
        code: null,
        source_code: 3,
        review_required: true,
        mapping_status: 'source_master_conflict',
      } } },
    },
  ]

  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.kind, 'ratio')
  assert.equal(result.observations, 2)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 50)
  assert.equal(result.monthly[0].observations, 2)
  assert.equal(result.monthly[0].numerator, 1)
  assert.equal(result.monthly[0].denominator, 2)
  assert.equal(result.targetMet, false)
})



test('categorical capture mode counts exact ICU responses despite legacy visit and ratio measurement types', () => {
  const profile = {
    id: 'p-icu-14-4',
    room_id: 14,
    code: '14.4',
    title: 'Kepatuhan Jam Visite Dokter Spesialis',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'visit', response_capture_mode: 'categorical', indicator_direction: 'positive' },
    options_json: [
      { code: 1, label: 'Visite Hari Kerja (06.00-14.00)', numerator: true, denominator: true },
      { code: 3, label: 'Tidak Visite', numerator: false, denominator: true, review_required: true },
    ],
    target_text: '≥ 80%',
    target_operator: '>=',
    target_value: 80,
  }
  const rows = [
    { record_date: '2026-01-03', status: 'validated', core_data: { indicator_values: { '14.4': {
      answer: 'Visite Hari Kerja (06.00-14.00)', code: 1, source_code: 1, review_required: false, mapping_status: 'mapped',
    } } } },
    { record_date: '2026-01-04', status: 'validated', core_data: { indicator_values: { '14.4': {
      answer: 'Tidak Visite', code: null, source_code: 3, review_required: true, mapping_status: 'master_pending',
    } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.kind, 'visit')
  assert.equal(result.observations, 2)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 50)
  assert.equal(result.targetMet, false)
})

test('ICU negative BHP/Linen profile 14.1 counts an exact master-pending source event', () => {
  const profile = {
    id: 'p-icu-14-1',
    room_id: 14,
    code: '14.1',
    title: 'Kekosongan BHP, Linen dan Barang Penunjang Perawatan Pasien Lainnya',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'ratio', response_capture_mode: 'categorical', indicator_direction: 'negative' },
    options_json: [
      { code: 1, label: 'Pasien Dirawat Tanpa Kendala', numerator: true, denominator: true },
      { code: 3, label: 'Pasien Dirawat Dengan Kekosongan BHP dan Linen', numerator: false, denominator: true, review_required: true },
    ],
    target_text: '≤ 0%',
    target_operator: '<=',
    target_value: 0,
  }
  const rows = [{
    record_date: '2026-01-04',
    status: 'validated',
    core_data: { indicator_values: { '14.1': {
      answer: 'Pasien Dirawat Dengan Kekosongan BHP dan Linen',
      code: null,
      source_code: 3,
      review_required: true,
      mapping_status: 'master_pending',
    } } },
  }]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.observations, 1)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 1)
  assert.equal(result.annualRate, 100)
  assert.equal(result.targetMet, false)
})


test('unreviewed reconciliation response is excluded from numerator and denominator', () => {
  const profile = {
    id: 'p-room-3', room_id: 3, code: '3.1', title: 'Keterlambatan Ambulance',
    measurement_grain: 'event', schema_json: { measurement_type: 'ratio' },
  }
  const rows = [{
    room_id: 3, record_date: '2026-02-14', status: 'validated',
    core_data: { indicator_values: { '3.1': {
      numerator: 2, denominator: 5, answer: 'Terlambat', code: 3,
      review_status: 'pending',
    } } },
  }]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.observations, 0)
  assert.equal(result.annualNumerator, 0)
  assert.equal(result.annualDenominator, 0)
  assert.equal(result.annualRate, null)
})

test('classified and not-required reconciliation responses remain eligible', () => {
  const profile = {
    id: 'p-room-3-approved', room_id: 3, code: '3.1', title: 'Keterlambatan Ambulance',
    measurement_grain: 'event', schema_json: { measurement_type: 'ratio' },
  }
  const rows = [
    { room_id: 3, record_date: '2026-02-14', status: 'validated', core_data: { indicator_values: { '3.1': { numerator: 1, denominator: 2, review_status: 'classified' } } } },
    { room_id: 3, record_date: '2026-02-15', status: 'validated', core_data: { indicator_values: { '3.1': { numerator: 0, denominator: 3, review_status: 'not_required' } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.observations, 2)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 5)
  assert.equal(result.annualRate, 20)
})


test('IBS 4.2 patient-episode categorical codes aggregate through the positive ratio direction', () => {
  const profile = {
    id: 'ibs-4-2', room_id: 4, code: '4.2',
    title: 'Kelengkapan Laporan Operasi <24 Jam',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'ratio', indicator_direction: 'positive' },
    options_json: [
      { code: 1, label: 'Laporan Lengkap & Tuntas < 24 Jam' },
      { code: 2, label: 'Laporan > 24 Jam karena kendala sistem' },
      { code: 3, label: 'Laporan > 24 Jam tanpa alasan valid' },
    ],
    target_text: '≥ 95%', target_operator: '>=', target_value: 95,
  }
  const rows = [
    { record_date: '2026-02-01', status: 'validated', core_data: { indicator_values: { '4.2': { answer: 'Laporan Lengkap & Tuntas < 24 Jam', code: 1 } } } },
    { record_date: '2026-02-02', status: 'validated', core_data: { indicator_values: { '4.2': { answer: 'Laporan > 24 Jam karena kendala sistem', code: 2 } } } },
    { record_date: '2026-02-03', status: 'validated', core_data: { indicator_values: { '4.2': { answer: 'Laporan > 24 Jam tanpa alasan valid', code: 3 } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.kind, 'ratio')
  assert.equal(result.observations, 3)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 3)
  assert.equal(result.annualRate, 33.33)
})

test('IBS 4.3 patient-episode categorical codes aggregate through the negative ratio direction', () => {
  const profile = {
    id: 'ibs-4-3', room_id: 4, code: '4.3',
    title: 'Penundaan Operasi Elektif',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'ratio', indicator_direction: 'negative' },
    options_json: [
      { code: 1, label: 'Operasi Sesuai Jadwal' },
      { code: 2, label: 'Ditunda karena alasan medis / cito' },
      { code: 3, label: 'Ditunda karena faktor pelayanan' },
    ],
    target_text: '≤ 5%', target_operator: '<=', target_value: 5,
  }
  const rows = [
    { record_date: '2026-02-01', status: 'validated', core_data: { indicator_values: { '4.3': { answer: 'Operasi Sesuai Jadwal', code: 1 } } } },
    { record_date: '2026-02-02', status: 'validated', core_data: { indicator_values: { '4.3': { answer: 'Ditunda karena alasan medis / cito', code: 2 } } } },
    { record_date: '2026-02-03', status: 'validated', core_data: { indicator_values: { '4.3': { answer: 'Ditunda karena faktor pelayanan', code: 3 } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.kind, 'ratio')
  assert.equal(result.observations, 3)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 3)
  assert.equal(result.annualRate, 33.33)
})


test('inferred categorical episode profiles retain legacy numeric N/D records', () => {
  const profile = {
    id: 'ibs-4-2-legacy', room_id: 4, code: '4.2',
    title: 'Kelengkapan Laporan Operasi <24 Jam',
    measurement_grain: 'patient_episode',
    schema_json: { measurement_type: 'ratio', indicator_direction: 'positive' },
    options_json: [
      { code: 1, label: 'Laporan Lengkap & Tuntas < 24 Jam' },
      { code: 2, label: 'Laporan > 24 Jam karena kendala sistem' },
      { code: 3, label: 'Laporan > 24 Jam tanpa alasan valid' },
    ],
  }
  const rows = [{
    record_date: '2026-02-01',
    status: 'validated',
    core_data: { indicator_values: { '4.2': { numerator: 8, denominator: 10 } } },
  }]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.observations, 1)
  assert.equal(result.annualNumerator, 8)
  assert.equal(result.annualDenominator, 10)
  assert.equal(result.annualRate, 80)
})


test('Kt/V 100% attainment does not compare a raw dialysis measurement to the percentage target', () => {
  const profile = {
    room_id:8, code:'8.2', title:'Adekuasi Dialisis (Kt/V)', unit_of_measure:'%',
    measurement_grain:'activity', target_text:'100%', target_operator:'=', target_value:100,
    schema_json:{measurement_type:'numeric'},
  }
  const observation=(date,value)=>({
    room_id:8,record_date:date,status:'validated',
    core_data:{indicator_values:{'8.2':{value}}},
  })
  const rows=[
    observation('2026-04-01',1.4),observation('2026-04-02',1.1),
    observation('2026-04-03',1.3),
  ]
  const unconfigured=calculateIndicatorResult(profile,rows,2026)
  assert.equal(unconfigured.annualMean,1.27)
  assert.equal(unconfigured.annualRate,null)
  assert.equal(unconfigured.annualTargetAttainment,null)
  assert.equal(unconfigured.targetMet,null)
  const configured=calculateIndicatorResult({
    ...profile,
    schema_json:{...profile.schema_json,observation_target_value:1.2,observation_target_operator:'>='},
  },rows,2026)
  assert.equal(configured.annualMean,1.27)
  assert.equal(configured.annualRate,66.67)
  assert.equal(configured.annualTargetAttainment,66.67)
  assert.equal(configured.targetMet,false)
})

test('percentage-based duration targets require an explicit observation threshold and retain true multi-day intervals',()=>{
  const profile={
    room_id:29,code:'29.1',title:'Ketepatan Waktu Pelaporan Insiden',
    measurement_grain:'event',target_text:'≥ 90%',target_operator:'>=',target_value:90,
    schema_json:{measurement_type:'door'},
  }
  const row=(start,end)=>({
    room_id:29,record_date:'2026-06-02',status:'validated',
    core_data:{indicator_values:{'29.1':{start,end}}},
  })
  const rows=[
    row('2026-06-01T23:55:00+07:00','2026-06-02T00:15:00+07:00'),
    row('2026-06-01T23:55:00+07:00','2026-06-03T00:15:00+07:00'),
  ]
  const before=calculateIndicatorResult(profile,rows,2026)
  assert.equal(before.annualMean,740)
  assert.equal(before.annualRate,null)
  assert.equal(before.targetMet,null)
  const after=calculateIndicatorResult({
    ...profile,
    schema_json:{...profile.schema_json,observation_target_value:60,observation_target_operator:'<='},
  },rows,2026)
  assert.equal(after.annualMean,740)
  assert.equal(after.annualRate,50)
  assert.equal(after.targetMet,false)
})

test('clock-only response minutes correctly roll over at midnight for a direct-minute target',()=>{
  const profile={
    room_id:3,code:'3.1',title:'Lama respons ambulans',
    measurement_grain:'event',target_text:'≤ 30 menit',target_operator:'<=',target_value:30,
    schema_json:{measurement_type:'door'},
  }
  const result=calculateIndicatorResult(profile,[{
    room_id:3,record_date:'2026-06-01',status:'validated',
    core_data:{indicator_values:{'3.1':{start:'23:55',end:'00:15'}}},
  }],2026)
  assert.equal(result.annualMean,20)
  assert.equal(result.targetMet,true)
})


test('Rawat Jalan reads validated numeric provider-day observations for shared results and diagnostics', () => {
  const profile = { room_id: 11, code: '11.1', target_operator: '=', target_value: 100 }
  const row = (date, minutes, status = 'validated', exclude = false) => ({
    room_id: 11, record_date: date, status,
    core_data: {
      form_fields: { Klinik: 'Klinik Uji', Dokter: 'Dokter Uji', 'Waktu Tunggu Rawat Jalan (Menit)': minutes },
      source_import: { exclude_from_profile_year_metrics: exclude },
      indicator_values: { '11.1': { numerator: 999, denominator: 999 } },
    },
  })
  const rows = [
    row('2026-01-01', 0), row('2026-01-02', 60),
    row('2026-02-01', '59,5 menit'), row('2026-02-02', 40, 'ready'),
    row('2026-02-03', '50 rusak'), row('2026-02-04', 50, 'validated', true),
    row('2025-01-01', 10), { ...row('2026-01-03', 10), room_id: 12 },
  ]
  const [result] = calculateIndicatorResultsForProfiles([profile], rows, 2026)
  assert.equal(result.continuous, false)
  assert.deepEqual([result.annualNumerator, result.annualDenominator, result.annualRate], [2, 3, 66.67])
  assert.equal(result.monthly[0].rate, 50)
  assert.equal(result.monthly[1].rate, 100)
  assert.equal(result.monthly[1].readyRecords, 1)
  assert.equal(result.monthly[2].rate, null)
  assert.equal(result.targetMet, false)
  assert.equal(diagnoseIndicator(profile, rows, 2026).counted, 4)
})


test('provisional results count ready reports without reclassifying them or changing official totals', () => {
  const profile = { room_id: 1, code: '1.1', measurement_grain: 'daily_metric', schema_json: { measurement_type: 'ratio' }, target_value: 50, target_operator: '>=' }
  const rows = Array.from({ length: 13_664 }, (_, index) => qualityRow('2026-01-01', index % 2 ? 'ready' : 'validated', index % 2, 1))
  const excluded = qualityRow('2026-01-01', 'validated', 1, 1)
  excluded.core_data.source_import = { exclude_from_profile_year_metrics: true }
  rows.push(excluded)
  const [provisional] = calculateIndicatorResultsForProfiles([profile], rows, 2026, true)
  const [official] = calculateIndicatorResultsForProfiles([profile], rows, 2026)
  assert.equal(provisional.monthly[0].validatedRecords, 6_832)
  assert.equal(provisional.monthly[0].readyRecords, 6_832)
  assert.equal(provisional.annualDenominator, 13_664)
  assert.equal(provisional.annualRate, 50)
  assert.equal(official.annualDenominator, 6_832)
  assert.equal(official.annualRate, 0)
  assert.equal(rows[1].status, 'ready')
})


test('does not publish ICU visit attainment when the workbook and master disagree on late or absent visits', () => {
  const profile = {
    room_id: 14, code: '14.4', title: 'Kepatuhan Jam Visite Dokter Spesialis',
    options_json: [{ code: 1, label: 'Tidak Visite', numerator: true, denominator: true }],
  }
  const row = {
    room_id: 14, record_date: '2026-01-02', status: 'validated',
    core_data: { indicator_values: { '14.4': { answer: 'Tidak Visite', code: 1 } } },
  }
  assert.equal(calculateIndicatorResult(profile, [row], 2026, true).annualRate, null)
  assert.equal(diagnoseIndicator(profile, [row], 2026).needsProfileSetup, 1)
})

test('metadata reconciliation covers all 64 profiles and each can calculate its workbook observation type', async () => {
  const { readFile } = await import('node:fs/promises')
  const chunks = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    readFile(new URL('../data/quality-profile-2026/chunk-' + String(index + 1).padStart(2, '0') + '.json', import.meta.url), 'utf8').then(JSON.parse),
  ))
  const repaired = chunks.flat().filter(profile => profile.schema_json.metadata_reconciliation_source)
  assert.equal(repaired.length, 64)
  for (const profile of repaired) {
    const schema = profile.schema_json
    assert.ok(profile.numerator_definition?.trim() && profile.denominator_definition?.trim() && profile.unit_of_measure?.trim(), profile.code)
    assert.ok(['positive', 'negative'].includes(schema.indicator_direction), profile.code)
    const option = profile.options_json.find(o => o.code === 1 && o.eligible !== false && !o.review_required)
    const response = schema.response_capture_mode === 'categorical'
      ? { answer: option.label, code: option.code }
      : { numerator: 2, denominator: 4 }
    const row = {
      record_date: '2026-07-01', status: 'validated', room_id: profile.room_id,
      core_data: {
        indicator_values: { [profile.code]: response },
        form_fields: { Klinik: 'Klinik uji', Dokter: 'Dokter uji', 'Waktu Tunggu Rawat Jalan (Menit)': 45 },
      },
    }
    const result = calculateIndicatorResult(profile, [row], 2026)
    assert.equal(result.annualDenominator, profile.code === '11.1' || schema.response_capture_mode === 'categorical' ? 1 : 4, profile.code)
    assert.notEqual(result.annualRate, null, profile.code)
  }
})

test('a workbook can count Code 2 as an event and still accept a historic aggregate record', () => {
  const profile = {
    code: '13.1', schema_json: { measurement_type: 'ratio', response_capture_mode: 'categorical',
      indicator_direction: 'negative', numerator_codes: [2, 3], accept_aggregate_responses: true },
    options_json: [{ label: 'Ditolak', code: 2, numerator: true, denominator: true }],
  }
  const rows = [{ answer: 'Ditolak', code: 2 }, { answer: '', numerator: 1, denominator: 4 }].map(response => ({
    record_date: '2026-07-01', status: 'validated', core_data: { indicator_values: { '13.1': response } },
  }))
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.deepEqual([result.annualNumerator, result.annualDenominator, result.annualRate], [2, 5, 40])
})
