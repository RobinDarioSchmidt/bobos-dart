export type LiveGameMode = 301 | 501;
export type LiveEntryMode = "single" | "double" | "master";
export type LiveFinishMode = "single" | "double" | "master";
export type LiveSegmentRing =
  | "single-inner"
  | "single-outer"
  | "double"
  | "triple"
  | "outer-bull"
  | "bull"
  | "miss";

export type LiveBoardMarker = {
  x: number;
  y: number;
  label: string;
  ring: LiveSegmentRing;
};

export type LiveDart = {
  label: string;
  score: number;
  number: number;
  multiplier: 0 | 1 | 2 | 3;
  ring: LiveSegmentRing;
  marker: LiveBoardMarker | null;
};

export type LiveVisit = {
  playerIndex: number;
  playerName: string;
  total: number;
  scoreBefore: number;
  scoreAfter: number;
  bust: boolean;
  checkout: boolean;
  result: "ok" | "bust" | "checkout" | "leg-win";
  darts: string[];
  dartDetails?: LiveDart[];
  note: string;
  createdAt: string;
};

export type LiveCloudSyncState = {
  sessionKey: string;
  persistedOwnerIds: string[];
  persistedAt: string | null;
  deviceLocks: LiveDeviceLock[];
};

export type LiveDeviceLock = {
  profileId: string;
  deviceId: string;
  deviceLabel: string;
  lastSeenAt: string;
};

export type LivePlayer = {
  name: string;
  score: number;
  legs: number;
  sets: number;
  joined: boolean;
  profileId: string | null;
  entered: boolean;
};

export type LivePendingVisit = {
  playerIndex: number;
  playerName: string;
  darts: LiveDart[];
  updatedAt: string;
};

export type LiveBullOffAttempt = {
  playerIndex: number;
  playerName: string;
  dart: LiveDart;
  rank: number;
  createdAt: string;
};

export type LiveBullOffState = {
  enabled: boolean;
  completed: boolean;
  currentPlayerIndex: number | null;
  winnerIndex: number | null;
  attempts: LiveBullOffAttempt[];
};

export type LiveRoomEvent = {
  id: string;
  type: "room" | "device" | "leg" | "match";
  text: string;
  createdAt: string;
};

export type LiveMatchState = {
  revision: number;
  mode: LiveGameMode;
  entryMode: LiveEntryMode;
  finishMode: LiveFinishMode;
  legsToWin: number;
  setsToWin: number;
  maxPlayers: number;
  activePlayer: number;
  legStartingPlayer: number;
  legWinner: number | null;
  matchWinner: number | null;
  statusText: string;
  bullOffEnabled: boolean;
  bullOff: LiveBullOffState;
  players: LivePlayer[];
  history: LiveVisit[];
  events: LiveRoomEvent[];
  pendingVisit: LivePendingVisit | null;
  lastCallout: string | null;
  cloudSync: LiveCloudSyncState;
};

export const LIVE_DEVICE_LOCK_TIMEOUT_MS = 45_000;

function cloneState<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as T;
}

function generateSessionKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveLegacySessionKey(state: Partial<LiveMatchState>) {
  const playerSignature = (state.players ?? [])
    .filter((player) => player?.joined)
    .map((player) => player?.name ?? "spieler")
    .join("-");
  const historySeed = state.history?.[state.history.length - 1]?.createdAt ?? "legacy";
  return `legacy-${state.mode ?? 501}-${state.finishMode ?? "double"}-${playerSignature}-${historySeed}`;
}

function getEntryModeLabel(entryMode: LiveEntryMode) {
  if (entryMode === "double") {
    return "Double In";
  }

  if (entryMode === "master") {
    return "Masters In";
  }

  return "Straight In";
}

