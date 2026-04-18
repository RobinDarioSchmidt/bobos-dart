import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { LEGACY_TEST_EMAILS, TEST_USERS } from "@/lib/test-users";
import { authorizeAdminEmailRequest } from "@/lib/server/request-auth";

type CreateUserPayload = {
  email: string;
  password: string;
  displayName: string;
};

type AdminManagedUser = {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  createdAt: string;
};

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

async function deleteUsersByEmails(emails: string[]) {
  const { adminClient } = getSupabaseAdminClients();
  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    return [{ ok: false as const, email: "list-users", error: error.message }];
  }

  const existingUsers = data.users.filter((user) => user.email && emails.includes(user.email));
  const results = [];

  for (const user of existingUsers) {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    results.push({
      ok: !deleteError,
      email: user.email ?? user.id,
      error: deleteError?.message,
    });
  }

  return results;
}

async function listManagedUsers() {
  const { adminClient } = getSupabaseAdminClients();
  const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
    adminClient.auth.admin.listUsers({ page: 1, perPage: 200 }),
    adminClient
      .from("profiles")
      .select("id, display_name, username, created_at")
      .order("created_at", { ascending: true }),
  ]);

  if (authError) {
    throw new Error(authError.message ?? "auth_list_failed");
  }

  if (profileError) {
    throw new Error(profileError.message);
  }

  const emailById = new Map(
    authUsers.users
      .filter((user) => Boolean(user.email))
      .map((user) => [user.id, user.email ?? ""]),
  );

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: emailById.get(profile.id) ?? "",
    displayName: profile.display_name,
    username: profile.username,
    createdAt: profile.created_at,
  })) satisfies AdminManagedUser[];
}

async function updateManagedUser(payload: { userId: string; displayName: string; password?: string }) {
  const { adminClient } = getSupabaseAdminClients();

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ display_name: payload.displayName })
    .eq("id", payload.userId);

  if (profileError) {
    return { ok: false as const, error: profileError.message };
  }

  if (payload.password) {
    const { error: passwordError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      password: payload.password,
    });
    if (passwordError) {
      return { ok: false as const, error: passwordError.message };
    }
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  const authResult = await authorizeAdminEmailRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  try {
    const users = await listManagedUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "user_list_failed" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const authResult = await authorizeAdminEmailRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const body = (await request.json()) as
    | { action: "seed" }
    | { action: "reset-seed" }
    | { action: "create"; email: string; password: string; displayName: string }
    | { action: "update"; userId: string; displayName: string; password?: string };

  if (body.action === "reset-seed") {
    const emailsToDelete = [...LEGACY_TEST_EMAILS, ...TEST_USERS.map((user) => user.email)];
    const deleteResults = await deleteUsersByEmails(emailsToDelete);
    const createResults = [];
    for (const user of TEST_USERS) {
      createResults.push(await createOneUser(user));
    }

    return NextResponse.json({ deleteResults, results: createResults });
  }

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

  if (body.action === "update") {
    const result = await updateManagedUser({
      userId: body.userId,
      displayName: body.displayName,
      password: body.password?.trim() ? body.password : undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
