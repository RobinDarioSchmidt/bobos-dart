import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { authorizeSupabaseRequest } from "@/lib/server/request-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ opponentName: string }> },
) {
  const authResult = await authorizeSupabaseRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const { opponentName } = await context.params;
  const decodedName = decodeURIComponent(opponentName);
  const { adminClient } = getSupabaseAdminClients();
  const { user } = authResult;

  const { data: matches, error: matchesError } = await adminClient
    .from("matches")
    .select("id, played_at, mode, double_out")
    .eq("owner_id", user.id)
    .order("played_at", { ascending: false });

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 400 });
  }

  const matchIds = (matches ?? []).map((match) => match.id);
  if (matchIds.length === 0) {
    return NextResponse.json({ opponentName: decodedName, summary: null, matches: [] });
  }

  const { data: players, error: playersError } = await adminClient
    .from("match_players")
    .select("match_id, guest_name, seat_index, is_winner, sets_won, legs_won, average, best_visit, profile_id")
    .in("match_id", matchIds)
    .order("seat_index", { ascending: true });

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 400 });
  }

  const relevantMatches = (matches ?? [])
    .map((match) => {
      const matchPlayers = (players ?? []).filter((player) => player.match_id === match.id);
      const mySeat = matchPlayers.find((player) => player.profile_id === user.id) ?? null;
      const opponentSeat = matchPlayers.find((player) => (player.guest_name ?? "Gast") === decodedName) ?? null;

      if (!mySeat || !opponentSeat) {
        return null;
      }

      return {
        id: match.id,
        played_at: match.played_at,
        mode: match.mode,
        double_out: match.double_out,
        didWin: mySeat.is_winner ?? false,
        myAverage: Number(mySeat.average ?? 0),
        opponentAverage: Number(opponentSeat.average ?? 0),
        myBestVisit: mySeat.best_visit ?? 0,
        opponentBestVisit: opponentSeat.best_visit ?? 0,
        myLegs: mySeat.legs_won ?? 0,
        opponentLegs: opponentSeat.legs_won ?? 0,
        mySets: mySeat.sets_won ?? 0,
        opponentSets: opponentSeat.sets_won ?? 0,
      };
    })
    .filter(Boolean);

  const matchesAgainst = relevantMatches.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const chronologicalMatches = [...matchesAgainst].sort(
    (left, right) => new Date(left.played_at).getTime() - new Date(right.played_at).getTime(),
  );
  let currentWinStreak = 0;
  let bestWinStreak = 0;
  let running = 0;
  for (const match of chronologicalMatches) {
    if (match.didWin) {
      running += 1;
      currentWinStreak = running;
      bestWinStreak = Math.max(bestWinStreak, running);
    } else {
      running = 0;
      currentWinStreak = 0;
    }
  }

  const modeBreakdown = Object.values(
    matchesAgainst.reduce<
      Record<
        string,
        {
          mode: string;
          matches: number;
          wins: number;
          myAverageTotal: number;
          opponentAverageTotal: number;
        }
      >
    >((acc, match) => {
      if (!acc[match.mode]) {
        acc[match.mode] = {
          mode: match.mode,
          matches: 0,
          wins: 0,
          myAverageTotal: 0,
          opponentAverageTotal: 0,
        };
      }
      acc[match.mode].matches += 1;
      acc[match.mode].wins += match.didWin ? 1 : 0;
      acc[match.mode].myAverageTotal += match.myAverage;
      acc[match.mode].opponentAverageTotal += match.opponentAverage;
      return acc;
    }, {}),
  ).map((entry) => ({
    mode: entry.mode,
    matches: entry.matches,
    wins: entry.wins,
    winRate: entry.matches > 0 ? Number(((entry.wins / entry.matches) * 100).toFixed(1)) : 0,
    myAverage: entry.matches > 0 ? Number((entry.myAverageTotal / entry.matches).toFixed(1)) : 0,
    opponentAverage: entry.matches > 0 ? Number((entry.opponentAverageTotal / entry.matches).toFixed(1)) : 0,
  }));

  const closestMatches = [...matchesAgainst]
    .sort((left, right) => Math.abs(left.myLegs - left.opponentLegs) - Math.abs(right.myLegs - right.opponentLegs))
    .slice(0, 3);

  const summary =
    matchesAgainst.length > 0
      ? {
          matches: matchesAgainst.length,
          wins: matchesAgainst.filter((match) => match.didWin).length,
          losses: matchesAgainst.filter((match) => !match.didWin).length,
          winRate: Number(
            ((matchesAgainst.filter((match) => match.didWin).length / matchesAgainst.length) * 100).toFixed(1),
          ),
          myAverage: Number(
            (
              matchesAgainst.reduce((sum, match) => sum + match.myAverage, 0) /
              matchesAgainst.filter((match) => match.myAverage > 0).length
            ).toFixed(1),
          ) || 0,
          opponentAverage: Number(
            (
              matchesAgainst.reduce((sum, match) => sum + match.opponentAverage, 0) /
              matchesAgainst.filter((match) => match.opponentAverage > 0).length
            ).toFixed(1),
          ) || 0,
          myBestVisit: matchesAgainst.reduce((best, match) => Math.max(best, match.myBestVisit), 0),
          opponentBestVisit: matchesAgainst.reduce((best, match) => Math.max(best, match.opponentBestVisit), 0),
          myLegs: matchesAgainst.reduce((sum, match) => sum + match.myLegs, 0),
          opponentLegs: matchesAgainst.reduce((sum, match) => sum + match.opponentLegs, 0),
        }
      : null;
  const rivalryStory =
    matchesAgainst.length === 0
      ? null
      : {
          currentWinStreak,
          bestWinStreak,
          recentForm: chronologicalMatches.slice(-8).map((match) => (match.didWin ? "W" : "L")),
          closestMatches: closestMatches.map((match) => ({
            id: match.id,
            played_at: match.played_at,
            didWin: match.didWin,
            legs: `${match.myLegs}:${match.opponentLegs}`,
            sets: `${match.mySets}:${match.opponentSets}`,
          })),
          bestMode:
            [...modeBreakdown].sort((left, right) => right.winRate - left.winRate || right.matches - left.matches)[0] ?? null,
          rivalryTone:
            matchesAgainst.length >= 6 && Math.abs((summary?.wins ?? 0) - (summary?.losses ?? 0)) <= 2
              ? "Klassische Rivalitaet"
              : (summary?.winRate ?? 0) >= 65
                ? "Lieblingsgegner"
                : (summary?.winRate ?? 0) <= 35
                  ? "Problemgegner"
                  : "Ausgeglichenes Duell",
        };

  return NextResponse.json({
    opponentName: decodedName,
    summary,
    matches: matchesAgainst,
    modeBreakdown,
    rivalryStory,
  });
}
