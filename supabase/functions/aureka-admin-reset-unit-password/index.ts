import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return reply(401, { error: "Session Super Admin tidak ditemukan." });

  let body: { user_id?: string; new_password?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Format permintaan tidak valid." });
  }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const newPassword = typeof body.new_password === "string" ? body.new_password : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return reply(400, { error: "ID akun tidak valid." });
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    return reply(400, { error: "Password sementara harus terdiri dari 12–128 karakter." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(500, { error: "Konfigurasi server belum lengkap." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerResult, error: callerError } = await admin.auth.getUser(jwt);
  if (callerError || !callerResult.user) return reply(401, { error: "Sesi Super Admin tidak valid." });

  const callerId = callerResult.user.id;
  const { data: callerProfile, error: callerProfileError } = await admin
    .schema("aureka_system").from("user_profiles")
    .select("is_active,role_id,must_change_password")
    .eq("user_id", callerId).maybeSingle();
  if (callerProfileError || !callerProfile?.is_active || callerProfile.must_change_password) {
    return reply(403, { error: "Akun pemanggil tidak aktif atau masih wajib mengganti password." });
  }

  const { data: callerRole, error: callerRoleError } = await admin
    .schema("aureka_system").from("app_roles")
    .select("code,is_active")
    .eq("id", callerProfile.role_id).maybeSingle();
  if (callerRoleError || callerRole?.code !== "ADMIN" || !callerRole?.is_active) {
    return reply(403, { error: "Hanya Super Admin yang dapat menyetel password akun lain." });
  }

  const { data: target, error: targetError } = await admin
    .schema("aureka_system").from("user_profiles")
    .select("user_id,username,is_active")
    .eq("user_id", userId).maybeSingle();
  if (targetError || !target) return reply(404, { error: "Akun tujuan tidak ditemukan." });

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (authUpdateError) return reply(400, { error: `Password tidak dapat diperbarui: ${authUpdateError.message}` });

  const at = new Date().toISOString();
  const { error: profileUpdateError } = await admin.schema("aureka_system").from("user_profiles")
    .update({ must_change_password: true, must_change_password_at: at, updated_at: at })
    .eq("user_id", userId);
  if (profileUpdateError) {
    return reply(500, { error: "Password telah direset, tetapi penanda wajib ganti password gagal disimpan. Jangan gunakan password ini sebagai permanen; ulangi reset dari Pengaturan." });
  }

  return reply(200, {
    success: true,
    username: target.username,
    must_change_password: true,
    message: "Password sementara disetel. Pemilik akun wajib membuat password baru pada login berikutnya.",
  });
});