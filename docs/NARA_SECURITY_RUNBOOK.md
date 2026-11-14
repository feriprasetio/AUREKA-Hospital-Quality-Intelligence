# NARA AI — Security & Production Runbook

## 1. Production architecture
The browser communicates only with the Supabase Edge Function `aureka-tanya`. Groq, NVIDIA NIM, Gemini, DeepSeek, and LLM7 are called from the server-side function. Provider keys never belong in GitHub Pages, `NEXT_PUBLIC_*`, frontend bundles, or source files.

## 2. Supabase project
- Project ref: `ktukmjscopggkzrkgnzp`
- Function: `aureka-tanya`
- Function URL: `https://ktukmjscopggkzrkgnzp.supabase.co/functions/v1/aureka-tanya`
- Keep JWT verification enabled.
- Keep CORS restricted to `https://feriprasetio.github.io`.

## 3. Required production secrets
Set in Supabase Dashboard → Edge Functions → Secrets:

```dotenv
AI_ENVIRONMENT=production
AI_PROVIDER_ORDER=groq,nvidia,gemini,deepseek,llm7
AI_PROVIDER_TIMEOUT_MS=18000
AI_ENABLE_DEEPSEEK=false
AI_ENABLE_LLM7=false
GROQ_API_KEY=<provider key>
NVIDIA_API_KEY=<provider key>
GEMINI_API_KEY=<provider key>
```

Optional:
- `DEEPSEEK_API_KEY`
- `LLM7_API_KEY` (aliases `LLM7.IO_API_KEY` and `LLM7_IO_API_KEY` are supported)
- Provider-specific model override variables.

DeepSeek and LLM7 adapters are available but deliberately disabled by default. Enable only after written approval for external processing, data transfer, contractual privacy, retention, and security review. To opt in, set the respective secret to the exact lowercase string `true`. Do not enable by merely adding an API key.

## 4. GitHub configuration
- GitHub Pages source: GitHub Actions.
- Production frontend workflow: `.github/workflows/deploy-pages.yml`.
- Backend deployment workflow: `.github/workflows/deploy-nara-function.yml`.
- Required GitHub Actions secret: `SUPABASE_ACCESS_TOKEN`.
- Optional Actions variable: `SUPABASE_PROJECT_REF=ktukmjscopggkzrkgnzp`.
- Backend workflow is manual-only and only permits deployment from `main`.

## 5. Privacy boundary
- Authenticated user JWT is validated before data reads.
- Database reads are scoped to the user JWT and RLS.
- Direct identifiers in the question/history are blocked before provider calls.
- Incident table reads are allowlisted to type and timestamp columns only.
- The model receives aggregated data, not raw incident narratives or risk descriptions.
- Small cells are suppressed. This is not a formal anonymisation guarantee.
- Do not enter patient names, MRNs, NIK, dates of birth, contact details, or clinical narratives into NARA.
- Test with synthetic data only.

## 6. Operations and verification
1. Deploy frontend through GitHub Pages workflow only.
2. Deploy backend through the dedicated manual workflow from `main`.
3. Confirm Edge Function is ACTIVE and `verify_jwt=true`.
4. Test login, inactive account denial, aggregate question, privacy block, warmup, timeout, and provider fallback.
5. Verify successful response includes provider/model identifier but never credentials.
6. Review logs for status codes and operational errors; do not log raw user prompts or provider secrets.

## 7. Known limiter limitation
The current rate limiter is an in-memory per-isolate guard (20 requests per 10 minutes per user per isolate). It is not a globally consistent quota across Edge Function instances. A persistent database-backed limiter is required before high-volume or externally exposed use.

## 8. Incident response
Rotate any exposed provider key immediately. Disable the affected provider with its kill switch, inspect restricted logs, assess possible disclosure, and follow hospital privacy and patient-safety incident procedures.
