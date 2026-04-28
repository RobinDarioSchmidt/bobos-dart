import { getSupabaseAdminClients } from "@/lib/supabase-admin";

export type AccessibleMatchRow = {
  id: string;
  owner_id: string;
  played_at: string;
  mode: string;
  double_out: boolean;
  finish_mode?: string | null;
  legs_to_win?: number | null;
  sets_to_win?: number | null;
  status?: string;
  winner_profile_id?: string | null;
};

export type AccessibleMatchPlayerRow = {
  match_id: string;
  profile_id: string | null;
  guest_name: string | null;
  seat_index: number;
  is_winner: boolean;
  sets_won: number;
  legs_won?: number | null;
  average?: number | null;
  best_visit?: number | null;
};

type AdminClient = ReturnType<typeof getSupabaseAdminClients>["adminClient"];

function buildMatchDedupeKey(match: AccessibleMatchRow, players: AccessibleMatchPlayerRow[]) {
  const participantTokens = [...players]
    .sort((left, right) => left.seat_index - right.seat_index)
    .map((player) => {
      if (player.profile_id) {
        return `profile:${player.profile_id}`;
      }

      return `guest:${(player.guest_name ?? "Gast").trim().toLowerCase()}:${player.seat_index}`;
    })
    .join("|");

  return [
    match.played_at,
    match.mode,
    match.finish_mode ?? (match.double_out ? "double" : "single"),
    String(match.legs_to_win ?? ""),
    String(match.sets_to_win ?? ""),
    match.winner_profile_id ?? "",
    participantTokens,
  ].join("::");
}

export async function fetchAccessibleFinishedMatches(adminClient: AdminClient, userId: string) {
  const { data: participantRows, error: participantError } = await adminClient
    .from("match_players")
    .select("match_id")
    .eq("profile_id", userId);

  if (participantError) {
    throw new Error(participantError.message);
  }

  const matchIds = Array.from(
    new Set((participantRows ?? []).map((row) => row.match_id).filter((matchId): matchId is string => typeof matchId === "string")),
  );

  if (matchIds.length === 0) {
    return {
      matches: [] as AccessibleMatchRow[],
      players: [] as AccessibleMatchPlayerRow[],
    };
  }

  const [{ data: matches, error: matchesError }, { data: players, error: playersError }] = await Promise.all([
    adminClient
      .from("matches")
      .select("id, owner_id, played_at, mode, double_out, finish_mode, legs_to_win, sets_to_win, status, winner_profile_id")
      .in("id", matchIds)
      .eq("status", "finished"),
    adminClient
      .from("match_players")
      .select("match_id, profile_id, guest_name, seat_index, is_winner, sets_won, legs_won, average, best_visit")
      .in("match_id", matchIds)
      .order("seat_index", { ascending: true }),
  ]);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  if (playersError) {
    throw new Error(playersError.message);
  }

  const matchRows = (matches ?? []) as AccessibleMatchRow[];
  const playerRows = (players ?? []) as AccessibleMatchPlayerRow[];

  const playersByMatchId = new Map<string, AccessibleMatchPlayerRow[]>();
  for (const player of playerRows) {
    const list = playersByMatchId.get(player.match_id) ?? [];
    list.push(player);
    playersByMatchId.set(player.match_id, list);
  }

  const canonicalByKey = new Map<string, AccessibleMatchRow>();
  for (const match of matchRows) {
    const matchPlayers = playersByMatchId.get(match.id) ?? [];
    const dedupeKey = buildMatchDedupeKey(match, matchPlayers);
    const current = canonicalByKey.get(dedupeKey);
    if (!current) {
      canonicalByKey.set(dedupeKey, match);
      continue;
    }

    const currentIsMine = current.owner_id === userId;
    const nextIsMine = match.owner_id === userId;
    if (!currentIsMine && nextIsMine) {
      canonicalByKey.set(dedupeKey, match);
      continue;
    }

    if (currentIsMine === nextIsMine && new Date(match.played_at).getTime() > new Date(current.played_at).getTime()) {
      canonicalByKey.set(dedupeKey, match);
    }
  }

  const canonicalMatches = Array.from(canonicalByKey.values()).sort(
    (left, right) => new Date(right.played_at).getTime() - new Date(left.played_at).getTime(),
  );
  const canonicalMatchIds = new Set(canonicalMatches.map((match) => match.id));
  const canonicalPlayers = playerRows.filter((player) => canonicalMatchIds.has(player.match_id));

  return {
    matches: canonicalMatches,
    players: canonicalPlayers,
  };
}