export function createEmptyLiveState(params: {
  mode: LiveGameMode;
  entryMode: LiveEntryMode;
  finishMode: LiveFinishMode;
  legsToWin: number;
  setsToWin: number;
  maxPlayers: number;
  ownerName: string;
  ownerId: string;
  bullOffEnabled: boolean;
}) {
  const players: LivePlayer[] = Array.from({ length: params.maxPlayers }, (_, index) =>
    index === 0
      ? {
          name: params.ownerName,
          score: params.mode,
          legs: 0,
          sets: 0,
          joined: true,
          profileId: params.ownerId,
          entered: params.entryMode === "single",
        }
      : {
          name: `Spieler ${index + 1}`,
          score: params.mode,
          legs: 0,
          sets: 0,
          joined: false,
          profileId: null,
          entered: false,
        },
  );

  const initialBullOffPlayer = params.bullOffEnabled ? 0 : null;

  return {
    revision: 1,
    mode: params.mode,
    entryMode: params.entryMode,
    finishMode: params.finishMode,
    legsToWin: params.legsToWin,
    setsToWin: params.setsToWin,
    maxPlayers: params.maxPlayers,
    activePlayer: 0,
    legStartingPlayer: 0,
    legWinner: null,
    matchWinner: null,
    statusText: params.bullOffEnabled
      ? `${params.ownerName} hat den Raum erstellt. Bull-Off entscheidet ueber den Start.`
      : params.entryMode === "single"
        ? `${params.ownerName} hat den Raum erstellt.`
        : `${params.ownerName} hat den Raum erstellt. ${getEntryModeLabel(params.entryMode)} ist aktiv.`,
    bullOffEnabled: params.bullOffEnabled,
    bullOff: {
      enabled: params.bullOffEnabled,
      completed: !params.bullOffEnabled,
      currentPlayerIndex: initialBullOffPlayer,
      winnerIndex: null,
      attempts: [],
    },
    players,
    history: [],
    events: [
      {
        id: generateEventId(),
        type: "room",
        text: `${params.ownerName} hat den Raum erstellt.`,
        createdAt: new Date().toISOString(),
      },
    ],
    pendingVisit: null,
    lastCallout: null,
    cloudSync: {
      sessionKey: generateSessionKey(),
      persistedOwnerIds: [],
      persistedAt: null,
      deviceLocks: [],
    },
  } satisfies LiveMatchState;
}

export function getPreferredDisplayName(email: string | undefined, fallbackName: string, adminEmail: string) {
  if (email && adminEmail && email === adminEmail) {
    return "Robin";
  }

  return fallbackName.trim() || email?.split("@")[0] || "Spieler";
}

export function isDoubleValue(value: number) {
  return value === 50 || (value > 0 && value % 2 === 0 && value <= 40);
}

export function canFinishWithDart(dart: LiveDart, finishMode: LiveFinishMode) {
  if (finishMode === "single") {
    return true;
  }

  if (finishMode === "double") {
    return dart.multiplier === 2;
  }

  return dart.multiplier === 2 || dart.multiplier === 3;
}

export function canStartWithDart(dart: LiveDart, entryMode: LiveEntryMode) {
  if (entryMode === "single") {
    return dart.score > 0;
  }

  if (entryMode === "double") {
    return dart.multiplier === 2;
  }

  return dart.multiplier === 2 || dart.multiplier === 3;
}

