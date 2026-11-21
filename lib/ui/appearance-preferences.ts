/**
 * Canonical AUREKA appearance preferences.
 * Pure presentation state: no patient data, role permissions, or backend writes.
 * Versioned per-browser storage with validation and backwards-compatible text/motion defaults.
 */
export const APPEARANCE_KEY = 'aureka:appearance:v2'
export const APPEARANCE_EVENT = 'aureka:appearance-change'

export const APPEARANCE_OPTIONS = {
  textSize: ['xs', 's', 'm', 'l'],
  density: ['compact', 'comfortable', 'spacious'],
  surface: ['canvas', 'soft'],
  contrast: ['standard', 'high'],
  dividers: ['subtle', 'none'],
  tableDensity: ['compact', 'regular', 'relaxed'],
  header: ['minimal', 'standard'],
  readingWidth: ['fluid', 'focused'],
  motion: ['on', 'off'],
} as const

export type AppearancePreferences = {
  [K in keyof typeof APPEARANCE_OPTIONS]: (typeof APPEARANCE_OPTIONS)[K][number]
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  textSize: 'm',
  density: 'comfortable',
  surface: 'canvas',
  contrast: 'standard',
  dividers: 'subtle',
  tableDensity: 'regular',
  header: 'minimal',
  readingWidth: 'fluid',
  motion: 'on',
}

export function parseAppearancePreferences(value: unknown): AppearancePreferences {
  const source = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const result: AppearancePreferences = { ...DEFAULT_APPEARANCE }
  for (const key of Object.keys(APPEARANCE_OPTIONS) as (keyof AppearancePreferences)[]) {
    const candidate = source[key]
    if (typeof candidate === 'string' && (APPEARANCE_OPTIONS[key] as readonly string[]).includes(candidate)) {
      ;(result as Record<string, string>)[key] = candidate
    }
  }
  return result
}

export function readAppearancePreferences(storage?: Pick<Storage, 'getItem'> | null): AppearancePreferences {
  try {
    // Accessing the localStorage getter itself can throw in restricted browsers.
    const source = storage === undefined ? (typeof window !== 'undefined' ? window.localStorage : null) : storage
    if (!source) return { ...DEFAULT_APPEARANCE }
    const serialized = source.getItem(APPEARANCE_KEY)
    if (serialized) return parseAppearancePreferences(JSON.parse(serialized))
    // Preserve previously chosen magnification and reduced motion.
    const legacySize = source.getItem('aureka-text-size')
    const textSize = legacySize === 'besar' ? 'l' : legacySize === 'sangat-besar' ? 'l' : 'm'
    const motion = source.getItem('aureka-motion') === 'off' ? 'off' : 'on'
    return { ...DEFAULT_APPEARANCE, textSize, motion }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

const ATTRIBUTE_NAMES: { [K in keyof AppearancePreferences]: string } = {
  textSize: 'data-aureka-text-size',
  density: 'data-aureka-density',
  surface: 'data-aureka-surface',
  contrast: 'data-aureka-contrast',
  dividers: 'data-aureka-dividers',
  tableDensity: 'data-aureka-table-density',
  header: 'data-aureka-header',
  readingWidth: 'data-aureka-reading-width',
  motion: 'data-aureka-motion',
}

export function applyAppearancePreferences(preferences: AppearancePreferences, root?: HTMLElement | null): AppearancePreferences {
  const value = parseAppearancePreferences(preferences)
  const element = root === undefined ? (typeof document !== 'undefined' ? document.documentElement : null) : root
  if (!element) return value
  for (const key of Object.keys(ATTRIBUTE_NAMES) as (keyof AppearancePreferences)[]) {
    element.setAttribute(ATTRIBUTE_NAMES[key], value[key])
  }
  // Keep the legacy reduced-motion selector and its CSS behavior in sync.
  element.setAttribute('data-motion', value.motion)
  return value
}

export function saveAppearancePreferences(preferences: AppearancePreferences): AppearancePreferences {
  const value = applyAppearancePreferences(preferences)
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value)) }
    catch { /* Private browsing: changes still work for the current session. */ }
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: value }))
  }
  return value
}

export function resetAppearancePreferences(): AppearancePreferences {
  return saveAppearancePreferences({ ...DEFAULT_APPEARANCE })
}
