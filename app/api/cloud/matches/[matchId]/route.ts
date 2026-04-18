import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { authorizeSupabaseRequest } from "@/lib/server/request-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const authResult = await authorizeSupabaseRequest(request);
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
      .select("player_name, player_seat_index, visit_index, dart_index, segment_label, ring, score, is_hit, is_checkout_dart, created_at")
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
  const visitTimeline = Object.values(
    (dartEvents ?? []).reduce<
      Record<
        string,
        {
          playerName: string;
          playerSeatIndex: number;
          visitIndex: number;
          score: number;
          darts: string[];
          createdAt: string;
        }
      >
    >((acc, event) => {
      const key = `${event.player_seat_index ?? 0}:${event.visit_index ?? 0}`;
      if (!acc[key]) {
        acc[key] = {
          playerName: event.player_name ?? `Seat ${(event.player_seat_index ?? 0) + 1}`,
          playerSeatIndex: event.player_seat_index ?? 0,
          visitIndex: event.visit_index ?? 0,
          score: 0,
          darts: [],
          createdAt: event.created_at ?? "",
        };
      }
      acc[key].score += event.score;
      acc[key].darts[event.dart_index ?? acc[key].darts.length] = event.segment_label;
      if (!acc[key].createdAt && event.created_at) {
        acc[key].createdAt = event.created_at;
      }
      return acc;
    }, {}),
  ).sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : left.visitIndex;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : right.visitIndex;
    return leftTime - rightTime;
  });
  const scoringProgress = playerSummaries.map((player) => {
    const visits = visitTimeline.filter((entry) => entry.playerSeatIndex === player.seat_index);
    let cumulative = 0;
    return {
      name: player.name,
      points: visits.map((visit) => {
        cumulative += visit.score;
        return {
          label: `V${visit.visitIndex + 1}`,
          visitScore: visit.score,
          cumulative,
        };
      }),
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
    visitTimeline,
    scoringProgress,
  });
}