export function normalizeLiveState(state: LiveMatchState | (Record<string, unknown> & Partial<LiveMatchState>)) {
  const nextState = cloneState(state) as Partial<LiveMatchState> & {
    doubleOut?: boolean;
  };
  const entryMode = nextState.entryMode ?? "single";
  const finishMode =
    nextState.finishMode ??
    (nextState.doubleOut === true ? "double" : "single");
  const bullOffEnabled = nextState.bullOffEnabled ?? false;
  const joinedIndexes = (nextState.players ?? [])
    .map((player, index) => (player?.joined ? index : -1))
    .filter((index) => index >= 0);

  return {
    revision: typeof nextState.revision === "number" ? nextState.revision : 0,
    mode: nextState.mode ?? 501,
    entryMode,
    finishMode,
    legsToWin: nextState.legsToWin ?? 3,
    setsToWin: nextState.setsToWin ?? 1,
    maxPlayers: nextState.maxPlayers ?? Math.max((nextState.players ?? []).length, 2),
    activePlayer: nextState.activePlayer ?? 0,
    legStartingPlayer: nextState.legStartingPlayer ?? nextState.activePlayer ?? 0,
    legWinner: nextState.legWinner ?? null,
    matchWinner: nextState.matchWinner ?? null,
    statusText: nextState.statusText ?? "Live-Match bereit.",
    bullOffEnabled,
    bullOff: nextState.bullOff ?? {
      enabled: bullOffEnabled,
      completed: !bullOffEnabled,
      currentPlayerIndex: bullOffEnabled ? joinedIndexes[0] ?? 0 : null,
      winnerIndex: null,
      attempts: [],
    },
    players: (nextState.players ?? []).map((player) => ({
      ...player,
      entered: player.entered ?? (entryMode === "single" && player.joined),
    })),
    history: nextState.history ?? [],
    events: nextState.events ?? [],
    pendingVisit: nextState.pendingVisit ?? null,
    lastCallout: nextState.lastCallout ?? null,
    cloudSync: {
      sessionKey: nextState.cloudSync?.sessionKey ?? deriveLegacySessionKey(nextState),
      persistedOwnerIds: nextState.cloudSync?.persistedOwnerIds ?? [],
      persistedAt: nextState.cloudSync?.persistedAt ?? null,
      deviceLocks: nextState.cloudSync?.deviceLocks ?? [],
    },
  } satisfies LiveMatchState;
}

export function isLiveDeviceLockActive(lock: LiveDeviceLock | null | undefined, now = Date.now()) {
  if (!lock?.lastSeenAt) {
    return false;
  }

  const lastSeen = Date.parse(lock.lastSeenAt);
  if (!Number.isFinite(lastSeen)) {
    return false;
  }

  return now - lastSeen < LIVE_DEVICE_LOCK_TIMEOUT_MS;
}

export function getThrowCallout(dart: LiveDart) {
  if (dart.ring === "miss" || dart.score === 0) {
    return "No score!";
  }

  if (dart.ring === "bull") {
    return "Bullseye!";
  }

  if (dart.ring === "outer-bull") {
    return "Outer bull!";
  }

  const numberText = dart.number === 25 ? "bull" : String(dart.number === 0 ? dart.score : dart.number);
  if (dart.multiplier === 3) {
    return `Triple ${numberText}!`;
  }
  if (dart.multiplier === 2) {
    return `Double ${numberText}!`;
  }
  return `${numberText}!`;
}

export function getNextJoinedPlayerIndex(state: LiveMatchState, fromIndex: number) {
  const joinedPlayers = state.players.filter((player) => player.joined).length;
  if (joinedPlayers <= 1) {
    return fromIndex;
  }

  let index = fromIndex;
  for (let step = 0; step < state.players.length; step += 1) {
    index = (index + 1) % state.players.length;
    if (state.players[index]?.joined) {
      return index;
    }
  }

  return fromIndex;
}

function getJoinedPlayerIndexes(state: LiveMatchState) {
  return state.players
    .map((player, index) => (player.joined ? index : -1))
    .filter((index) => index >= 0);
}

function getBullOffRank(dart: LiveDart) {
  if (!dart.marker) {
    return Number.NEGATIVE_INFINITY;
  }

  const distance = Math.hypot(dart.marker.x - 200, dart.marker.y - 200);
  return -distance;
}

