# AUREKA UI/UX — Phase 0 Design System Specification

**Status:** Approved  
**Decision date:** 2 November 2026  
**Implementation branch:** `feat/ui-ux-redesign`  
**Visual direction:** Solid Enterprise Design / Solid Default  
**Migration strategy:** Progressive CSS migration  
**Scope:** Public landing, authentication, dashboard, and all workspaces

## 1. Approved decisions

| Area | Approved decision |
|---|---|
| Visual system | Solid Default, clean enterprise surfaces |
| Brand palette | Proposed AUREKA institutional green palette |
| CSS strategy | Progressive migration; no mass replacement |
| Tailwind CSS 4 | Deferred until the CSS foundation is stable |
| Landing and authentication | Solid Default |
| Scope | Entire AUREKA application |
| Business logic | Frozen; no domain-engine or data-contract changes |
| Dependencies in Phase 0 | None |

## 2. Design principles

1. Operational clarity takes precedence over decorative effects.
2. White surfaces, subtle borders, restrained shadows, and readable typography form the default workspace language.
3. AUREKA institutional green remains the primary brand identity.
4. Status and risk colors retain their existing operational meaning.
5. UI state must never be represented as a successful save until the underlying operation confirms success.
6. Existing workflows, fields, permissions, navigation hashes, keyboard interactions, and import/export contracts must be preserved during migration.
7. The design system is opt-in during Phase 0. Existing components must not change appearance merely because tokens are loaded.

## 3. Color tokens

| Token | Value | Intended use |
|---|---|---|
| Primary | `#0F7656` | Main action and brand |
| Primary hover | `#0B5D44` | Hover state |
| Primary active / sidebar | `#084F3A` | Active state and navigation |
| Primary soft | `#ECF7F1` | Subtle brand background |
| Background | `#F3F6F4` | Workspace canvas |
| Surface | `#FFFFFF` | Cards, forms, dialogs |
| Surface muted | `#F8FAF9` | Subtle grouping |
| Foreground | `#1E293B` | Primary text |
| Muted | `#64748B` | Supporting text |
| Border | `#E5E7EB` | Standard boundaries |
| Ring | `rgba(15,118,86,.32)` | Focus indicator |

Feedback colors:
- Success: `#15803D`
- Warning: `#D97706`
- Danger: `#DC2626`
- Information: `#2563EB`

Clinical risk colors are retained:
- Very low: `#23ABD4`
- Low: `#71C965`
- Moderate: `#ECC93D`
- High: `#F59D3B`
- Very high: `#F05A5B`

Do not reuse these clinical risk colors for unrelated workflow states. Their semantics belong to the risk scoring model and presentation.

## 4. Typography

Preferred font stack: Aptos, Segoe UI, system-ui, sans-serif. Do not distribute font files or introduce a remote font dependency in Phase 0.

| Role | Target size |
|---|---:|
| Page title | 24–28 px |
| Section heading | 18–20 px |
| Card heading | 15–16 px |
| Body | 14 px |
| Form label | 12–13 px |
| Supporting metadata | 12 px minimum |
| Dense table text | 12–13 px, subject to readability testing |

The token file defines an opt-in stack and scale. It does not globally override existing component typography.

## 5. Spacing, shape, elevation

- Spacing base: 4 px.
- Form and button heights: generally 40–44 px.
- Card padding: generally 16–20 px.
- Touch targets: minimum 44 × 44 px where practical.
- Input radius: 8 px.
- Button radius: 8–10 px.
- Card radius: 12 px.
- Dialog radius: 12–14 px.
- Workspace cards use solid white surfaces, a subtle 1 px border, and restrained shadows.
- Backdrop blur is reserved for overlays where it materially improves focus; it is not a default card treatment.

## 6. Responsive layout targets

| Viewport | Expected behavior |
|---|---|
| 1280 px and above | Full desktop workspace |
| 1024–1279 px | Compact desktop |
| 768–1023 px | Tablet; compact or rail navigation |
| 480–767 px | Mobile drawer |
| 375–479 px | Compact mobile layout |

These values are design targets, not yet implemented behavior. Verify the existing application before changing any breakpoint.

## 7. Token architecture

`app/design-tokens.css` is the single namespaced token foundation for progressive migration. All tokens use the `--aureka-` prefix to avoid collisions with current legacy variables.

The tokens are loaded after existing stylesheets in the root layout. Phase 0 intentionally does not:
- apply a global reset;
- change `html`, `body`, or workspace typography;
- restyle any existing component;
- alter legacy variable values;
- change theme behavior;
- introduce Tailwind, shadcn/ui, next-themes, cmdk, or lucide-react.

Individual components may adopt these tokens only in a later, separately reviewed migration step.

## 8. Architecture and deployment constraints

The application uses Next.js App Router with `output: 'export'`, a GitHub Pages `basePath`, and Supabase as the backend.

Therefore:
- preserve static export compatibility;
- do not introduce runtime-dependent Server Component data fetching;
- keep authorization, RLS, and business transactions in the established Supabase domain layer;
- do not put secrets or service-role credentials in client code;
- do not change Supabase schemas, RPC, Edge Functions, or storage policies as part of UI work.

## 9. Protected scope

No changes are permitted in:
- `lib/aureka/*.ts`;
- indicator, risk, OPPE, FPPE, clinical pathway, or patient-safety engines;
- Supabase client configuration, SQL migrations, RPC contracts, or Edge Functions;
- master indicator definitions, workbook mapping, or import/export contracts;
- data access control, role logic, or RLS behavior.

A UI-only refactor must preserve all existing input fields, validation rules, IDs, labels where operationally meaningful, workflows, and data payload contracts.

## 10. Phase 0 exit criteria

- Token file is namespaced and has no global visual side effects.
- Existing stylesheets remain in place.
- Root layout renders correctly and keeps all current CSS imports.
- No dependency is added.
- No protected business-logic or Supabase file changes.
- Current unit tests, data validation, TypeScript check, and static build pass in a reproducible local/CI environment.
- The CSS inventory and unresolved audit items are documented.
- No claim of WCAG conformance or zero bugs is made without dedicated tests.
