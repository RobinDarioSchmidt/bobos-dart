import { NextResponse } from "next/server";
import { getSupabaseAdminClients, supabaseAdminEnabled } from "@/lib/supabase-admin";

type ProfileRow = {
  display_name: string;
  username: string | null;
  app_settings: Record<string, unknown> | null;
  created_at: string;
};

type MatchPlayerRow = {
  sets_won: number;
  legs_won: number;
  average: number | null;
  best_visit: number | null;
  is_winner: boolean;
};

type TrainingRow = {
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
    { data: recentMatches, error: recentMatchesError },
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select("display_name, username, app_settings, created_at")
      .eq("id", user.id)
      .single(),
    adminClient
      .from("match_players")
      .select("sets_won, legs_won, average, best_visit, is_winner")
      .eq("profile_id", user.id),
    adminClient
      .from("training_sessions")
      .select("score, darts_thrown, hits, played_at")
      .eq("owner_id", user.id)
      .order("played_at", { ascending: false })
      .limit(12),
    adminClient
      .from("matches")
      .select("id, played_at, mode, double_out")
      .eq("owner_id", user.id)
      .order("played_at", { ascending: false })
      .limit(8),
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

  if (recentMatchesError) {
    return NextResponse.json({ error: recentMatchesError.message }, { status: 400 });
  }

  const profileRow = profile as ProfileRow;
  const playerRows = (matchPlayers ?? []) as MatchPlayerRow[];
  const trainingRows = (trainings ?? []) as TrainingRow[];
  const matchRows = (recentMatches ?? []) as MatchRow[];
  const recentMatchIds = matchRows.map((match) => match.id);
  const { data: recentMatchPlayers, error: recentMatchPlayersError } = recentMatchIds.length
    ? await adminClient
        .from("match_players")
        .select("match_id, guest_name, seat_index, is_winner, sets_won, legs_won, average, best_visit, profile_id")
        .in("match_id", recentMatchIds)
        .order("seat_index", { ascending: true })
    : { data: [], error: null };

  if (recentMatchPlayersError) {
    return NextResponse.json({ error: recentMatchPlayersError.message }, { status: 400 });
  }

  const matchDetailRows = (recentMatchPlayers ?? []) as MatchDetailRow[];
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

  const recentMatchesWithDetails = matchRows.map((match) => {
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
  for (const match of recentMatchesWithDetails) {
    if (match.did_win) {
      rollingStreak += 1;
      bestWinStreak = Math.max(bestWinStreak, rollingStreak);
    } else {
      rollingStreak = 0;
    }
  }

  let currentWinStreak = 0;
  for (const match of recentMatchesWithDetails) {
    if (!match.did_win) {
      break;
    }

    currentWinStreak += 1;
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const matchesLast30Days = matchRows.filter((match) => new Date(match.played_at).getTime() >= thirtyDaysAgo).length;
  const trainingLast30Days = trainingRows.filter((training) => new Date(training.played_at).getTime() >= thirtyDaysAgo).length;
  const favoriteModeCounts = matchRows.reduce<Record<string, number>>((acc, match) => {
    acc[match.mode] = (acc[match.mode] ?? 0) + 1;
    return acc;
  }, {});
  const favoriteMode = Object.entries(favoriteModeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "501";
  const recentTrainingAverageScore =
    trainingRows.length > 0
      ? Number((trainingRows.reduce((sum, row) => sum + row.score, 0) / trainingRows.length).toFixed(1))
      : 0;
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
  const recentForm = recentMatchesWithDetails.slice(0, 5).map((match) => (match.did_win ? "W" : "L"));
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
    recentTraining: trainingRows,
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
    },
  });
}
