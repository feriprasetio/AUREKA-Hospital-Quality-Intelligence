# NARA AI Gateway — Production Configuration

## Architecture
- GitHub Pages serves only the static AUREKA frontend.
- The authenticated frontend calls the Supabase Edge Function `aureka-tanya`.
- All five provider adapters run server-side: Groq, NVIDIA NIM, Gemini, DeepSeek, and LLM7.io.
- Provider credentials are Supabase Edge Function secrets only. Never expose them in the browser, GitHub Pages, source code, or build variables.
- Database reads use the authenticated user's JWT and existing RLS policies. The provider receives only the minimized aggregate snapshot.

## Provider matrix

| Provider | Secret | Model override | Endpoint |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` | `https://api.groq.com/openai/v1/chat/completions` |
| NVIDIA NIM | `NVIDIA_API_KEY` | `NVIDIA_MODEL` | `https://integrate.api.nvidia.com/v1/chat/completions` |
| Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Google generateContent |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `https://api.deepseek.com/chat/completions` |
| LLM7.io | `LLM7_API_KEY` (aliases supported) | `LLM7_MODEL` | `https://api.llm7.io/v1/chat/completions` |

## Production secrets

Set these in Supabase Dashboard → Edge Functions → Secrets:

```dotenv
AI_ENVIRONMENT=production
AI_PROVIDER_ORDER=groq,nvidia,gemini,deepseek,llm7
AI_PROVIDER_TIMEOUT_MS=18000
AI_ENABLE_DEEPSEEK=false   # kill switch; remove/omit to activate when the API key exists
AI_ENABLE_LLM7=false       # kill switch; remove/omit to activate when the API key exists
GROQ_API_KEY=<your Groq key>
NVIDIA_API_KEY=<your NVIDIA key>
GEMINI_API_KEY=<your Gemini key>
```

Optional provider secrets:
- `DEEPSEEK_API_KEY`
- `LLM7_API_KEY` (or legacy aliases `LLM7.IO_API_KEY`, `LLM7_IO_API_KEY`)

Optional model overrides should be set only to model IDs verified in the corresponding provider account/documentation. `AI_PROVIDER_ORDER` changes provider priority; the gateway automatically appends any other enabled provider so an older three-provider value cannot silently omit DeepSeek/LLM7. The function tries up to three configured models per provider and applies a bounded total provider-route budget.

### Provider activation policy

All five providers are eligible when the corresponding server-side API secret is configured:
- Groq: `GROQ_API_KEY`
- NVIDIA NIM: `NVIDIA_API_KEY`
- Gemini: `GEMINI_API_KEY`
- DeepSeek: `DEEPSEEK_API_KEY`
- LLM7.io: `LLM7_API_KEY` or its supported legacy aliases

`AI_PROVIDER_ORDER` determines priority. The gateway appends the remaining eligible providers as fallbacks. DeepSeek and LLM7 are not opt-in gated; use `AI_ENABLE_DEEPSEEK=false` or `AI_ENABLE_LLM7=false` as an explicit emergency/governance kill switch. Never put API values in frontend code or repository variables.

The availability of a key does not by itself prove a successful live call. Provider success, quota, endpoint compatibility, and actual response must be confirmed in runtime logs and authenticated smoke tests.

