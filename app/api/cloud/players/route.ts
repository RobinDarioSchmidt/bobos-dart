import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { fetchAccessibleFinishedMatches } from "@/lib/server/cloud-match-access";
import { authorizeSupabaseRequest } from "@/lib/server/request-auth";

type ProfilePresenceRow = {
  id: string;
  display_name: string;
  updated_at: string;
};

type MatchRow = {
  id: string;
  owner_id: string;
  status: string;
};

type MatchPlayerRow = {
  match_id: string;
  profile_id: string | null;
  is_winner: boolean;
  average: number | null;
  best_visit: number | null;
  guest_name: string | null;
};

type TrainingRow = {
  owner_id: string;
};

export async function GET(request: Request) {
  const authResult = await authorizeSupabaseRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const { adminClient } = getSupabaseAdminClients();
  const now = new Date();
  const activeCutoff = now.getTime() - 30 * 60 * 1000;

  const { error: pingError } = await adminClient
    .from("profiles")
    .update({ updated_at: now.toISOString() })
    .eq("id", authResult.user.id);

  if (pingError) {
    return NextResponse.json({ error: pingError.message }, { status: 400 });
  }

  let accessible;
  try {
    accessible = await fetchAccessibleFinishedMatches(adminClient, authResult.user.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "match_access_failed" }, { status: 400 });
  }

  const [{ data: profiles, error: profilesError }, { data: matches, error: matchesError }, { data: matchPlayers, error: matchPlayersError }, { data: trainingRows, error: trainingError }] =
    await Promise.all([
      adminClient
        .from("profiles")
        .select("id, display_name, updated_at")
        .neq("id", authResult.user.id)
        .order("display_name", { ascending: true }),
      adminClient
        .from("matches")
        .select("id, owner_id, status")
        .eq("status", "finished"),
      adminClient
        .from("match_players")
        .select("match_id, profile_id, is_winner, average, best_visit, guest_name")
        .not("profile_id", "is", null),
      adminClient
        .from("training_sessions")
        .select("owner_id"),
    ]);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 400 });
  }

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 400 });
  }

  if (matchPlayersError) {
    return NextResponse.json({ error: matchPlayersError.message }, { status: 400 });
  }

  if (trainingError) {
    return NextResponse.json({ error: trainingError.message }, { status: 400 });
  }

  const matchRows = (matches ?? []) as MatchRow[];
  const matchPlayerRows = (matchPlayers ?? []) as MatchPlayerRow[];
  const trainingSessionRows = (trainingRows ?? []) as TrainingRow[];
  const matchOwnerById = new Map(matchRows.map((match) => [match.id, match.owner_id]));
  const currentUserAccessibleMatchIds = new Set(accessible.matches.map((match) => match.id));

  const players = ((profiles ?? []) as ProfilePresenceRow[])
    .map((player) => {
      const lastSeenAt = player.updated_at;
      const isActive = new Date(lastSeenAt).getTime() >= activeCutoff;
      const ownedRows = matchPlayerRows.filter(
        (row) => row.profile_id === player.id && matchOwnerById.get(row.match_id) === player.id,
      );
      const matchesPlayed = ownedRows.length;
      const matchesWon = ownedRows.filter((row) => row.is_winner).length;
      const rivalRows = matchPlayerRows.filter(
        (row) =>
          row.profile_id === player.id &&
          currentUserAccessibleMatchIds.has(row.match_id),
      );
      const rivalryMatches = rivalRows.length;
      const rivalryWins = rivalRows.filter((row) => !row.is_winner).length;

      return {
        id: player.id,
        displayName: player.display_name,
        lastSeenAt,
        isActive,
        stats: {
          matchesPlayed,
          matchesWon,
          matchesLost: Math.max(0, matchesPlayed - matchesWon),
          trainingSessions: trainingSessionRows.filter((row) => row.owner_id === player.id).length,
          bestAverage: ownedRows.reduce((best, row) => Math.max(best, Number(row.average ?? 0)), 0),
          bestVisit: ownedRows.reduce((best, row) => Math.max(best, Number(row.best_visit ?? 0)), 0),
        },
        rivalry: {
          matchesPlayed: rivalryMatches,
          matchesWon: rivalryWins,
          matchesLost: Math.max(0, rivalryMatches - rivalryWins),
        },
      };
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ players });
}
