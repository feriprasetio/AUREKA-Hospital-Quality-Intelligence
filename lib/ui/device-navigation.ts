/**
 * AUREKA device contract.
 * Only phone-sized viewports may turn the persistent sidebar into a modal drawer.
 * Pointer type is deliberately excluded: touch-enabled laptops, external monitors,
 * large Android tablets and browsers in desktop-site mode keep the normal sidebar.
 * CSS mirror: @media (max-width: 720px) in aureka-navigation-system.css.
 */
export const PHONE_DRAWER_MEDIA_QUERY = '(max-width: 720px)'

export function usesPhoneDrawer(match: (query: string) => { matches: boolean }): boolean {
  return match(PHONE_DRAWER_MEDIA_QUERY).matches
}
