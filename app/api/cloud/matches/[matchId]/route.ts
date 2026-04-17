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

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const authResult = await authorizeRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const { matchId } = await context.params;
  const { adminClient } = getSupabaseAdminClients();
  const { user } = authResult;

  const { data: match, error: matchError } = await adminClient
    .from("matches")
    .select("id, owner_id, played_at, mode, double_out, legs_to_win, sets_to_win, status")
    .eq("id", matchId)
    .eq("owner_id", user.id)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: matchError?.message ?? "match_not_found" }, { status: 404 });
  }

  const [{ data: players, error: playersError }, { data: dartEvents, error: dartEventsError }] = await Promise.all([
    adminClient
      .from("match_players")
      .select("match_id, guest_name, seat_index, is_winner, sets_won, legs_won, average, best_visit, profile_id")
      .eq("match_id", matchId)
      .order("seat_index", { ascending: true }),
    adminClient
      .from("dart_events")
      .select("player_name, player_seat_index, segment_label, ring, score, is_hit, is_checkout_dart")
      .eq("owner_id", user.id)
      .eq("source_type", "match")
      .eq("match_id", matchId),
  ]);

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 400 });
  }

  if (dartEventsError) {
    return NextResponse.json({ error: dartEventsError.message }, { status: 400 });
  }

  const playerSummaries = (players ?? []).map((player) => {
    const name = player.guest_name ?? "Gast";
    const playerThrows = (dartEvents ?? []).filter((event) => event.player_seat_index === player.seat_index);
    const topSegments = Object.entries(
      playerThrows.reduce<Record<string, number>>((acc, event) => {
        acc[event.segment_label] = (acc[event.segment_label] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([label, count]) => ({ label, count }));

    return {
      ...player,
      name,
      throwCount: playerThrows.length,
      hits: playerThrows.filter((event) => event.is_hit && event.score > 0).length,
      misses: playerThrows.filter((event) => !event.is_hit || event.score === 0).length,
      checkoutDarts: playerThrows.filter((event) => event.is_checkout_dart).length,
      topSegments,
    };
  });

  return NextResponse.json({
    match,
    players: playerSummaries,
    throwSummary: {
      totalThrows: (dartEvents ?? []).length,
      checkoutDarts: (dartEvents ?? []).filter((event) => event.is_checkout_dart).length,
      misses: (dartEvents ?? []).filter((event) => !event.is_hit || event.score === 0).length,
    },
  });
}
