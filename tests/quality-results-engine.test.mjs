import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateClinicalDeathAudits,
  aggregateClinicalPathwayRows,
  aggregatePathwayByMonth,
  calculateIndicatorResult,
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
  assert.equal(result.annualNumerator, 9)
  assert.equal(result.annualDenominator, 12)
  assert.equal(result.annualRate, 75)
  assert.equal(result.monthlyMeanRate, 65)
  assert.equal(result.readyRecords, 0)
  assert.equal(result.validatedRecords, 2)
  assert.equal(result.observations, 2)
  assert.equal(result.targetMet, false)
  assert.equal(result.latestInputAt, '2026-02-05T08:00:00Z')
  assert.equal(result.monthly[0].rate, 50)
  assert.equal(result.monthly[0].readyRecords, 0)
  assert.equal(result.monthly[1].validatedRecords, 1)
  assert.equal(result.monthly[2].rate, null)
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

test('negative option indicators count codes 2 and 3 as events against all classified responses', () => {
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
  assert.equal(result.annualNumerator, 2)
  assert.equal(result.annualDenominator, 20)
  assert.equal(result.annualRate, 10)
  assert.equal(result.targetMet, false)
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
      status: 'ready',
      core_data: { indicator_values: { '33.2': {
        answer: 'Ruptur faktor ibu', code: 2, source_code: 2,
        review_required: true, mapping_status: 'mapped_pending_classification',
      } } },
    },
    {
      record_date: '2026-04-02',
      status: 'ready',
      core_data: { indicator_values: { '33.2': {
        answer: 'Aman', code: 1, source_code: 1,
        review_required: false, mapping_status: 'mapped',
      } } },
    },
    {
      record_date: '2026-04-03',
      status: 'ready',
      core_data: { indicator_values: { '33.2': {
        answer: 'Ruptur faktor teknis', code: 3, source_code: 2,
        review_required: true, mapping_status: 'source_code_conflict',
      } } },
    },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 50)
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
    { record_date: '2026-05-01', status: 'ready', core_data: { indicator_values: { '19.2': {
      answer: 'IMD dilakukan', code: 1, source_code: 1, review_required: true, mapping_status: 'mapped_pending_classification',
    } } } },
    { record_date: '2026-05-02', status: 'ready', core_data: { indicator_values: { '19.2': {
      answer: 'Ibu tidak stabil', code: 2, source_code: 2, review_required: true, mapping_status: 'mapped_pending_classification',
    } } } },
    { record_date: '2026-05-03', status: 'ready', core_data: { indicator_values: { '19.2': {
      answer: 'Petugas tidak melakukan IMD', code: 3, source_code: 3, review_required: true, mapping_status: 'mapped_pending_classification',
    } } } },
  ]
  const result = calculateIndicatorResult(profile, rows, 2026)
  assert.equal(result.annualNumerator, 1)
  assert.equal(result.annualDenominator, 2)
  assert.equal(result.annualRate, 50)
  assert.equal(result.observations, 2)
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
