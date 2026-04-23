import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import {
  createEmptyLiveState,
  generateRoomCode,
  getPreferredDisplayName,
  isLiveDeviceLockActive,
  normalizeLiveState,
  type LiveDeviceLock,
  type LiveFinishMode,
  type LiveCloudSyncState,
  type LiveMatchState,
  type LiveVisit,
} from "@/lib/live-match";
import { authorizeSupabaseRequest } from "@/lib/server/request-auth";

type LiveMatchRow = {
  id: string;
  owner_id: string;
  room_code: string;
  state: LiveMatchState;
  updated_at?: string;
};

type LiveRoomListEntry = {
  room_code: string;
  owner_id: string;
  host_name: string;
  mode: 301 | 501;
  finish_mode: LiveFinishMode;
  joined_players: number;
  max_players: number;
  status_text: string;
};

type CloudMatchInsert = {
  id: string;
  owner_id: string;
  mode: string;
  double_out: boolean;
  legs_to_win: number;
  sets_to_win: number;
  status: "finished";
  winner_profile_id: string | null;
};

const LIVE_ROOM_INACTIVITY_MS = 60 * 60 * 1000;

function mergeCloudSync(currentSync: LiveCloudSyncState, nextSync?: Partial<LiveCloudSyncState> | null) {
  return {
    sessionKey: nextSync?.sessionKey ?? currentSync.sessionKey,
    persistedOwnerIds: Array.from(new Set([...(currentSync.persistedOwnerIds ?? []), ...(nextSync?.persistedOwnerIds ?? [])])),
    persistedAt: nextSync?.persistedAt ?? currentSync.persistedAt ?? null,
    deviceLocks: currentSync.deviceLocks ?? [],
  } satisfies LiveCloudSyncState;
}

