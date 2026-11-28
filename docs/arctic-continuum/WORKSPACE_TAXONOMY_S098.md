# Continuum workspace taxonomy and session pins (P2/S098 pilot)

This increment registers the 16 v2 taxonomy identifiers and maps existing canonical domain sections to the intended archetype. The existing 10-layout renderer remains intact; the new attribute is a migration contract, not proof all target layouts exist. Public and presentation archetypes are registered but do not create new routes or renderers.

Opt-in data-first users can pin up to six current section destinations from the navigation options, open them through the existing access-checked dispatcher, and remove pins. Pins are static allowlisted route metadata only, in memory; the component remounts on account, role, unit, permission or visible menu changes. Rollback clears pins. No clinical records, draft content, filter values, or credentials are persisted. This is a shortcut pilot, not multi-pane live state or cross-reload session restore. Those capabilities and dirty-form handling require further acceptance.

Unit tests and synthetic Chromium checks added. CI must run on this commit. Dependency Review remains blocked by repository configuration; staging, role/unit DB acceptance, formula/export parity, WCAG and full v2 acceptance remain open. No DB migrations or new dependencies.
