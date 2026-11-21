/** The same touch-capable tablet/phone breakpoint is used by the drawer and header.
 * CSS mirror: the tablet @media rules in aureka-navigation-system.css and aureka-canvas-preferences.css.
 * A high-DPI Android/iPad browser in desktop-site mode may expose >1180 CSS pixels.
 */
export const TOUCH_DRAWER_MEDIA_QUERY =
  '(max-width: 1180px), (pointer: coarse) and (min-width: 1181px) and (max-width: 1600px)'

export function usesTouchDrawer(match: (query: string) => { matches: boolean }): boolean {
  return match(TOUCH_DRAWER_MEDIA_QUERY).matches
}
