import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const digest = value => createHash('sha256').update(String(value ?? '')).digest('hex')
for (const finding of report ?? []) {
  // No Match, Secret, surrounding source, author, email, or commit message.
  console.log(JSON.stringify({
    rule: finding.RuleID,
    path_hash: digest(finding.File),
    line: finding.StartLine,
    revision_hash: finding.Commit ? digest(finding.Commit) : null
  }))
}
console.log('Redacted finding count:', report?.length ?? 0)
