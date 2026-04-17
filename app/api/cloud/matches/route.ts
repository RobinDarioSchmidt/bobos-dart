import { NextResponse } from "next/server";
import { getSupabaseAdminClients, supabaseAdminEnabled } from "@/lib/supabase-admin";

async function authorizeRequest(request: Request) {
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

export async function GET(request: Request) {
  const authResult = await authorizeRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const { adminClient } = getSupabaseAdminClients();
  const { user } = authResult;

  const { data: matches, error: matchesError } = await adminClient
    .from("matches")
    .select("id, played_at, mode, double_out")
    .eq("owner_id", user.id)
    .order("played_at", { ascending: false })
    .limit(8);

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 400 });
  }

  const matchIds = (matches ?? []).map((match) => match.id);
  if (matchIds.length === 0) {
    return NextResponse.json({ matches: [], players: [] });
  }

  const { data: players, error: playersError } = await adminClient
    .from("match_players")
    .select("match_id, guest_name, seat_index, is_winner, sets_won")
    .in("match_id", matchIds)
    .order("seat_index", { ascending: true });

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 400 });
  }

  return NextResponse.json({
    matches: matches ?? [],
    players: players ?? [],
  });
}
