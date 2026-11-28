# Signature source handling

Do not embed signature images or other identifying source assets in public source files, migrations, build outputs, screenshots, or CI logs. Production assets are managed only in the private database via owner-authorized workflows. Fresh development environments must use synthetic assets; real owners must be provisioned through an approved private process.

The production hardening migration quarantines only known exposed, unused pending assets; it retains rows and event history. Replacement requires the exact active signer identity and role, a new image, server-computed digest, and a separate owner activation. It does not certify an electronic signature. Existing published documents and verification records are not altered.

Public Git history can retain old objects even after the current tree is redacted. Coordinate incident response, removal from history and caches/forks, and notification to the affected owners separately. Do not rewrite shared history without a recovery plan.