function evaluateVisit(
  scoreBefore: number,
  darts: LiveDart[],
  playerEntered: boolean,
  entryMode: LiveEntryMode,
  finishMode: LiveFinishMode,
) {
  let scoreAfter = scoreBefore;
  let entered = playerEntered;
  let countedTotal = 0;
  let usedDarts: LiveDart[] = [];

  for (let index = 0; index < darts.length; index += 1) {
    const dart = darts[index];
    if (!entered) {
      if (!canStartWithDart(dart, entryMode)) {
        usedDarts = darts.slice(0, index + 1);
        continue;
      }

      entered = true;
    }

    const remaining = scoreAfter - dart.score;
    countedTotal += dart.score;
    usedDarts = darts.slice(0, index + 1);

    if (remaining < 0) {
      return {
        total: countedTotal,
        scoreAfter: scoreBefore,
        bust: true,
        checkout: false,
        usedDarts,
        enteredAfterVisit: playerEntered,
      };
    }

    if (finishMode !== "single" && remaining === 1) {
      return {
        total: countedTotal,
        scoreAfter: scoreBefore,
        bust: true,
        checkout: false,
        usedDarts,
        enteredAfterVisit: playerEntered,
      };
    }

    if (remaining === 0) {
      if (!canFinishWithDart(dart, finishMode)) {
        return {
          total: countedTotal,
          scoreAfter: scoreBefore,
          bust: true,
          checkout: false,
          usedDarts,
          enteredAfterVisit: playerEntered,
        };
      }

      return {
        total: countedTotal,
        scoreAfter: 0,
        bust: false,
        checkout: true,
        usedDarts,
        enteredAfterVisit: true,
      };
    }

    scoreAfter = remaining;
  }

  return {
    total: countedTotal,
    scoreAfter,
    bust: false,
    checkout: false,
    usedDarts,
    enteredAfterVisit: entered,
  };
}

function resetPendingVisit(state: LiveMatchState) {
  state.pendingVisit = null;
}

function appendHistoryEntry(state: LiveMatchState, entry: LiveVisit) {
  state.history = [entry, ...state.history];
}

export function appendLiveEvent(
  state: LiveMatchState,
  event: Omit<LiveRoomEvent, "id" | "createdAt"> & { createdAt?: string },
) {
  state.events = [
    {
      id: generateEventId(),
      createdAt: event.createdAt ?? new Date().toISOString(),
      type: event.type,
      text: event.text,
    },
    ...(state.events ?? []),
  ].slice(0, 18);
}

function resolveBullOff(state: LiveMatchState) {
  const attempts = [...state.bullOff.attempts].sort((left, right) => {
    if (right.rank !== left.rank) {
      return right.rank - left.rank;
    }

    return right.dart.score - left.dart.score;
  });

  const winner = attempts[0];
  state.bullOff.completed = true;
  state.bullOff.currentPlayerIndex = null;
  state.bullOff.winnerIndex = winner?.playerIndex ?? 0;
  state.activePlayer = winner?.playerIndex ?? 0;
  state.legStartingPlayer = winner?.playerIndex ?? 0;
  if (winner) {
    appendLiveEvent(state, {
      type: "leg",
      text: `${winner.playerName} gewinnt das Bull-Off und beginnt.`,
    });
  }
  state.statusText = winner
    ? `${winner.playerName} gewinnt das Bull-Off und beginnt das Leg.`
    : "Bull-Off beendet.";
}

export function applyBullOffThrow(previousState: LiveMatchState, dart: LiveDart) {
  const nextState = normalizeLiveState(previousState);
  if (!nextState.bullOff.enabled || nextState.bullOff.completed) {
    return nextState;
  }

  const currentPlayerIndex = nextState.bullOff.currentPlayerIndex ?? nextState.activePlayer;
  const currentPlayer = nextState.players[currentPlayerIndex];
  if (!currentPlayer?.joined) {
    return nextState;
  }

  nextState.bullOff.attempts = [
    ...nextState.bullOff.attempts,
    {
      playerIndex: currentPlayerIndex,
      playerName: currentPlayer.name,
      dart,
      rank: getBullOffRank(dart),
      createdAt: new Date().toISOString(),
    },
  ];
  nextState.lastCallout = getThrowCallout(dart);

  const joinedPlayers = getJoinedPlayerIndexes(nextState);
  const attemptedPlayers = new Set(nextState.bullOff.attempts.map((entry) => entry.playerIndex));
  const nextPlayerIndex = joinedPlayers.find((index) => !attemptedPlayers.has(index));

  if (typeof nextPlayerIndex === "number") {
    nextState.bullOff.currentPlayerIndex = nextPlayerIndex;
    nextState.statusText = `${nextState.players[nextPlayerIndex].name} wirft fuer das Bull-Off.`;
    return nextState;
  }

  resolveBullOff(nextState);
  return nextState;
}

