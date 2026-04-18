import { getSupabaseAdminClients, supabaseAdminEnabled } from "@/lib/supabase-admin";

export async function authorizeSupabaseRequest(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!supabaseAdminEnabled) {
    return { ok: false as const, reason: "missing_service_role_or_supabase_config" };
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false as const, reason: "missing_bearer_token" };
  }

  const token = authHeader.replace("Bearer ", "");
  const { authClient } = getSupabaseAdminClients();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error) {
    return { ok: false as const, reason: `invalid_token:${error.message}` };
  }

  if (!user) {
    return { ok: false as const, reason: "missing_user" };
  }

  return { ok: true as const, user };
}

export async function authorizeAdminEmailRequest(request: Request) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const authResult = await authorizeSupabaseRequest(request);

  if (!authResult.ok) {
    return authResult;
  }

  if (!adminEmail) {
    return { ok: false as const, reason: "missing_admin_email" };
  }

  if (!authResult.user.email) {
    return { ok: false as const, reason: "missing_user_email" };
  }

  if (authResult.user.email !== adminEmail) {
    return { ok: false as const, reason: `admin_email_mismatch:${authResult.user.email}` };
  }

  return authResult;
}
