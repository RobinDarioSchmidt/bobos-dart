import { NextResponse } from "next/server";
import { getSupabaseAdminClients, supabaseAdminEnabled } from "@/lib/supabase-admin";

type ProfileRow = {
  display_name: string;
  username: string | null;
  app_settings: Record<string, unknown> | null;
  created_at: string;
};

type MatchPlayerRow = {
  match_id?: string;
  sets_won: number;
  legs_won: number;
  average: number | null;
  best_visit: number | null;
  is_winner: boolean;
};

type TrainingRow = {
  mode?: string;
  score: number;
  darts_thrown: number;
  hits: number;
  played_at: string;
};

type MatchRow = {
  id: string;
  played_at: string;
  mode: string;
  double_out: boolean;
};

type MatchDetailRow = {
  match_id: string;
  guest_name: string | null;
  seat_index: number;
  is_winner: boolean;
  sets_won: number;
  legs_won: number;
  average: number | null;
  best_visit: number | null;
  profile_id: string | null;
};

type DartEventRow = {
  segment_label: string;
  base_value: number;
  multiplier: number;
  ring: string;
  score: number;
  is_hit: boolean;
  is_checkout_dart: boolean;
  target_label: string | null;
  source_type: "match" | "training";
};

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

  const [
    { data: profile, error: profileError },
    { data: matchPlayers, error: matchPlayersError },
    { data: trainings, error: trainingsError },
    { data: allMatches, error: allMatchesError },
    { data: dartEvents, error: dartEventsError },
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select("display_name, username, app_settings, created_at")
      .eq("id", user.id)
      .single(),
    adminClient
      .from("match_players")
      .select("match_id, sets_won, legs_won, average, best_visit, is_winner")
      .eq("profile_id", user.id),
    adminClient
      .from("training_sessions")
      .select("mode, score, darts_thrown, hits, played_at")
      .eq("owner_id", user.id)
      .order("played_at", { ascending: false })
      ,
    adminClient
      .from("matches")
      .select("id, played_at, mode, double_out")
      .eq("owner_id", user.id)
      .order("played_at", { ascending: false })
      ,
    adminClient
      .from("dart_events")
      .select("segment_label, base_value, multiplier, ring, score, is_hit, is_checkout_dart, target_label, source_type")
      .eq("owner_id", user.id),
  ]);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (matchPlayersError) {
    return NextResponse.json({ error: matchPlayersError.message }, { status: 400 });
  }

  if (trainingsError) {
    return NextResponse.json({ error: trainingsError.message }, { status: 400 });
  }

  if (allMatchesError) {
    return NextResponse.json({ error: allMatchesError.message }, { status: 400 });
  }

  const profileRow = profile as ProfileRow;
  const playerRows = (matchPlayers ?? []) as MatchPlayerRow[];
  const trainingRows = (trainings ?? []) as TrainingRow[];
  const matchRows = (allMatches ?? []) as MatchRow[];
  const dartRows = dartEventsError ? [] : ((dartEvents ?? []) as DartEventRow[]);
  const recentMatchRows = matchRows.slice(0, 8);
  const matchIds = matchRows.map((match) => match.id);
  const { data: allMatchPlayers, error: allMatchPlayersError } = matchIds.length
    ? await adminClient
        .from("match_players")
        .select("match_id, guest_name, seat_index, is_winner, sets_won, legs_won, average, best_visit, profile_id")
        .in("match_id", matchIds)
        .order("seat_index", { ascending: true })
    : { data: [], error: null };

  if (allMatchPlayersError) {
    return NextResponse.json({ error: allMatchPlayersError.message }, { status: 400 });
  }

  const matchDetailRows = (allMatchPlayers ?? []) as MatchDetailRow[];
  const totalTrainingDarts = trainingRows.reduce((sum, row) => sum + row.darts_thrown, 0);
  const totalTrainingHits = trainingRows.reduce((sum, row) => sum + row.hits, 0);
  const stats = {
    matchesPlayed: playerRows.length,
    matchesWon: playerRows.filter((row) => row.is_winner).length,
    totalSetsWon: playerRows.reduce((sum, row) => sum + row.sets_won, 0),
    totalLegsWon: playerRows.reduce((sum, row) => sum + row.legs_won, 0),
    bestAverage: playerRows.reduce((best, row) => Math.max(best, Number(row.average ?? 0)), 0),
    bestVisit: playerRows.reduce((best, row) => Math.max(best, row.best_visit ?? 0), 0),
    trainingSessions: trainingRows.length,
    bestTrainingScore: trainingRows.reduce((best, row) => Math.max(best, row.score), 0),
    totalTrainingDarts,
    totalTrainingHits,
    winRate:
      playerRows.length > 0
        ? Number(((playerRows.filter((row) => row.is_winner).length / playerRows.length) * 100).toFixed(1))
        : 0,
    trainingHitRate:
      totalTrainingDarts > 0 ? Number(((totalTrainingHits / totalTrainingDarts) * 100).toFixed(1)) : 0,
  };

  const allMatchesWithDetails = matchRows.map((match) => {
    const players = matchDetailRows.filter((row) => row.match_id === match.id);
    const winner = players.find((row) => row.is_winner)?.guest_name ?? "Unbekannt";
    const opponents = players
      .filter((row) => row.profile_id !== user.id)
      .map((row) => row.guest_name ?? "Gast")
      .join(", ");
    const mySeat = players.find((row) => row.profile_id === user.id) ?? null;

    return {
      id: match.id,
      played_at: match.played_at,
      mode: match.mode,
      double_out: match.double_out,
      winner,
      opponents,
      sets: players.map((row) => `${row.guest_name ?? "Gast"} ${row.sets_won}`).join(" - "),
      did_win: mySeat?.is_winner ?? false,
      player_average: Number(mySeat?.average ?? 0),
      player_best_visit: mySeat?.best_visit ?? 0,
      player_legs: mySeat?.legs_won ?? 0,
    };
  });

  const recentMatchesWithDetails = recentMatchRows.map((match) => {
    const players = matchDetailRows.filter((row) => row.match_id === match.id);
    const winner = players.find((row) => row.is_winner)?.guest_name ?? "Unbekannt";
    const opponents = players
      .filter((row) => row.profile_id !== user.id)
      .map((row) => row.guest_name ?? "Gast")
      .join(", ");
    const mySeat = players.find((row) => row.profile_id === user.id) ?? null;

    return {
      id: match.id,
      played_at: match.played_at,
      mode: match.mode,
      double_out: match.double_out,
      winner,
      opponents,
      sets: players.map((row) => `${row.guest_name ?? "Gast"} ${row.sets_won}`).join(" - "),
      did_win: mySeat?.is_winner ?? false,
      player_average: Number(mySeat?.average ?? 0),
      player_best_visit: mySeat?.best_visit ?? 0,
      player_legs: mySeat?.legs_won ?? 0,
    };
  });

  let rollingStreak = 0;
  let bestWinStreak = 0;
  for (const match of allMatchesWithDetails) {
    if (match.did_win) {
      rollingStreak += 1;
      bestWinStreak = Math.max(bestWinStreak, rollingStreak);
    } else {
      rollingStreak = 0;
    }
  }

  let currentWinStreak = 0;
  for (const match of allMatchesWithDetails) {
    if (!match.did_win) {
      break;
    }

    currentWinStreak += 1;
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const matchesLast30Days = allMatchesWithDetails.filter((match) => new Date(match.played_at).getTime() >= thirtyDaysAgo).length;
  const trainingLast30Days = trainingRows.filter((training) => new Date(training.played_at).getTime() >= thirtyDaysAgo).length;
  const favoriteModeCounts = allMatchesWithDetails.reduce<Record<string, number>>((acc, match) => {
    acc[match.mode] = (acc[match.mode] ?? 0) + 1;
    return acc;
  }, {});
  const favoriteMode = Object.entries(favoriteModeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "501";
  const recentTrainingAverageScore =
    trainingRows.length > 0
      ? Number((trainingRows.reduce((sum, row) => sum + row.score, 0) / trainingRows.length).toFixed(1))
      : 0;
  const countedBoardThrows = dartRows.filter((row) => row.ring !== "unknown");
  const favoriteSegments = Object.entries(
    countedBoardThrows.reduce<Record<string, number>>((acc, row) => {
      acc[row.segment_label] = (acc[row.segment_label] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
  const favoriteDoubles = Object.entries(
    countedBoardThrows
      .filter((row) => row.ring === "double" || row.ring === "bull")
      .reduce<Record<string, number>>((acc, row) => {
        acc[row.segment_label] = (acc[row.segment_label] ?? 0) + 1;
        return acc;
      }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count }));
  const heatmapNumbers = countedBoardThrows.reduce<Record<string, number>>((acc, row) => {
    const key =
      row.base_value === 25
        ? row.ring === "bull"
          ? "Bull"
          : "Outer Bull"
        : String(row.base_value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const heatmapMax = Math.max(0, ...Object.values(heatmapNumbers));
  const throwStats = {
    totalThrows: dartRows.length,
    boardThrows: countedBoardThrows.length,
    bullsHit: countedBoardThrows.filter((row) => row.ring === "bull" || row.ring === "outer-bull").length,
    doublesHit: countedBoardThrows.filter((row) => row.ring === "double" || row.ring === "bull").length,
    triplesHit: countedBoardThrows.filter((row) => row.ring === "triple").length,
    misses: dartRows.filter((row) => row.ring === "miss" || row.score === 0).length,
    checkoutsHit: dartRows.filter((row) => row.is_checkout_dart).length,
    favoriteSegment: favoriteSegments[0]?.label ?? "Noch offen",
    favoriteDouble: favoriteDoubles[0]?.label ?? "Noch offen",
  };
  const consistencyScore = Math.round(
    Math.min(
      100,
      stats.winRate * 0.45 +
        stats.trainingHitRate * 0.25 +
        Math.min(stats.bestAverage, 90) * 0.3,
    ),
  );
  const pressureScore = Math.round(
    Math.min(
      100,
      (Math.min(stats.bestVisit, 180) / 180) * 55 +
        (Math.min(stats.bestAverage, 90) / 90) * 45,
    ),
  );
  const recentForm = allMatchesWithDetails.slice(0, 5).map((match) => (match.did_win ? "W" : "L"));
  const monthlyMatches = Object.values(
    allMatchesWithDetails.reduce<Record<string, { period: string; matches: number; wins: number; average: number; averageCount: number }>>(
      (acc, match) => {
        const period = new Date(match.played_at).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
        if (!acc[period]) {
          acc[period] = { period, matches: 0, wins: 0, average: 0, averageCount: 0 };
        }

        acc[period].matches += 1;
        acc[period].wins += match.did_win ? 1 : 0;
        if (match.player_average > 0) {
          acc[period].average += match.player_average;
          acc[period].averageCount += 1;
        }
        return acc;
      },
      {},
    ),
  ).map((entry) => ({
    period: entry.period,
    matches: entry.matches,
    wins: entry.wins,
    average: entry.averageCount > 0 ? Number((entry.average / entry.averageCount).toFixed(1)) : 0,
  }));
  const monthlyTraining = Object.values(
    trainingRows.reduce<Record<string, { period: string; sessions: number; averageScore: number; totalScore: number }>>(
      (acc, training) => {
        const period = new Date(training.played_at).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
        if (!acc[period]) {
          acc[period] = { period, sessions: 0, averageScore: 0, totalScore: 0 };
        }

        acc[period].sessions += 1;
        acc[period].totalScore += training.score;
        return acc;
      },
      {},
    ),
  ).map((entry) => ({
    period: entry.period,
    sessions: entry.sessions,
    averageScore: entry.sessions > 0 ? Number((entry.totalScore / entry.sessions).toFixed(1)) : 0,
  }));
  const modeBreakdown = Object.values(
    allMatchesWithDetails.reduce<Record<string, { mode: string; matches: number; wins: number }>>((acc, match) => {
      if (!acc[match.mode]) {
        acc[match.mode] = { mode: match.mode, matches: 0, wins: 0 };
      }

      acc[match.mode].matches += 1;
      acc[match.mode].wins += match.did_win ? 1 : 0;
      return acc;
      }, {}),
  );
  const opponentBreakdown = Object.values(
    matchRows.reduce<
      Record<
        string,
        {
          name: string;
          matches: number;
          wins: number;
          myAverageTotal: number;
          myAverageCount: number;
          bestVisit: number;
          legsFor: number;
          legsAgainst: number;
          lastPlayed: string;
        }
      >
    >((acc, match) => {
      const players = matchDetailRows.filter((row) => row.match_id === match.id);
      const mySeat = players.find((row) => row.profile_id === user.id) ?? null;
      if (!mySeat) {
        return acc;
      }

      const opponents = players.filter((row) => row.profile_id !== user.id);
      for (const opponent of opponents) {
        const name = opponent.guest_name ?? "Gast";
        const key = opponent.profile_id ?? `${name}:${opponent.seat_index}`;
        if (!acc[key]) {
          acc[key] = {
            name,
            matches: 0,
            wins: 0,
            myAverageTotal: 0,
            myAverageCount: 0,
            bestVisit: 0,
            legsFor: 0,
            legsAgainst: 0,
            lastPlayed: match.played_at,
          };
        }

        acc[key].matches += 1;
        acc[key].wins += mySeat.is_winner ? 1 : 0;
        acc[key].legsFor += mySeat.legs_won ?? 0;
        acc[key].legsAgainst += opponent.legs_won ?? 0;
        acc[key].bestVisit = Math.max(acc[key].bestVisit, opponent.best_visit ?? 0);
        if ((mySeat.average ?? 0) > 0) {
          acc[key].myAverageTotal += Number(mySeat.average ?? 0);
          acc[key].myAverageCount += 1;
        }
        if (new Date(match.played_at).getTime() > new Date(acc[key].lastPlayed).getTime()) {
          acc[key].lastPlayed = match.played_at;
        }
      }
      return acc;
    }, {}),
  )
    .map((entry) => ({
      name: entry.name,
      matches: entry.matches,
      wins: entry.wins,
      winRate: entry.matches > 0 ? Number(((entry.wins / entry.matches) * 100).toFixed(1)) : 0,
      average: entry.myAverageCount > 0 ? Number((entry.myAverageTotal / entry.myAverageCount).toFixed(1)) : 0,
      bestVisit: entry.bestVisit,
      legsFor: entry.legsFor,
      legsAgainst: entry.legsAgainst,
      lastPlayed: entry.lastPlayed,
    }))
    .sort((left, right) => right.matches - left.matches)
    .slice(0, 8);
  const highlightTitle =
    stats.winRate >= 65
      ? "Match Closer"
      : stats.trainingHitRate >= 55
        ? "Practice Machine"
        : stats.bestAverage >= 60
          ? "Scoring Engine"
          : "Steady Builder";
  const highlightReason =
    stats.winRate >= 65
      ? "Deine Siegquote ist gerade richtig stark."
      : stats.trainingHitRate >= 55
        ? "Deine Trainingsdaten zeigen saubere Wiederholbarkeit."
        : stats.bestAverage >= 60
          ? "Dein bestes Average zeigt echtes Scoring-Potenzial."
          : "Du baust dir gerade eine stabile Match-Basis auf.";

  return NextResponse.json({
    profile: profileRow,
    stats,
    recentTraining: trainingRows.slice(0, 12),
    trainingHistory: trainingRows,
    matchHistory: allMatchesWithDetails,
    recentMatches: recentMatchesWithDetails,
    insights: {
      favoriteMode,
      matchesLast30Days,
      trainingLast30Days,
      recentTrainingAverageScore,
      currentWinStreak,
      bestWinStreak,
      recentForm,
      consistencyScore,
      pressureScore,
      highlightTitle,
      highlightReason,
      throwStats,
      favoriteSegments,
      favoriteDoubles,
      heatmap: {
        numbers: heatmapNumbers,
        max: heatmapMax,
      },
      monthlyMatches,
      monthlyTraining,
      modeBreakdown,
      opponentBreakdown,
    },
  });
}