export function addPendingDart(previousState: LiveMatchState, dart: LiveDart) {
  const nextState = normalizeLiveState(previousState);
  if (nextState.matchWinner !== null || nextState.legWinner !== null) {
    return nextState;
  }

  if (nextState.bullOff.enabled && !nextState.bullOff.completed) {
    return applyBullOffThrow(nextState, dart);
  }

  const player = nextState.players[nextState.activePlayer];
  if (!player?.joined) {
    return nextState;
  }

  const nextDarts = [...(nextState.pendingVisit?.darts ?? []), dart].slice(0, 3);
  nextState.pendingVisit = {
    playerIndex: nextState.activePlayer,
    playerName: player.name,
    darts: nextDarts,
    updatedAt: new Date().toISOString(),
  };
  nextState.lastCallout = getThrowCallout(dart);

  const evaluation = evaluateVisit(player.score, nextDarts, player.entered, nextState.entryMode, nextState.finishMode);
  if (evaluation.bust || evaluation.checkout) {
    return finalizePendingVisit(nextState);
  }

  nextState.statusText = `${player.name} baut den Besuch auf (${evaluation.total} Punkte).`;
  return nextState;
}

export function removePendingDart(previousState: LiveMatchState) {
  const nextState = normalizeLiveState(previousState);
  if (!nextState.pendingVisit || nextState.pendingVisit.playerIndex !== nextState.activePlayer) {
    return nextState;
  }

  const nextDarts = nextState.pendingVisit.darts.slice(0, -1);
  if (nextDarts.length === 0) {
    nextState.pendingVisit = null;
    nextState.statusText = `${nextState.players[nextState.activePlayer].name} ist am Zug.`;
    return nextState;
  }

  nextState.pendingVisit = {
    ...nextState.pendingVisit,
    darts: nextDarts,
    updatedAt: new Date().toISOString(),
  };
  nextState.statusText = `${nextState.players[nextState.activePlayer].name} korrigiert den Besuch.`;
  return nextState;
}

export function clearPendingVisit(previousState: LiveMatchState) {
  const nextState = normalizeLiveState(previousState);
  if (!nextState.pendingVisit || nextState.pendingVisit.playerIndex !== nextState.activePlayer) {
    return nextState;
  }

  resetPendingVisit(nextState);
  nextState.statusText = `${nextState.players[nextState.activePlayer].name} hat den Besuch geleert.`;
  return nextState;
}

