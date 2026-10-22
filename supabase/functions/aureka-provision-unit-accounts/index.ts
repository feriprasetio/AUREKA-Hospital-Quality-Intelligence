import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://feriprasetio.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
  });
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomIndex(n: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

function makePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%_-+";
  const all = upper + lower + digits + symbols;
  const chars = [
    upper[randomIndex(upper.length)],
    lower[randomIndex(lower.length)],
    digits[randomIndex(digits.length)],
    symbols[randomIndex(symbols.length)],
  ];
  while (chars.length < 20) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20).replace(/^[._-]+|[._-]+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return reply(405, { error: "Method not allowed" });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (token.length < 50) return reply(401, { error: "Provisioning authorization is invalid or expired." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(500, { error: "Server configuration is incomplete." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const { data: candidate, error: gateReadError } = await admin
    .schema("aureka_system").from("unit_account_provisioning_gate")
    .select("id,expires_at,in_progress,used_at")
    .eq("token_hash", tokenHash).maybeSingle();

  if (gateReadError || !candidate || candidate.used_at || candidate.in_progress || new Date(candidate.expires_at).getTime() <= Date.now()) {
    return reply(401, { error: "Provisioning authorization is invalid, expired, or already used." });
  }

  const { data: locked, error: lockError } = await admin
    .schema("aureka_system").from("unit_account_provisioning_gate")
    .update({ in_progress: true })
    .eq("id", candidate.id).eq("token_hash", tokenHash)
    .is("used_at", null).eq("in_progress", false).gt("expires_at", new Date().toISOString())
    .select("id").maybeSingle();

  if (lockError || !locked) return reply(409, { error: "Provisioning is already running or this token has been consumed." });

  try {
    const [{ data: rooms, error: roomError }, { data: roles, error: roleError }] = await Promise.all([
      admin.from("master_rooms").select("id,code,name").eq("is_active", true).order("sort_order"),
      admin.schema("aureka_system").from("app_roles").select("id,code").in("code", ["PIC", "VALIDATOR"]).eq("is_active", true),
    ]);
    if (roomError) throw new Error(`Cannot load active units: ${roomError.message}`);
    if (roleError) throw new Error(`Cannot load account roles: ${roleError.message}`);
    const roleMap = new Map((roles || []).map((r: any) => [r.code, r.id]));
    if (!roleMap.get("PIC") || !roleMap.get("VALIDATOR")) throw new Error("PIC or VALIDATOR role is missing.");

    const specs = (rooms || []).flatMap((room: any) => {
      const unitSlug = slug(String(room.code || room.name));
      return [
        { room, roleCode: "PIC", username: `pic.${unitSlug}`, fullName: `PIC — ${room.name}` },
        { room, roleCode: "VALIDATOR", username: `validator.${unitSlug}`, fullName: `Validator — ${room.name}` },
      ];
    });
    if (specs.length !== 74 || new Set(specs.map((x: any) => x.username)).size !== specs.length) {
      throw new Error(`Expected exactly 74 unique accounts for active units; found ${specs.length}.`);
    }
    if (specs.some((x: any) => x.username.length > 30 || !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(x.username))) {
      throw new Error("At least one generated username does not meet the AUREKA username rules.");
    }

    const usernames = specs.map((x: any) => x.username);
    const { data: existingRows, error: profileError } = await admin
      .schema("aureka_system").from("user_profiles")
      .select("user_id,username,is_active,must_change_password")
      .in("username", usernames);
    if (profileError) throw new Error(`Cannot check existing usernames: ${profileError.message}`);
    const existingMap = new Map((existingRows || []).map((p: any) => [p.username, p]));
    const alreadyUsed = specs.filter((x: any) => {
      const p: any = existingMap.get(x.username);
      return p && p.is_active && !p.must_change_password;
    });
    if (alreadyUsed.length) {
      throw new Error(`Provisioning stopped to protect accounts already in use: ${alreadyUsed.map((x: any) => x.username).join(", ")}. No passwords were reset.`);
    }

    const credentials: any[] = [];
    for (const spec of specs) {
      const password = makePassword();
      const email = `${spec.username}@aureka.invalid`;
      const userMetadata = {
        full_name: spec.fullName,
        primary_room_id: String(spec.room.id),
        username: spec.username,
        must_change_password: true,
      };
      const existing: any = existingMap.get(spec.username);
      let userId: string;

      if (existing) {
        userId = existing.user_id;
        const { error: resetError } = await admin.auth.admin.updateUserById(userId, {
          email,
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        });
        if (resetError) throw new Error(`Cannot reset initial credentials for ${spec.username}: ${resetError.message}`);
      } else {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        });
        if (createError || !created.user) throw new Error(`Cannot create ${spec.username}: ${createError?.message || "Auth did not return a user"}`);
        userId = created.user.id;
      }

      const { error: profileUpdateError } = await admin.schema("aureka_system").from("user_profiles").update({
        full_name: spec.fullName,
        email,
        username: spec.username,
        primary_room_id: spec.room.id,
        role_id: roleMap.get(spec.roleCode),
        is_active: true,
        deactivated_at: null,
        must_change_password: true,
        must_change_password_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (profileUpdateError) throw new Error(`Cannot assign ${spec.username} to its unit: ${profileUpdateError.message}`);

      const { error: assignmentError } = await admin.schema("aureka_system").from("user_room_assignments").upsert({
        user_id: userId,
        room_id: spec.room.id,
        is_primary: true,
        is_active: true,
      }, { onConflict: "user_id,room_id" });
      if (assignmentError) throw new Error(`Cannot assign unit for ${spec.username}: ${assignmentError.message}`);

      credentials.push({
        unit: spec.room.name,
        unit_code: spec.room.code,
        role: spec.roleCode === "PIC" ? "PIC unit" : "Validator unit",
        username: spec.username,
        initial_password: password,
        must_change_password_on_first_login: true,
      });
    }

    const { error: finishError } = await admin.schema("aureka_system").from("unit_account_provisioning_gate")
      .update({ used_at: new Date().toISOString(), in_progress: false })
      .eq("id", candidate.id);
    if (finishError) throw new Error(`Accounts were created, but the one-time gate could not be finalized: ${finishError.message}`);

    return reply(200, {
      success: true,
      accounts_created_or_reset: credentials.length,
      active_units: rooms?.length || 0,
      password_policy: "Each initial password is unique; password change is enforced on first login.",
      credentials,
    });
  } catch (e) {
    await admin.schema("aureka_system").from("unit_account_provisioning_gate")
      .update({ in_progress: false }).eq("id", candidate.id).is("used_at", null);
    return reply(500, { error: e instanceof Error ? e.message : "Account provisioning failed. Retry after checking the database state." });
  }
});