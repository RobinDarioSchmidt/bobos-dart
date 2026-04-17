export type LiveGameMode = 301 | 501;

export type LiveVisit = {
  playerName: string;
  total: number;
  scoreBefore: number;
  scoreAfter: number;
  bust: boolean;
  checkout: boolean;
  createdAt: string;
};

export type LivePlayer = {
  name: string;
  score: number;
  legs: number;
  sets: number;
  joined: boolean;
  profileId: string | null;
};

export type LiveMatchState = {
  mode: LiveGameMode;
  doubleOut: boolean;
  legsToWin: number;
  setsToWin: number;
  maxPlayers: number;
  activePlayer: number;
  legWinner: number | null;
  matchWinner: number | null;
  statusText: string;
  players: LivePlayer[];
  history: LiveVisit[];
};

export function createEmptyLiveState(params: {
  mode: LiveGameMode;
  doubleOut: boolean;
  legsToWin: number;
  setsToWin: number;
  maxPlayers: number;
  ownerName: string;
  ownerId: string;
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
        }
      : {
          name: `Spieler ${index + 1}`,
          score: params.mode,
          legs: 0,
          sets: 0,
          joined: false,
          profileId: null,
        },
  );

  return {
    mode: params.mode,
    doubleOut: params.doubleOut,
    legsToWin: params.legsToWin,
    setsToWin: params.setsToWin,
    maxPlayers: params.maxPlayers,
    activePlayer: 0,
    legWinner: null,
    matchWinner: null,
    statusText: `${params.ownerName} hat den Raum erstellt.`,
    players,
    history: [],
  } satisfies LiveMatchState;
}

export function getPreferredDisplayName(email: string | undefined, fallbackName: string, adminEmail: string) {
  if (email && adminEmail && email === adminEmail) {
    return "Robin";
  }

  return fallbackName.trim() || email?.split("@")[0] || "Spieler";
}

export function isDouble(value: number) {
  return value === 50 || (value > 0 && value % 2 === 0 && value <= 40);
}

export function applyLiveVisit(
  previousState: LiveMatchState,
  total: number,
  confirmCheckout: boolean,
): LiveMatchState {
  const nextState: LiveMatchState = JSON.parse(JSON.stringify(previousState)) as LiveMatchState;
  if (nextState.matchWinner !== null || nextState.legWinner !== null) {
    return nextState;
  }

  const player = nextState.players[nextState.activePlayer];
  const scoreBefore = player.score;
  const remaining = player.score - total;
  const reachesZero = remaining === 0;
  const bust =
    total < 0 ||
    remaining < 0 ||
    (nextState.doubleOut && remaining === 1) ||
    (reachesZero && nextState.doubleOut && !confirmCheckout);

  const checkout = !bust && reachesZero;

  nextState.history = [
    {
      playerName: player.name,
      total,
      scoreBefore,
      scoreAfter: bust ? scoreBefore : remaining,
      bust,
      checkout,
      createdAt: new Date().toISOString(),
    },
    ...nextState.history,
  ].slice(0, 24);

  if (bust) {
    nextState.activePlayer = getNextJoinedPlayerIndex(nextState, nextState.activePlayer);
    nextState.statusText = `${player.name} bustet. ${nextState.players[nextState.activePlayer].name} ist dran.`;
    return nextState;
  }

  player.score = remaining;

  if (checkout) {
    player.legs += 1;
    nextState.legWinner = nextState.activePlayer;
    nextState.statusText = `${player.name} gewinnt das Leg.`;

    if (player.legs >= nextState.legsToWin) {
      player.sets += 1;
      nextState.statusText = `${player.name} gewinnt den Satz.`;
      nextState.players.forEach((entry) => {
        entry.legs = 0;
      });
    }

    if (player.sets >= nextState.setsToWin) {
      nextState.matchWinner = nextState.activePlayer;
      nextState.statusText = `${player.name} gewinnt das Match.`;
    }

    return nextState;
  }

  nextState.activePlayer = getNextJoinedPlayerIndex(nextState, nextState.activePlayer);
  nextState.statusText = `${player.name} stellt ${remaining}. ${nextState.players[nextState.activePlayer].name} ist dran.`;
  return nextState;
}

export function startNextLiveLeg(previousState: LiveMatchState) {
  const nextState: LiveMatchState = JSON.parse(JSON.stringify(previousState)) as LiveMatchState;
  nextState.players = nextState.players.map((player) => ({
    ...player,
    score: nextState.mode,
  }));
  nextState.activePlayer = getNextJoinedPlayerIndex(nextState, nextState.activePlayer);
  nextState.legWinner = null;
  nextState.statusText = `${nextState.players[nextState.activePlayer].name} beginnt das naechste Leg.`;
  return nextState;
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

export function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
