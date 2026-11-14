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
AI_ENABLE_DEEPSEEK=false
AI_ENABLE_LLM7=false
GROQ_API_KEY=<your Groq key>
NVIDIA_API_KEY=<your NVIDIA key>
GEMINI_API_KEY=<your Gemini key>
```

Optional provider secrets:
- `DEEPSEEK_API_KEY`
- `LLM7_API_KEY` (or legacy aliases `LLM7.IO_API_KEY`, `LLM7_IO_API_KEY`)

Optional model overrides should be set only to model IDs verified in the corresponding provider account/documentation. `AI_PROVIDER_ORDER` changes provider priority; the gateway automatically appends any other enabled provider so an older three-provider value cannot silently omit DeepSeek/LLM7. The function tries up to three configured models per provider and applies a bounded total provider-route budget.

### Provider activation policy

Groq, NVIDIA, and Gemini are the default eligible providers. DeepSeek and LLM7 are implemented and routable, but require explicit server-side opt-in:
- `AI_ENABLE_DEEPSEEK=true`
- `AI_ENABLE_LLM7=true`

Keep both `false` until hospital governance has approved the provider, contractual privacy terms, data residency/transfer, retention, and security review. A key being present does not enable either provider. The frontend cannot change these flags.

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
