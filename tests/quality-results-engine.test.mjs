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
