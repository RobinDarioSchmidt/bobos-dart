import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { LEGACY_TEST_EMAILS, TEST_USERS } from "@/lib/test-users";
import { authorizeAdminEmailRequest } from "@/lib/server/request-auth";

type CreateUserPayload = {
  email: string;
  password: string;
  displayName: string;
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

export async function POST(request: Request) {
  const authResult = await authorizeAdminEmailRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const body = (await request.json()) as
    | { action: "seed" }
    | { action: "reset-seed" }
    | { action: "create"; email: string; password: string; displayName: string };

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

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