export function finalizePendingVisit(previousState: LiveMatchState) {
  const nextState = normalizeLiveState(previousState);
  if (!nextState.pendingVisit || nextState.pendingVisit.playerIndex !== nextState.activePlayer) {
    return nextState;
  }

  const player = nextState.players[nextState.activePlayer];
  const scoreBefore = player.score;
  const evaluation = evaluateVisit(
    scoreBefore,
    nextState.pendingVisit.darts,
    player.entered,
    nextState.entryMode,
    nextState.finishMode,
  );
  const usedLabels = evaluation.usedDarts.map((dart) => dart.label);
  const wasEnteredBeforeVisit = player.entered;

  appendHistoryEntry(nextState, {
    playerIndex: nextState.activePlayer,
    playerName: player.name,
    total: evaluation.total,
    scoreBefore,
    scoreAfter: evaluation.bust ? scoreBefore : evaluation.scoreAfter,
    bust: evaluation.bust,
    checkout: evaluation.checkout,
    result: evaluation.bust ? "bust" : evaluation.checkout ? "checkout" : "ok",
    darts: usedLabels,
    dartDetails: evaluation.usedDarts,
    note: evaluation.bust
      ? "Miss"
      : evaluation.checkout
        ? "Checkout"
        : !evaluation.enteredAfterVisit
          ? "Nicht drin"
          : !wasEnteredBeforeVisit && evaluation.enteredAfterVisit
            ? "In"
            : "OK",
    createdAt: new Date().toISOString(),
  });

  resetPendingVisit(nextState);

  if (evaluation.bust) {
    nextState.activePlayer = getNextJoinedPlayerIndex(nextState, nextState.activePlayer);
    nextState.statusText = `${player.name} macht Miss. ${nextState.players[nextState.activePlayer].name} ist dran.`;
    return nextState;
  }

  player.entered = evaluation.enteredAfterVisit;
  player.score = evaluation.scoreAfter;

  if (!player.entered) {
    nextState.activePlayer = getNextJoinedPlayerIndex(nextState, nextState.activePlayer);
    nextState.statusText = `${player.name} kommt noch nicht rein. ${nextState.players[nextState.activePlayer].name} ist dran.`;
    return nextState;
  }

  if (evaluation.checkout) {
    player.legs += 1;
    nextState.legWinner = nextState.activePlayer;
    nextState.statusText = `${player.name} gewinnt das Leg.`;

    appendHistoryEntry(nextState, {
      playerIndex: nextState.activePlayer,
      playerName: player.name,
      total: evaluation.total,
      scoreBefore,
      scoreAfter: 0,
      bust: false,
      checkout: true,
      result: "leg-win",
      darts: usedLabels,
      dartDetails: evaluation.usedDarts,
      note: `${player.name} gewinnt das Leg`,
      createdAt: new Date().toISOString(),
    });
    appendLiveEvent(nextState, {
      type: "leg",
      text: `${player.name} gewinnt das Leg.`,
    });

    if (player.legs >= nextState.legsToWin) {
      player.sets += 1;
      nextState.statusText = `${player.name} gewinnt den Satz.`;
      nextState.players.forEach((entry) => {
        entry.legs = 0;
      });
    }

    if (player.sets >= nextState.setsToWin) {
      nextState.matchWinner = nextState.activePlayer;
      appendLiveEvent(nextState, {
        type: "match",
        text: `${player.name} gewinnt das Match.`,
      });
      nextState.statusText = `${player.name} gewinnt das Match.`;
    }

    return nextState;
  }

  nextState.activePlayer = getNextJoinedPlayerIndex(nextState, nextState.activePlayer);
  nextState.statusText = `${player.name} stellt ${evaluation.scoreAfter}. ${nextState.players[nextState.activePlayer].name} ist dran.`;
  return nextState;
}

export function startNextLiveLeg(previousState: LiveMatchState) {
  const nextState = normalizeLiveState(previousState);
  const nextStarter = getNextJoinedPlayerIndex(nextState, nextState.legStartingPlayer);
  nextState.players = nextState.players.map((player) => ({
    ...player,
    score: nextState.mode,
    entered: nextState.entryMode === "single",
  }));
  nextState.pendingVisit = null;
  nextState.legWinner = null;
  nextState.lastCallout = null;
  nextState.activePlayer = nextStarter;
  nextState.legStartingPlayer = nextStarter;
  nextState.bullOff = {
    ...nextState.bullOff,
    completed: true,
    currentPlayerIndex: null,
    attempts: [],
  };
  nextState.statusText =
    nextState.entryMode === "single"
      ? `${nextState.players[nextStarter].name} beginnt das naechste Leg.`
      : `${nextState.players[nextStarter].name} beginnt das naechste Leg und sucht ${getEntryModeLabel(nextState.entryMode)}.`;
  appendLiveEvent(nextState, {
    type: "leg",
    text: `${nextState.players[nextStarter].name} startet das naechste Leg.`,
  });
  return nextState;
}

