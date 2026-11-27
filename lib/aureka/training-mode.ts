// Older site builds could opt a tab into simulated writes on the live system.
// Block backend traffic for that legacy state until the user explicitly exits.
const LEGACY_TRAINING_KEY = 'aureka-latihan'

export function isLegacyTrainingMode(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(LEGACY_TRAINING_KEY) === '1'
  } catch {
    return false
  }
}

export function exitLegacyTrainingMode(): void {
  window.localStorage.removeItem(LEGACY_TRAINING_KEY)
}