function mergeHistory(currentState: LiveMatchState, nextState: LiveMatchState) {
  const incoming = nextState.history ?? [];
  const existing = currentState.history ?? [];
  const seen = new Set<string>();
  const merged: LiveVisit[] = [];

  for (const entry of [...incoming, ...existing]) {
    const key = `${entry.createdAt}-${entry.playerName}-${entry.result}-${entry.darts.join("|")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

function buildStableUuid(seed: string) {
  const hex = Buffer.from(seed, "utf8").toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseLiveThrowLabel(label: string) {
  const trimmed = label.trim();
  if (trimmed === "Bull") {
    return { baseValue: 25, multiplier: 2, ring: "bull", score: 50, hit: true };
  }
  if (trimmed === "Outer Bull") {
    return { baseValue: 25, multiplier: 1, ring: "outer-bull", score: 25, hit: true };
  }
  if (trimmed === "Miss") {
    return { baseValue: 0, multiplier: 0, ring: "miss", score: 0, hit: false };
  }

  const prefix = trimmed[0];
  const numeric = Number(trimmed.slice(1));
  if (!Number.isFinite(numeric)) {
    return { baseValue: 0, multiplier: 0, ring: "unknown", score: 0, hit: false };
  }

  if (prefix === "T") {
    return { baseValue: numeric, multiplier: 3, ring: "triple", score: numeric * 3, hit: true };
  }
  if (prefix === "D") {
    return { baseValue: numeric, multiplier: 2, ring: "double", score: numeric * 2, hit: true };
  }
  return { baseValue: numeric, multiplier: 1, ring: "single", score: numeric, hit: numeric > 0 };
}

function getPersistedOwnerIds(state: LiveMatchState) {
  return new Set(state.cloudSync.persistedOwnerIds ?? []);
}

function getActiveDeviceLocks(state: LiveMatchState) {
  return (state.cloudSync.deviceLocks ?? []).filter((lock) => isLiveDeviceLockActive(lock));
}

function getActiveDeviceLockForProfile(state: LiveMatchState, profileId: string) {
  return getActiveDeviceLocks(state).find((lock) => lock.profileId === profileId) ?? null;
}

function withUpdatedDeviceLock(state: LiveMatchState, deviceLock: LiveDeviceLock) {
  const deviceLocks = (state.cloudSync.deviceLocks ?? []).filter(
    (lock) => isLiveDeviceLockActive(lock) && lock.profileId !== deviceLock.profileId,
  );

  return normalizeLiveState({
    ...state,
    cloudSync: {
      ...state.cloudSync,
      deviceLocks: [...deviceLocks, deviceLock],
    },
  });
}

function withoutDeviceLock(state: LiveMatchState, profileId: string) {
  return normalizeLiveState({
    ...state,
    cloudSync: {
      ...state.cloudSync,
      deviceLocks: (state.cloudSync.deviceLocks ?? []).filter((lock) => lock.profileId !== profileId && isLiveDeviceLockActive(lock)),
    },
  });
}

async function cleanupInactiveLiveRooms(adminClient: ReturnType<typeof getSupabaseAdminClients>["adminClient"]) {
  const cutoffIso = new Date(Date.now() - LIVE_ROOM_INACTIVITY_MS).toISOString();
  const { error } = await adminClient
    .from("live_matches")
    .delete()
    .lt("updated_at", cutoffIso);

  if (error) {
    throw new Error(error.message);
  }
}

async function persistCompletedLiveMatch(adminClient: ReturnType<typeof getSupabaseAdminClients>["adminClient"], state: LiveMatchState) {
  if (state.matchWinner === null) {
    return state;
  }

  const joinedPlayers = state.players.filter((player) => player.joined && player.profileId);
  const persistedIds = getPersistedOwnerIds(state);
  const missingOwners = joinedPlayers
    .map((player) => player.profileId)
    .filter((profileId): profileId is string => typeof profileId === "string" && !persistedIds.has(profileId));

  if (missingOwners.length === 0) {
    return state;
  }

  const visitRows = [...state.history]
    .filter((entry) => entry.result !== "leg-win")
    .reverse();
  const winner = state.players[state.matchWinner];

  for (const ownerId of missingOwners) {
    const visitIndexByPlayer = new Map<number, number>();
    const matchId = buildStableUuid(`${state.cloudSync.sessionKey}:${ownerId}`);
    const matchInsert: CloudMatchInsert = {
      id: matchId,
      owner_id: ownerId,
      mode: String(state.mode),
      double_out: state.finishMode !== "single",
      legs_to_win: state.legsToWin,
      sets_to_win: state.setsToWin,
      status: "finished",
      winner_profile_id: winner?.profileId ?? null,
    };

    const { error: matchError } = await adminClient.from("matches").upsert(matchInsert);
    if (matchError) {
      throw new Error(matchError.message);
    }

    const playerRows = state.players
      .map((player, seatIndex) => {
        if (!player.joined) {
          return null;
        }
        const playerVisits = visitRows.filter((entry) => entry.playerIndex === seatIndex);
        const totalScored = playerVisits
          .filter((entry) => !entry.bust)
          .reduce((sum, entry) => sum + (entry.scoreBefore - entry.scoreAfter), 0);
        const dartsThrown = playerVisits.reduce((sum, entry) => sum + entry.darts.length, 0);
        const bestVisit = playerVisits.reduce((best, entry) => Math.max(best, entry.total), 0);
        const average = dartsThrown > 0 ? Number((((totalScored / dartsThrown) * 3)).toFixed(2)) : 0;
        const legWins = state.history.filter((entry) => entry.result === "leg-win" && entry.playerIndex === seatIndex).length;

        return {
          match_id: matchId,
          profile_id: player.profileId,
          guest_name: player.name,
          seat_index: seatIndex,
          sets_won: player.sets,
          legs_won: legWins,
          average,
          best_visit: bestVisit,
          is_winner: seatIndex === state.matchWinner,
        };
      })
      .filter(Boolean);

    const { error: deletePlayersError } = await adminClient.from("match_players").delete().eq("match_id", matchId);
    if (deletePlayersError) {
      throw new Error(deletePlayersError.message);
    }
    if (playerRows.length > 0) {
      const { error: playersError } = await adminClient.from("match_players").insert(playerRows);
      if (playersError) {
        throw new Error(playersError.message);
      }
    }

    const dartRows = visitRows.flatMap((visit) => {
      const playerVisitIndex = visitIndexByPlayer.get(visit.playerIndex) ?? 0;
      visitIndexByPlayer.set(visit.playerIndex, playerVisitIndex + 1);
      return visit.darts.map((label, dartIndex) => {
        const parsed = parseLiveThrowLabel(label);
        const isLastDart = dartIndex === visit.darts.length - 1;
        return {
          owner_id: ownerId,
          source_type: "match",
          match_id: matchId,
          training_session_id: null,
          player_name: visit.playerName,
          player_seat_index: visit.playerIndex,
          visit_index: playerVisitIndex,
          dart_index: dartIndex,
          segment_label: label,
          base_value: parsed.baseValue,
          multiplier: parsed.multiplier,
          ring: parsed.ring,
          score: parsed.score,
          is_hit: parsed.hit,
          is_checkout_dart: visit.checkout && isLastDart,
          target_label: null,
        };
      });
    });

    const { error: deleteDartsError } = await adminClient
      .from("dart_events")
      .delete()
      .eq("owner_id", ownerId)
      .eq("match_id", matchId);
    if (deleteDartsError) {
      throw new Error(deleteDartsError.message);
    }
    if (dartRows.length > 0) {
      const { error: dartsError } = await adminClient.from("dart_events").insert(dartRows);
      if (dartsError) {
        throw new Error(dartsError.message);
      }
    }
  }

  return normalizeLiveState({
    ...state,
    cloudSync: {
      ...state.cloudSync,
      persistedOwnerIds: Array.from(new Set([...(state.cloudSync.persistedOwnerIds ?? []), ...missingOwners])),
      persistedAt: new Date().toISOString(),
    },
  });
}

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
    history: mergeHistory(currentState, nextState),
    cloudSync: mergeCloudSync(currentState.cloudSync, nextState.cloudSync),
  });
}

export async function GET(request: Request) {
  const authResult = await authorizeSupabaseRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");
  const { adminClient } = getSupabaseAdminClients();

  try {
    await cleanupInactiveLiveRooms(adminClient);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cleanup_failed" },
      { status: 400 },
    );
  }

  if (!roomCode) {
    const { data, error } = await adminClient
      .from("live_matches")
      .select("owner_id, room_code, state")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rooms = ((data ?? []) as LiveMatchRow[])
      .map((entry) => {
        const state = normalizeLiveState(entry.state);
        if (state.matchWinner !== null) {
          return null;
        }

        const joinedPlayers = state.players.filter((player) => player.joined);
        if (joinedPlayers.length === 0 || joinedPlayers.length >= state.maxPlayers) {
          return null;
        }

        return {
          room_code: entry.room_code,
          owner_id: entry.owner_id,
          host_name: state.players[0]?.name ?? "Host",
          mode: state.mode,
          finish_mode: state.finishMode,
          joined_players: joinedPlayers.length,
          max_players: state.maxPlayers,
          status_text: state.statusText,
        } satisfies LiveRoomListEntry;
      })
      .filter((entry): entry is LiveRoomListEntry => Boolean(entry));

    return NextResponse.json({ rooms });
  }

  const { data, error } = await adminClient
    .from("live_matches")
    .select("id, owner_id, room_code, state")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "match_not_found" }, { status: 404 });
  }

  let state = normalizeLiveState(data.state);
  if (state.matchWinner !== null) {
    try {
      const persisted = await persistCompletedLiveMatch(adminClient, state);
      if (JSON.stringify(persisted.cloudSync) !== JSON.stringify(state.cloudSync)) {
        state = persisted;
        await adminClient
          .from("live_matches")
          .update({ state, updated_at: new Date().toISOString() })
          .eq("id", data.id);
      }
    } catch {
      state = normalizeLiveState({
        ...state,
        statusText: `${state.statusText} Cloud-Sync bleibt noch ausstehend.`,
      });
    }
  }

  return NextResponse.json({
    match: {
      ...data,
      state,
    },
  });
}

export async function POST(request: Request) {
  const authResult = await authorizeSupabaseRequest(request);
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
        deviceId?: string;
        deviceLabel?: string;
      }
    | {
        action: "join";
        roomCode: string;
        displayName: string;
        deviceId?: string;
        deviceLabel?: string;
      }
    | {
        action: "update";
        roomCode: string;
        state: LiveMatchState;
        deviceId?: string;
      }
    | {
        action: "claim_device";
        roomCode: string;
        deviceId: string;
        deviceLabel: string;
        force?: boolean;
      }
    | {
        action: "leave";
        roomCode: string;
      }
    | {
        action: "close";
        roomCode: string;
      };

  const { adminClient } = getSupabaseAdminClients();
  const adminEmail = process.env.ADMIN_EMAIL ?? "";

  try {
    await cleanupInactiveLiveRooms(adminClient);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cleanup_failed" },
      { status: 400 },
    );
  }

  if (body.action === "create") {
    const displayName = getPreferredDisplayName(authResult.user.email, body.displayName, adminEmail);
    const roomCode = generateRoomCode();
    let state: LiveMatchState = createEmptyLiveState({
      mode: body.mode,
      finishMode: body.finishMode,
      legsToWin: body.legsToWin,
      setsToWin: body.setsToWin,
      maxPlayers: body.maxPlayers,
      ownerName: displayName,
      ownerId: authResult.user.id,
      bullOffEnabled: body.bullOffEnabled,
    });
    if (body.deviceId) {
      state = withUpdatedDeviceLock(state, {
        profileId: authResult.user.id,
        deviceId: body.deviceId,
        deviceLabel: body.deviceLabel ?? "Dieses Geraet",
        lastSeenAt: new Date().toISOString(),
      });
    }

    const { data, error } = await adminClient
      .from("live_matches")
      .insert({
        owner_id: authResult.user.id,
        room_code: roomCode,
        state,
      })
      .select("id, owner_id, room_code, state")
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
      .select("id, owner_id, room_code, state")
      .eq("room_code", body.roomCode.toUpperCase())
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "match_not_found" }, { status: 404 });
    }

    const match = data as LiveMatchRow;
    let state: LiveMatchState = normalizeLiveState(match.state);
    const alreadyJoinedIndex = state.players.findIndex((player) => player.profileId === authResult.user.id);
    if (alreadyJoinedIndex >= 0) {
      if (body.deviceId) {
        const activeDeviceLock = getActiveDeviceLockForProfile(state, authResult.user.id);
        if (activeDeviceLock && activeDeviceLock.deviceId !== body.deviceId) {
          return NextResponse.json(
            { error: `device_already_active:${activeDeviceLock.deviceLabel}` },
            { status: 409 },
          );
        }

        state = withUpdatedDeviceLock(state, {
          profileId: authResult.user.id,
          deviceId: body.deviceId,
          deviceLabel: body.deviceLabel ?? "Dieses Geraet",
          lastSeenAt: new Date().toISOString(),
        });

        const { data: refreshed, error: refreshError } = await adminClient
          .from("live_matches")
          .update({
            state,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id)
          .select("id, owner_id, room_code, state")
          .single();

        if (refreshError || !refreshed) {
          return NextResponse.json({ error: refreshError?.message ?? "join_failed" }, { status: 400 });
        }

        return NextResponse.json({ match: refreshed });
      }

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
    state.statusText = `${displayName} ist im Online-Match angekommen.`;
    if (body.deviceId) {
      state = withUpdatedDeviceLock(state, {
        profileId: authResult.user.id,
        deviceId: body.deviceId,
        deviceLabel: body.deviceLabel ?? "Dieses Geraet",
        lastSeenAt: new Date().toISOString(),
      });
    }

    const { data: updated, error: updateError } = await adminClient
      .from("live_matches")
      .update({
        state,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .select("id, owner_id, room_code, state")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "join_failed" }, { status: 400 });
    }

    return NextResponse.json({ match: updated });
  }

  if (body.action === "claim_device") {
    const { data, error } = await adminClient
      .from("live_matches")
      .select("id, owner_id, room_code, state")
      .eq("room_code", body.roomCode.toUpperCase())
      .maybeSingle();

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

    const activeDeviceLock = getActiveDeviceLockForProfile(currentState, authResult.user.id);
    if (activeDeviceLock && activeDeviceLock.deviceId !== body.deviceId && !body.force) {
      return NextResponse.json(
        { error: `device_already_active:${activeDeviceLock.deviceLabel}` },
        { status: 409 },
      );
    }

    const stateToStore = withUpdatedDeviceLock(currentState, {
      profileId: authResult.user.id,
      deviceId: body.deviceId,
      deviceLabel: body.deviceLabel,
      lastSeenAt: new Date().toISOString(),
    });

    const { data: updated, error: updateError } = await adminClient
      .from("live_matches")
      .update({
        state: stateToStore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .select("id, owner_id, room_code, state")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "claim_device_failed" }, { status: 400 });
    }

    return NextResponse.json({ match: updated });
  }

  if (body.action === "update") {
    const { data, error } = await adminClient
      .from("live_matches")
      .select("id, owner_id, room_code, state")
      .eq("room_code", body.roomCode.toUpperCase())
      .maybeSingle();

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

    const activeDeviceLock = getActiveDeviceLockForProfile(currentState, authResult.user.id);
    if (activeDeviceLock && activeDeviceLock.deviceId !== body.deviceId) {
      return NextResponse.json(
        { error: `device_already_active:${activeDeviceLock.deviceLabel}` },
        { status: 409 },
      );
    }

    let stateToStore = body.deviceId
      ? withUpdatedDeviceLock(currentState, {
          profileId: authResult.user.id,
          deviceId: body.deviceId,
          deviceLabel: activeDeviceLock?.deviceLabel ?? "Dieses Geraet",
          lastSeenAt: new Date().toISOString(),
        })
      : currentState;
    try {
      stateToStore = await persistCompletedLiveMatch(adminClient, stateToStore);
    } catch {
      stateToStore = normalizeLiveState({
        ...stateToStore,
        statusText: `${stateToStore.statusText} Cloud-Sync wird beim nächsten Kontakt erneut versucht.`,
      });
    }

    stateToStore = mergeLiveState(stateToStore, body.state);

    try {
      stateToStore = await persistCompletedLiveMatch(adminClient, stateToStore);
    } catch {
      stateToStore = normalizeLiveState({
        ...stateToStore,
        statusText: `${stateToStore.statusText} Match ist beendet, Cloud-Sync bleibt ausstehend.`,
      });
    }

    const { data: updated, error: updateError } = await adminClient
      .from("live_matches")
      .update({
        state: stateToStore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .select("id, owner_id, room_code, state")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "update_failed" }, { status: 400 });
    }

    return NextResponse.json({ match: updated });
  }

  if (body.action === "leave" || body.action === "close") {
    const { data, error } = await adminClient
      .from("live_matches")
      .select("id, owner_id, room_code, state")
      .eq("room_code", body.roomCode.toUpperCase())
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "match_not_found" }, { status: 404 });
    }

    const match = data as LiveMatchRow;
    let currentState = normalizeLiveState(match.state);
    const participantIndex = currentState.players.findIndex(
      (player) => player.joined && player.profileId === authResult.user.id,
    );
    currentState = withoutDeviceLock(currentState, authResult.user.id);

    if (body.action === "close") {
      if (match.owner_id !== authResult.user.id) {
        return NextResponse.json({ error: "only_host_can_close_room" }, { status: 403 });
      }

      const { error: deleteError } = await adminClient.from("live_matches").delete().eq("id", match.id);
      if (deleteError) {
        return NextResponse.json({ error: deleteError.message ?? "close_failed" }, { status: 400 });
      }

      return NextResponse.json({ closed: true });
    }

    if (participantIndex < 0) {
      return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
    }

    const leavingPlayer = currentState.players[participantIndex];
    currentState.players[participantIndex] = {
      ...currentState.players[participantIndex],
      joined: false,
      profileId: null,
      score: currentState.mode,
      legs: 0,
      sets: 0,
      name: `Spieler ${participantIndex + 1}`,
    };

    if (currentState.pendingVisit?.playerIndex === participantIndex) {
      currentState.pendingVisit = null;
    }

    const remainingJoined = currentState.players
      .map((player, index) => ({ player, index }))
      .filter((entry) => entry.player.joined);

    if (remainingJoined.length === 0) {
      const { error: deleteError } = await adminClient.from("live_matches").delete().eq("id", match.id);
      if (deleteError) {
        return NextResponse.json({ error: deleteError.message ?? "leave_failed" }, { status: 400 });
      }

      return NextResponse.json({ closed: true });
    }

    let nextOwnerId = match.owner_id;
    if (match.owner_id === authResult.user.id) {
      nextOwnerId = remainingJoined[0].player.profileId ?? match.owner_id;
    }

    if (currentState.activePlayer === participantIndex) {
      currentState.activePlayer = remainingJoined[0].index;
    }

    if (currentState.legWinner === participantIndex) {
      currentState.legWinner = null;
    }

    if (currentState.matchWinner === participantIndex) {
      currentState.matchWinner = null;
    }

    if (currentState.bullOff.enabled && !currentState.bullOff.completed) {
      currentState.bullOff.attempts = currentState.bullOff.attempts.filter(
        (attempt) => attempt.playerIndex !== participantIndex,
      );
      currentState.bullOff.currentPlayerIndex = remainingJoined[0].index;
      currentState.statusText = `${leavingPlayer.name} hat den Raum verlassen. ${remainingJoined[0].player.name} ist wieder dran.`;
    } else {
      currentState.statusText = `${leavingPlayer.name} hat den Raum verlassen. ${remainingJoined[0].player.name} f?hrt den Raum weiter.`;
    }

    const { data: updated, error: updateError } = await adminClient
      .from("live_matches")
      .update({
        owner_id: nextOwnerId,
        state: currentState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .select("id, owner_id, room_code, state")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "leave_failed" }, { status: 400 });
    }

    return NextResponse.json({ match: updated, left: true });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
