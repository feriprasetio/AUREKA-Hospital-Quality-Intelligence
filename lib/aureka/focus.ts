// Perintah navigasi lintas modul (mis. klik risiko di Overview → buka risiko itu di Risk Register).
// `nonce` berubah setiap klik agar perintah yang sama tetap dieksekusi ulang.
export type RiskFocus = {
  nonce: number
  riskId?: string
  level?: string
  unitName?: string
  likelihood?: number
  impact?: number
}
export type SafetyFocus = {
  nonce: number
  incidentId?: string
  tab?: 'overview' | 'incidents'
}
export type NavigateFn = (moduleId: string, focus?: Omit<RiskFocus, 'nonce'> | Omit<SafetyFocus, 'nonce'>) => void
