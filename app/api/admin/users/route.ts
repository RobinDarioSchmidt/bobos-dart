import { NextResponse } from "next/server";
import { getSupabaseAdminClients, supabaseAdminEnabled } from "@/lib/supabase-admin";
import { TEST_USERS } from "@/lib/test-users";

type CreateUserPayload = {
  email: string;
  password: string;
  displayName: string;
};

async function authorizeRequest(request: Request) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const authHeader = request.headers.get("authorization");

  if (!supabaseAdminEnabled || !adminEmail || !authHeader?.startsWith("Bearer ")) {
    return { ok: false as const, reason: "missing_config_or_token" };
  }

  const token = authHeader.replace("Bearer ", "");
  const { authClient } = getSupabaseAdminClients();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.email || user.email !== adminEmail) {
    return { ok: false as const, reason: "forbidden" };
  }

  return { ok: true as const };
}

async function createOneUser(payload: CreateUserPayload) {
  const { adminClient } = getSupabaseAdminClients();

  const { data, error } = await adminClient.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      display_name: payload.displayName,
    },
  });

  if (error || !data.user) {
    return {
      ok: false as const,
      email: payload.email,
      error: error?.message ?? "Unknown error",
    };
  }

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: data.user.id,
    display_name: payload.displayName,
    username: payload.email,
  });

  if (profileError) {
    return {
      ok: false as const,
      email: payload.email,
      error: profileError.message,
    };
  }

  return {
    ok: true as const,
    email: payload.email,
  };
}

export async function POST(request: Request) {
  const authResult = await authorizeRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const body = (await request.json()) as
    | { action: "seed" }
    | { action: "create"; email: string; password: string; displayName: string };

  if (body.action === "seed") {
    const results = [];
    for (const user of TEST_USERS) {
      results.push(await createOneUser(user));
    }

    return NextResponse.json({ results });
  }

  if (body.action === "create") {
    const result = await createOneUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
