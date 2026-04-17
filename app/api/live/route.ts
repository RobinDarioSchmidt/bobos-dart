import { NextResponse } from "next/server";
import { getSupabaseAdminClients, supabaseAdminEnabled } from "@/lib/supabase-admin";
import {
  createEmptyLiveState,
  generateRoomCode,
  getPreferredDisplayName,
  normalizeLiveState,
  type LiveFinishMode,
  type LiveMatchState,
} from "@/lib/live-match";

type LiveMatchRow = {
  id: string;
  room_code: string;
  state: LiveMatchState;
};

function mergePlayers(currentState: LiveMatchState, nextState: LiveMatchState) {
  return currentState.players.map((currentPlayer, index) => {
    const incomingPlayer = nextState.players[index];

    if (!incomingPlayer) {
      return currentPlayer;
    }

    if (currentPlayer.joined && !incomingPlayer.joined) {
      return currentPlayer;
    }

    if (currentPlayer.profileId && incomingPlayer.profileId !== currentPlayer.profileId) {
      return currentPlayer;
    }

    return {
      ...currentPlayer,
      ...incomingPlayer,
    };
  });
}

function mergeLiveState(currentState: LiveMatchState, nextState: LiveMatchState) {
  return normalizeLiveState({
    ...currentState,
    ...nextState,
    players: mergePlayers(currentState, nextState),
  });
}

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

  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");
  if (!roomCode) {
    return NextResponse.json({ error: "missing_room_code" }, { status: 400 });
  }

  const { adminClient } = getSupabaseAdminClients();
  const { data, error } = await adminClient
    .from("live_matches")
    .select("id, room_code, state")
    .eq("room_code", roomCode.toUpperCase())
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "match_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    match: {
      ...data,
      state: normalizeLiveState(data.state),
    },
  });
}

export async function POST(request: Request) {
  const authResult = await authorizeRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const body = (await request.json()) as
    | {
        action: "create";
        mode: 301 | 501;
        finishMode: LiveFinishMode;
        legsToWin: number;
        setsToWin: number;
        maxPlayers: number;
        displayName: string;
        bullOffEnabled: boolean;
      }
    | {
        action: "join";
        roomCode: string;
        displayName: string;
      }
    | {
        action: "update";
        roomCode: string;
        state: LiveMatchState;
      };

  const { adminClient } = getSupabaseAdminClients();
  const adminEmail = process.env.ADMIN_EMAIL ?? "";

  if (body.action === "create") {
    const displayName = getPreferredDisplayName(authResult.user.email, body.displayName, adminEmail);
    const roomCode = generateRoomCode();
    const state = createEmptyLiveState({
      mode: body.mode,
      finishMode: body.finishMode,
      legsToWin: body.legsToWin,
      setsToWin: body.setsToWin,
      maxPlayers: body.maxPlayers,
      ownerName: displayName,
      ownerId: authResult.user.id,
      bullOffEnabled: body.bullOffEnabled,
    });

    const { data, error } = await adminClient
      .from("live_matches")
      .insert({
        owner_id: authResult.user.id,
        room_code: roomCode,
        state,
      })
      .select("id, room_code, state")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "create_failed" }, { status: 400 });
    }

    return NextResponse.json({ match: data });
  }

  if (body.action === "join") {
    const displayName = getPreferredDisplayName(authResult.user.email, body.displayName, adminEmail);
    const { data, error } = await adminClient
      .from("live_matches")
      .select("id, room_code, state")
      .eq("room_code", body.roomCode.toUpperCase())
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "match_not_found" }, { status: 404 });
    }

    const match = data as LiveMatchRow;
    const state = normalizeLiveState(match.state);
    const alreadyJoinedIndex = state.players.findIndex((player) => player.profileId === authResult.user.id);
    if (alreadyJoinedIndex >= 0) {
      return NextResponse.json({ match });
    }

    const openSeatIndex = state.players.findIndex((player) => !player.joined);
    if (openSeatIndex < 0) {
      return NextResponse.json({ error: "room_full" }, { status: 400 });
    }

    state.players[openSeatIndex] = {
      ...state.players[openSeatIndex],
      name: displayName,
      joined: true,
      score: state.mode,
      profileId: authResult.user.id,
    };
    state.statusText = `${displayName} ist dem Raum beigetreten.`;

    const { data: updated, error: updateError } = await adminClient
      .from("live_matches")
      .update({
        state,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .select("id, room_code, state")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "join_failed" }, { status: 400 });
    }

    return NextResponse.json({ match: updated });
  }

  if (body.action === "update") {
    const { data, error } = await adminClient
      .from("live_matches")
      .select("id, room_code, state")
      .eq("room_code", body.roomCode.toUpperCase())
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "match_not_found" }, { status: 404 });
    }

    const match = data as LiveMatchRow;
    const currentState = normalizeLiveState(match.state);
    const isParticipant = currentState.players.some(
      (player) => player.joined && player.profileId === authResult.user.id,
    );
    if (!isParticipant) {
      return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
    }

    const { data: updated, error: updateError } = await adminClient
      .from("live_matches")
      .update({
        state: mergeLiveState(currentState, body.state),
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .select("id, room_code, state")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "update_failed" }, { status: 400 });
    }

    return NextResponse.json({ match: updated });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
