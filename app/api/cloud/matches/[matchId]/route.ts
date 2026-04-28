import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { fetchAccessibleFinishedMatches } from "@/lib/server/cloud-match-access";
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

  let accessible;
  try {
    accessible = await fetchAccessibleFinishedMatches(adminClient, user.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "match_access_failed" }, { status: 400 });
  }

  const match = accessible.matches.find((entry) => entry.id === matchId) ?? null;
  if (!match) {
    return NextResponse.json({ error: "match_not_found" }, { status: 404 });
  }

  const players = accessible.players
    .filter((player) => player.match_id === matchId)
    .map((player) => ({
      match_id: player.match_id,
      guest_name: player.guest_name,
      seat_index: player.seat_index,
      is_winner: player.is_winner,
      sets_won: player.sets_won,
      legs_won: player.legs_won ?? 0,
      average: player.average ?? 0,
      best_visit: player.best_visit ?? 0,
      profile_id: player.profile_id,
    }));

  const { data: dartEvents, error: dartEventsError } = await adminClient
    .from("dart_events")
    .select("player_name, player_seat_index, visit_index, dart_index, segment_label, ring, score, is_hit, is_checkout_dart, board_x, board_y, created_at")
    .eq("owner_id", match.owner_id)
    .eq("source_type", "match")
    .eq("match_id", matchId);

  if (dartEventsError) {
    return NextResponse.json({ error: dartEventsError.message }, { status: 400 });
  }

  const playerSummaries = players.map((player) => {
    const name = player.guest_name ?? "Gast";
    const playerThrows = (dartEvents ?? []).filter((event) => event.player_seat_index === player.seat_index);
    const playerVisits = Object.values(
      playerThrows.reduce<
        Record<
          string,
          {
            visitIndex: number;
            score: number;
            darts: string[];
            checkout: boolean;
          }
        >
      >((acc, event) => {
        const key = String(event.visit_index ?? 0);
        if (!acc[key]) {
          acc[key] = {
            visitIndex: event.visit_index ?? 0,
            score: 0,
            darts: [],
            checkout: false,
          };
        }
        acc[key].score += event.score;
        acc[key].darts[event.dart_index ?? acc[key].darts.length] = event.segment_label;
        if (event.is_checkout_dart) {
          acc[key].checkout = true;
        }
        return acc;
      }, {}),
    );
    const topSegments = Object.entries(
      playerThrows.reduce<Record<string, number>>((acc, event) => {
        acc[event.segment_label] = (acc[event.segment_label] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([label, count]) => ({ label, count }));
    const checkoutRoutes = playerVisits
      .filter((visit) => visit.checkout)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map((visit) => ({
        route: visit.darts.filter(Boolean).join(" - "),
        score: visit.score,
      }));
    const tonPlusVisits = playerVisits.filter((visit) => visit.score >= 100).length;
    const tonFortyPlus = playerVisits.filter((visit) => visit.score >= 140).length;
    const maxVisits = playerVisits.filter((visit) => visit.score === 180).length;
    const sixtyPlusVisits = playerVisits.filter((visit) => visit.score >= 60).length;
    const lowScoreVisits = playerVisits.filter((visit) => visit.score <= 45).length;
    const firstNineVisits = playerVisits.slice(0, 3);
    const firstNineAverage =
      firstNineVisits.length > 0
        ? Number(
            (
              firstNineVisits.reduce((sum, visit) => sum + visit.score, 0) /
              Math.max(1, firstNineVisits.reduce((sum, visit) => sum + visit.darts.filter(Boolean).length, 0))
            * 3
            ).toFixed(2),
          )
        : 0;
    const bestCheckout = playerVisits
      .filter((visit) => visit.checkout)
      .reduce((best, visit) => Math.max(best, visit.score), 0);

    return {
      ...player,
      name,
      throwCount: playerThrows.length,
      hits: playerThrows.filter((event) => event.is_hit && event.score > 0).length,
      misses: playerThrows.filter((event) => !event.is_hit || event.score === 0).length,
      checkoutDarts: playerThrows.filter((event) => event.is_checkout_dart).length,
      topSegments,
      checkoutRoutes,
      tonPlusVisits,
      tonFortyPlus,
      maxVisits,
      sixtyPlusVisits,
      lowScoreVisits,
      firstNineAverage,
      bestCheckout,
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
  const highlightVisits = [...visitTimeline]
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((visit) => ({
      ...visit,
      route: visit.darts.filter(Boolean).join(", "),
    }));
  const highestCheckout = playerSummaries
    .filter((player) => player.bestCheckout > 0)
    .sort((left, right) => right.bestCheckout - left.bestCheckout)[0] ?? null;
  const strongestStarter = [...playerSummaries]
    .sort((left, right) => right.firstNineAverage - left.firstNineAverage)[0] ?? null;
  const steadiestScorer = [...playerSummaries]
    .sort((left, right) => right.sixtyPlusVisits - left.sixtyPlusVisits)[0] ?? null;
  const mvp = [...playerSummaries]
    .sort((left, right) => {
      const leftScore =
        (left.is_winner ? 30 : 0) +
        Number(left.average ?? 0) * 2 +
        (left.best_visit ?? 0) / 3 +
        left.checkoutDarts * 12 +
        left.tonFortyPlus * 5 +
        left.maxVisits * 12;
      const rightScore =
        (right.is_winner ? 30 : 0) +
        Number(right.average ?? 0) * 2 +
        (right.best_visit ?? 0) / 3 +
        right.checkoutDarts * 12 +
        right.tonFortyPlus * 5 +
        right.maxVisits * 12;
      return rightScore - leftScore;
    })[0] ?? null;

  return NextResponse.json({
    match,
    players: playerSummaries,
    throwSummary: {
      totalThrows: (dartEvents ?? []).length,
      checkoutDarts: (dartEvents ?? []).filter((event) => event.is_checkout_dart).length,
      misses: (dartEvents ?? []).filter((event) => !event.is_hit || event.score === 0).length,
      tonPlusVisits: visitTimeline.filter((visit) => visit.score >= 100).length,
      tonFortyPlus: visitTimeline.filter((visit) => visit.score >= 140).length,
      maxVisits: visitTimeline.filter((visit) => visit.score === 180).length,
    },
    visitTimeline,
    scoringProgress,
    highlightVisits,
    story: {
      mvp: mvp
        ? {
            name: mvp.name,
            average: Number(mvp.average ?? 0),
            bestVisit: mvp.best_visit ?? 0,
            checkouts: mvp.checkoutDarts,
          }
        : null,
      highestCheckout: highestCheckout
        ? {
            name: highestCheckout.name,
            score: highestCheckout.bestCheckout,
          }
        : null,
      strongestStarter: strongestStarter
        ? {
            name: strongestStarter.name,
            firstNineAverage: strongestStarter.firstNineAverage,
          }
        : null,
      steadiestScorer: steadiestScorer
        ? {
            name: steadiestScorer.name,
            sixtyPlusVisits: steadiestScorer.sixtyPlusVisits,
          }
        : null,
    },
  });
}
