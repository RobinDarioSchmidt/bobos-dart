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
  ] =
    await Promise.all([
      adminClient.from("profiles").select("display_name, username, app_settings, created_at").eq("id", user.id).single(),
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
        .limit(6),
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
        .select("match_id, guest_name, seat_index, is_winner, sets_won")
        .in("match_id", recentMatchIds)
        .order("seat_index", { ascending: true })
    : { data: [], error: null };

  if (recentMatchPlayersError) {
    return NextResponse.json({ error: recentMatchPlayersError.message }, { status: 400 });
  }

  const matchDetailRows = (recentMatchPlayers ?? []) as MatchDetailRow[];

  const stats = {
    matchesPlayed: playerRows.length,
    matchesWon: playerRows.filter((row) => row.is_winner).length,
    totalSetsWon: playerRows.reduce((sum, row) => sum + row.sets_won, 0),
    totalLegsWon: playerRows.reduce((sum, row) => sum + row.legs_won, 0),
    bestAverage: playerRows.reduce((best, row) => Math.max(best, Number(row.average ?? 0)), 0),
    bestVisit: playerRows.reduce((best, row) => Math.max(best, row.best_visit ?? 0), 0),
    trainingSessions: trainingRows.length,
    bestTrainingScore: trainingRows.reduce((best, row) => Math.max(best, row.score), 0),
    totalTrainingDarts: trainingRows.reduce((sum, row) => sum + row.darts_thrown, 0),
    totalTrainingHits: trainingRows.reduce((sum, row) => sum + row.hits, 0),
    winRate: playerRows.length > 0 ? Number(((playerRows.filter((row) => row.is_winner).length / playerRows.length) * 100).toFixed(1)) : 0,
    trainingHitRate:
      trainingRows.reduce((sum, row) => sum + row.darts_thrown, 0) > 0
        ? Number(
            (
              (trainingRows.reduce((sum, row) => sum + row.hits, 0) /
                trainingRows.reduce((sum, row) => sum + row.darts_thrown, 0)) *
              100
            ).toFixed(1),
          )
        : 0,
  };

  return NextResponse.json({
    profile: profileRow,
    stats,
    recentTraining: trainingRows,
    recentMatches: matchRows.map((match) => {
      const players = matchDetailRows.filter((row) => row.match_id === match.id);
      const winner = players.find((row) => row.is_winner)?.guest_name ?? "Unbekannt";
      const opponents = players
        .filter((row) => !row.is_winner)
        .map((row) => row.guest_name ?? "Gast")
        .join(", ");

      return {
        id: match.id,
        played_at: match.played_at,
        mode: match.mode,
        double_out: match.double_out,
        winner,
        opponents,
        sets: players.map((row) => `${row.guest_name ?? "Gast"} ${row.sets_won}`).join(" · "),
      };
    }),
  });
}