export function startRematchLiveMatch(previousState: LiveMatchState) {
  const nextState = normalizeLiveState(previousState);
  const firstJoined = getJoinedPlayerIndexes(nextState)[0] ?? 0;
  const rematchStarter =
    nextState.bullOff.enabled
      ? firstJoined
      : nextState.matchWinner ?? nextState.legWinner ?? firstJoined;

  nextState.players = nextState.players.map((player) => ({
    ...player,
    score: nextState.mode,
    legs: 0,
    sets: 0,
    entered: nextState.entryMode === "single",
  }));
  nextState.history = [];
  nextState.pendingVisit = null;
  nextState.legWinner = null;
  nextState.matchWinner = null;
  nextState.lastCallout = null;
  nextState.legStartingPlayer = rematchStarter;
  nextState.cloudSync = {
    sessionKey: generateSessionKey(),
    persistedOwnerIds: [],
    persistedAt: null,
    deviceLocks: nextState.cloudSync.deviceLocks ?? [],
  };

  if (nextState.bullOff.enabled) {
    nextState.bullOff = {
      enabled: true,
      completed: false,
      currentPlayerIndex: firstJoined,
      winnerIndex: null,
      attempts: [],
    };
    nextState.activePlayer = firstJoined;
    nextState.legStartingPlayer = firstJoined;
    nextState.statusText = `${nextState.players[firstJoined].name} startet das Bull-Off fuer das Rematch.`;
    appendLiveEvent(nextState, {
      type: "match",
      text: `${nextState.players[firstJoined].name} startet das Rematch mit Bull-Off.`,
    });
    return nextState;
  }

  nextState.bullOff = {
    enabled: false,
    completed: true,
    currentPlayerIndex: null,
    winnerIndex: null,
    attempts: [],
  };
  nextState.activePlayer = rematchStarter;
  nextState.legStartingPlayer = rematchStarter;
  nextState.statusText =
    nextState.entryMode === "single"
      ? `${nextState.players[rematchStarter].name} beginnt das Rematch.`
      : `${nextState.players[rematchStarter].name} beginnt das Rematch und sucht ${getEntryModeLabel(nextState.entryMode)}.`;
  appendLiveEvent(nextState, {
    type: "match",
    text: `${nextState.players[rematchStarter].name} startet das Rematch.`,
  });
  return nextState;
}

const LIVE_ROOM_WORDS = [
  "BONGO",
  "PFEIL",
  "BULLI",
  "DARTS",
  "WUMMS",
  "TREFF",
  "RINGE",
  "ZOCKE",
  "KNEIP",
  "FLUKE",
  "PENGO",
  "MAMBO",
  "BANJO",
  "JOKER",
  "NINJA",
  "PANDA",
  "TURBO",
  "RADAR",
  "MAMUT",
  "KOBRA",
  "TIGER",
  "FALKE",
  "WIKING",
  "BOMBE",
  "PINGU",
  "PIRAT",
  "KOMET",
  "FUNKY",
  "JUMBO",
  "ZEBRA",
  "KURVE",
  "HONIG",
  "MELON",
  "KAKAO",
  "DONUT",
  "FLASH",
  "RUMBA",
  "SPASS",
  "WOLKE",
  "GRINS",
  "KNALL",
  "KRASS",
  "FROST",
  "KIOSK",
  "MIXER",
  "BUDDY",
  "CHILI",
  "MANGO",
];

export function generateRoomCode() {
  return LIVE_ROOM_WORDS[Math.floor(Math.random() * LIVE_ROOM_WORDS.length)] ?? "DARTS";
}
