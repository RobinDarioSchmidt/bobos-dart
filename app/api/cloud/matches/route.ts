import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { fetchAccessibleFinishedMatches } from "@/lib/server/cloud-match-access";
import { authorizeSupabaseRequest } from "@/lib/server/request-auth";

export async function GET(request: Request) {
  const authResult = await authorizeSupabaseRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const { adminClient } = getSupabaseAdminClients();
  const { user } = authResult;

  let accessible;
  try {
    accessible = await fetchAccessibleFinishedMatches(adminClient, user.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "match_access_failed" }, { status: 400 });
  }

  const matches = accessible.matches
    .slice(0, 8)
    .map((match) => ({
      id: match.id,
      played_at: match.played_at,
      mode: match.mode,
      double_out: match.double_out,
      finish_mode: match.finish_mode ?? null,
    }));

  const matchIds = matches.map((match) => match.id);
  if (matchIds.length === 0) {
    return NextResponse.json({ matches: [], players: [] });
  }

  const players = accessible.players
    .filter((player) => matchIds.includes(player.match_id))
    .map((player) => ({
      match_id: player.match_id,
      profile_id: player.profile_id,
      guest_name: player.guest_name,
      seat_index: player.seat_index,
      is_winner: player.is_winner,
      sets_won: player.sets_won,
    }));

  return NextResponse.json({
    matches,
    players,
  });
}
