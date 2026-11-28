import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const origin = "https://feriprasetio.github.io";
const redirectTo = origin + "/AUREKA-Hospital-Quality-Intelligence/";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  "Vary": "Origin",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  if (req.headers.get("Origin") && req.headers.get("Origin") !== origin) return reply(403, { error: "Origin not allowed" });
  try {
    if (Number(req.headers.get("Content-Length") || 0) > 4096) return reply(413, { error: "Request too large" });
    const raw = await req.text();
    if (raw.length > 4096) return reply(413, { error: "Request too large" });
    let body;
    try { body = JSON.parse(raw); } catch { return reply(400, { error: "Invalid request" }); }
    const action = body?.action;
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!["login", "recover", "resend"].includes(action) || !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username) ||
        (action === "login" && (!password || password.length > 128))) {
      return reply(400, { error: "Invalid request" });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return reply(503, { error: "Layanan autentikasi belum tersedia." });
    const config = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const admin = createClient(url, service, config);
    const client = createClient(url, anon, config);
    const limit = await admin.rpc("aureka_consume_public_auth_limit", { p_action: action, p_subject: username });
    if (limit.error) return reply(503, { error: "Layanan autentikasi belum tersedia." });
    if (limit.data !== false) return reply(429, { error: "Too many requests" });
    const lookup = await admin.rpc("aureka_login_email", { p_username: username });
    if (lookup.error) return reply(503, { error: "Layanan autentikasi belum tersedia." });
    const email = typeof lookup.data === "string" ? lookup.data : "";
    if (action !== "login") {
      if (email && !email.toLowerCase().endsWith("@aureka.invalid")) {
        const result = action === "recover"
          ? await client.auth.resetPasswordForEmail(email, { redirectTo })
          : await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
        if (result.error && result.error.status === 429) return reply(429, { error: "Too many requests" });
      }
      // Do not disclose whether a username exists or where mail was sent.
      return reply(200, { ok: true });
    }
    if (!email) return reply(401, { error: "Invalid login credentials" });
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error || !result.data.session) {
      if (result.error?.status === 429) return reply(429, { error: "Too many requests" });
      if (result.error?.code === "email_not_confirmed") return reply(401, { error: "Email not confirmed" });
      return reply(401, { error: "Invalid login credentials" });
    }
    // Only a successful password verification can return session tokens.
    return reply(200, { access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token });
  } catch {
    return reply(503, { error: "Layanan autentikasi belum tersedia." });
  }
});