## Privacy and security controls
1. Edge Function JWT verification remains enabled.
2. The handler independently validates the user JWT and active AUREKA profile.
3. All database access is scoped to the caller JWT so RLS applies.
4. Direct identifiers in question/history are blocked before provider calls.
5. Incident reads are restricted to `incident_type`, `type`, and `created_at`; no incident free text or patient identifiers are fetched for the AI snapshot.
6. Small aggregate cells are suppressed; suppression is a risk reduction, not a guarantee of anonymity.
7. Request size and request rate are bounded. The in-memory limiter is per function isolate and is not a globally consistent quota; implement a persistent limiter before high-volume public exposure.
8. Internal server/provider errors are not echoed to the browser.
9. No service-role key is sent to a provider or browser.
10. Medical record numbers (No. RM) may be used inside a protected database function for joins/deduplication and access auditing only. They are not sent to external LLM providers.
11. Patient names, NIK, contact details, episode identifiers, raw narrative incident records, staff names and direct identifiers are excluded from external model context. Clinical analytics returns de-identified grouped diagnosis terms/counts with minimum cell size 5.
12. The clinical source basis is labelled. The latest diagnosis per patient in patient_index is the primary ranking source whenever eligible rows exist. Episode data are always reported separately and never mixed into the patient denominator; episodes are only the primary fallback when no eligible patient-index diagnoses exist.
13. ICD-10 AI outputs are proposals only. Every proposed mapping remains `proposed`; only authorized ADMIN/PMKP reviewers may validate it after checking the WHO ICD-10 tabular list and recording a validation reference. Ambiguous shorthand is never auto-approved.

## Clinical intelligence and ICD-10 workflow

- aureka_nara_clinical_summary performs SQL-side MRN deduplication and returns only grouped diagnosis labels/counts, source-basis metadata, and a PHI-free access audit. The LLM receives no MRN or patient name.
- The patient index is the primary patient-level source whenever eligible diagnosis_terakhir values exist in the authenticated user's permitted rooms and selected year. The ranking means one latest diagnosis per indexed patient, not every visit or full diagnosis history.
- quality_records patient-episode data are counted separately as an episode context (episode count, unique patients, analyzable diagnosis rows, and suppressed diagnosis groups). They are not added to the patient-index denominator. Episode data are used as the primary ranking basis only when no eligible patient-index diagnoses exist.
- Diagnosis normalization is deterministic for case, punctuation, and repeated whitespace. Typographical variants are not silently merged. The protected ICD-10 queue uses aggregated diagnosis labels with at least five unique patients, no identifiers, and the same authenticated room scope.
- A user can request ICD-10 proposals in chat or launch Validasi ICD-10 in the NARA workspace. The backend processes new unmapped terms in bounded batches through the configured AI provider route. Every model response is validated against the exact input allowlist and code format, then stored as proposed only.
- Only ADMIN/PMKP can access the review queue and save mappings. A reviewer must enter the official code title and a validation reference before marking a mapping validated. Equivalent spelling/alias variants may then be mapped to the same code and grouped in subsequent analytics; distinct clinical conditions must never be merged merely because their wording is similar.
- Reference code set currently configured: WHO ICD-10 Version 2019. Check the official [WHO ICD-10 browser](https://icd.who.int/browse10/2019/en) for the final code/title/inclusion/exclusion notes.

## GitHub Actions deployment
- Frontend: `.github/workflows/deploy-pages.yml` publishes static output to GitHub Pages from `main`.
- Backend: `.github/workflows/deploy-nara-function.yml` is manual-only and refuses to deploy from a non-main branch.
- GitHub repository secret required: `SUPABASE_ACCESS_TOKEN`.
- Optional repository variable: `SUPABASE_PROJECT_REF`; fallback is `ktukmjscopggkzrkgnzp`.
- The deployment command does not disable JWT verification.

## Verification
After a deployment:
1. Confirm Supabase Edge Function `aureka-tanya` is ACTIVE and `verify_jwt=true`.
2. Confirm required provider secret names exist; never print secret values.
3. Test with a logged-in test account and synthetic data only.
4. Test valid question, invalid JWT, inactive profile, privacy guard, warmup, request limit, timeout, and fallback.
5. Verify provider identity in successful response metadata without exposing API keys.
6. Inspect Edge Function logs for provider status codes, not raw prompts or secret values.

## Incident response
If a provider key may be exposed, revoke/rotate it at the provider and update the Supabase secret. If patient-identifiable data may have been sent externally, disable the relevant provider, preserve logs under access control, assess impact, and follow hospital incident/privacy governance.
