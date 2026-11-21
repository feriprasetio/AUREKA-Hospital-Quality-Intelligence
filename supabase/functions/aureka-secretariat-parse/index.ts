// AUREKA Zero-File Storage: retired Secretariat binary Storage endpoint.
// Source files are parsed exclusively inside the user's browser.
// Keeping a minimal JWT-protected 410 response avoids breaking old bookmarks
// or silently re-enabling server-side file access after a redeployment.
const allowedOrigins = new Set(["https://feriprasetio.github.io", "http://localhost:3000"]);
Deno.serve((request: Request): Response => {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "X-Aureka-File-Policy": "data-only",
  });
  if (allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }
  // Do not read request.body, reach Storage, log file metadata or persist bytes.
  return new Response(JSON.stringify({
    error: "ENDPOINT_RETIRED_ZERO_FILE",
    message: "Endpoint pemrosesan file server telah dinonaktifkan. Gunakan pembaca dokumen lokal AUREKA dan simpan hasil ekstraksi terstruktur.",
    storage_policy: "data-only",
  }), { status: 410, headers });
});
