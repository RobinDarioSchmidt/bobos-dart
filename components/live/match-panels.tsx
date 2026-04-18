"use client";

import type { LiveMatchState } from "@/lib/live-match";
import type { LiveAudioMode } from "@/lib/live-audio";

type LivePlayerStat = {
  name: string;
  visits: number;
  dartsThrown: number;
  scoredPoints: number;
  bestVisit: number;
  average: number;
  busts: number;
  checkouts: number;
};

function getPlayerAwards(liveState: LiveMatchState, playerStats: LivePlayerStat[]) {
  const completedVisits = liveState.history.filter((entry) => entry.result !== "leg-win");
  const bestCheckoutVisit =
    completedVisits
      .filter((entry) => entry.checkout)
      .sort((left, right) => right.total - left.total)[0] ?? null;
  const maxVisit = playerStats.reduce((best, entry) => Math.max(best, entry.bestVisit), 0);
  const scoringKing =
    [...playerStats].sort((left, right) => right.average - left.average || right.scoredPoints - left.scoredPoints)[0] ?? null;
  const pressureKing =
    [...playerStats].sort((left, right) => right.checkouts - left.checkouts || right.bestVisit - left.bestVisit)[0] ?? null;
  const maxVisitOwner = playerStats.find((entry) => entry.bestVisit === maxVisit) ?? null;

  return {
    bestCheckoutVisit,
    scoringKing,
    pressureKing,
    maxVisitOwner,
    maxVisit,
  };
}

function resultStyles(result: LiveMatchState["history"][number]["result"]) {
  if (result === "bust") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  if (result === "leg-win") {
    return "border-emerald-300/40 bg-emerald-300/15 text-emerald-50";
  }

  return "border-emerald-400/20 bg-emerald-400/10 text-emerald-50";
}

export function LiveScoreboardPanel({
  liveState,
  currentPlayerIndex,
  currentUserId,
  connectionState,
  connectedNames,
  isCurrentUsersTurn,
  turnStatus,
  onRefresh,
  cloudSyncPending,
  audioMode,
  onAudioModeChange,
}: {
  liveState: LiveMatchState;
  currentPlayerIndex: number;
  currentUserId: string;
  connectionState: "online" | "offline" | "connecting";
  connectedNames: string[];
  isCurrentUsersTurn: boolean;
  turnStatus: string;
  onRefresh: () => void;
  cloudSyncPending: boolean;
  audioMode: LiveAudioMode;
  onAudioModeChange: (mode: LiveAudioMode) => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Live-Spielstand</h2>
          <p className="mt-1 text-sm text-stone-400">{liveState.statusText}</p>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold"
        >
          Neu laden
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {liveState.players.map((player, index) => {
          const isActive = currentPlayerIndex === index && liveState.matchWinner === null;
          const isMe = player.profileId === currentUserId;

          return (
            <div
              key={`${player.name}-${index}`}
              className={`rounded-[1.25rem] border p-3 ${
                isActive ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-black/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{player.name}</p>
                {isMe ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-stone-300">
                    Du
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-4xl font-semibold leading-none text-white">{player.joined ? player.score : "-"}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-white/5 p-2">
                  <p className="text-stone-400">Sets</p>
                  <p className="mt-1 text-lg font-semibold text-white">{player.sets}</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-2">
                  <p className="text-stone-400">Legs</p>
                  <p className="mt-1 text-lg font-semibold text-white">{player.legs}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Live-Verbindung</p>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
              connectionState === "online"
                ? "bg-emerald-400/20 text-emerald-200"
                : connectionState === "connecting"
                  ? "bg-amber-300/20 text-amber-100"
                  : "bg-red-400/20 text-red-100"
            }`}
          >
            {connectionState === "online" ? "Verbunden" : connectionState === "connecting" ? "Verbindet..." : "Offline"}
          </span>
        </div>
        {cloudSyncPending ? (
          <p className="mt-3 text-xs text-amber-200">Cloud-Statistiken werden fuer dieses Match noch gesichert.</p>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Gerade online im Raum</p>
            <p className="mt-2 text-sm text-white">
              {connectedNames.length > 0 ? connectedNames.join(", ") : "Noch keine aktiven Verbindungen"}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-3 ${
              isCurrentUsersTurn ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-white/5"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Dein Status</p>
            <p className={`mt-2 text-sm font-semibold ${isCurrentUsersTurn ? "text-emerald-100" : "text-white"}`}>{turnStatus}</p>
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Audio</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["off", "Aus"],
                ["speech", "Stimme"],
                ["clips", "Clips"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => onAudioModeChange(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    audioMode === value ? "bg-amber-300 text-black" : "border border-white/10 bg-black/20 text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-400">
            {audioMode === "clips"
              ? "Bereit fuer deine aufgenommenen Audiofiles unter /public/audio/live."
              : audioMode === "speech"
                ? "Browser-Sprachausgabe ist aktiv."
                : "Live-Sounds sind aktuell ausgeschaltet."}
          </p>
        </div>
      </div>
    </section>
  );
}

export function LiveStatsPanel({
  currentLiveStats,
  livePlayerStats,
  currentPlayerName,
}: {
  currentLiveStats: LivePlayerStat | null;
  livePlayerStats: LivePlayerStat[];
  currentPlayerName: string | null;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Live-Stats</p>
          <p className="text-xs text-stone-400">{currentLiveStats ? `${currentLiveStats.name} im Fokus` : "Noch keine Statline"}</p>
        </div>
      </div>
      {currentLiveStats ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/5 p-2">
            <p className="text-stone-400">Average</p>
            <p className="mt-1 text-lg font-semibold text-white">{currentLiveStats.average.toFixed(1)}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-2">
            <p className="text-stone-400">Best Visit</p>
            <p className="mt-1 text-lg font-semibold text-white">{currentLiveStats.bestVisit}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-2">
            <p className="text-stone-400">Busts</p>
            <p className="mt-1 text-lg font-semibold text-white">{currentLiveStats.busts}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-2">
            <p className="text-stone-400">Checkouts</p>
            <p className="mt-1 text-lg font-semibold text-white">{currentLiveStats.checkouts}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-stone-400">Noch keine Live-Stats verfuegbar.</p>
      )}

      <div className="mt-3 space-y-2">
        {livePlayerStats.map((entry) => (
          <div
            key={`live-stat-${entry.name}`}
            className={`rounded-2xl border p-3 ${
              currentPlayerName === entry.name ? "border-emerald-300/25 bg-emerald-400/12" : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{entry.name}</p>
              <p className="text-sm text-stone-300">{entry.average.toFixed(1)} Avg</p>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <p className="text-stone-400">Visits</p>
                <p className="mt-1 font-semibold text-white">{entry.visits}</p>
              </div>
              <div>
                <p className="text-stone-400">Punkte</p>
                <p className="mt-1 font-semibold text-white">{entry.scoredPoints}</p>
              </div>
              <div>
                <p className="text-stone-400">Best</p>
                <p className="mt-1 font-semibold text-white">{entry.bestVisit}</p>
              </div>
              <div>
                <p className="text-stone-400">Busts</p>
                <p className="mt-1 font-semibold text-white">{entry.busts}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LiveHistoryPanel({
  heading,
  historyOpen,
  history,
  onToggle,
}: {
  heading: string;
  historyOpen: boolean;
  history: LiveMatchState["history"];
  onToggle: () => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <h2 className="text-lg font-semibold text-white">{heading}</h2>
        <span className="text-sm text-stone-400">{historyOpen ? "Einklappen" : "Ausklappen"}</span>
      </button>
      {historyOpen ? (
        <div className="mt-4 space-y-2">
          {history.length > 0 ? (
            history.slice(0, 32).map((visit, index) => (
              <div key={`${visit.createdAt}-${index}`} className={`rounded-2xl border p-3 text-sm ${resultStyles(visit.result)}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{visit.playerName}</p>
                  <p className="text-xs opacity-70">
                    {new Date(visit.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <p className="mt-1 text-xs opacity-85">{visit.note} - {visit.darts.join(", ") || "Ohne Dartdaten"}</p>
                <p className="mt-2 text-xs opacity-90">
                  {`${visit.total} Punkte - ${visit.scoreBefore} -> ${visit.scoreAfter}`}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
              Noch keine Besuche im Raum.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function LiveMatchSummaryPanel({
  liveState,
  playerStats,
  canControlRematch,
  loading,
  onRematch,
}: {
  liveState: LiveMatchState;
  playerStats: LivePlayerStat[];
  canControlRematch: boolean;
  loading: boolean;
  onRematch: () => void;
}) {
  const winnerIndex = liveState.matchWinner ?? 0;
  const winner = liveState.players[winnerIndex];
  const winnerStats = playerStats.find((entry) => entry.name === winner?.name);
  const awards = getPlayerAwards(liveState, playerStats);
  const sortedPlayers = [...liveState.players]
    .filter((player) => player.joined)
    .sort((left, right) => {
      const leftLegWins = liveState.history.filter((entry) => entry.result === "leg-win" && entry.playerName === left.name).length;
      const rightLegWins = liveState.history.filter((entry) => entry.result === "leg-win" && entry.playerName === right.name).length;
      if (right.sets !== left.sets) {
        return right.sets - left.sets;
      }
      if (rightLegWins !== leftLegWins) {
        return rightLegWins - leftLegWins;
      }
      const rightStats = playerStats.find((entry) => entry.name === right.name);
      const leftStats = playerStats.find((entry) => entry.name === left.name);
      return (rightStats?.average ?? 0) - (leftStats?.average ?? 0);
    });

  return (
    <section className="rounded-[1.5rem] border border-emerald-300/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.18),rgba(8,47,73,0.4),rgba(9,9,11,0.95))] p-4 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-100">Match beendet</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{winner?.name ?? "Spieler"} gewinnt das Match</h2>
          <p className="mt-1 text-sm text-stone-200">{liveState.statusText}</p>
          <p className="mt-2 text-sm text-emerald-100">
            {winner?.name ?? "Der Sieger"} bringt {winnerStats?.average.toFixed(1) ?? "0.0"} Average,{" "}
            {winnerStats?.bestVisit ?? 0} als Best Visit und {winnerStats?.checkouts ?? 0} Checkout(s) ins Ziel.
          </p>
        </div>
        <button
          onClick={onRematch}
          disabled={!canControlRematch || loading}
          className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          Rematch starten
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Sieger</p>
          <p className="mt-1 text-lg font-semibold text-white">{winner?.name ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Format</p>
          <p className="mt-1 text-lg font-semibold text-white">
            Best of {liveState.legsToWin} Legs / {liveState.setsToWin} Sets
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Finishes</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {playerStats.reduce((sum, entry) => sum + entry.checkouts, 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Best Visit</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {playerStats.reduce((best, entry) => Math.max(best, entry.bestVisit), 0)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Scoring King</p>
          <p className="mt-1 text-sm font-semibold text-white">{awards.scoringKing?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-amber-50">
            {awards.scoringKing ? `${awards.scoringKing.average.toFixed(1)} Avg` : "Noch keine Daten"}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100">Ice in the Veins</p>
          <p className="mt-1 text-sm font-semibold text-white">{awards.pressureKing?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-emerald-50">
            {awards.pressureKing ? `${awards.pressureKing.checkouts} Checkout(s)` : "Kein Checkout gefallen"}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-sky-100">Moment des Matches</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {awards.bestCheckoutVisit ? `${awards.bestCheckoutVisit.playerName} - ${awards.bestCheckoutVisit.total}` : "-"}
          </p>
          <p className="mt-1 text-xs text-sky-50">
            {awards.bestCheckoutVisit
              ? `${awards.bestCheckoutVisit.darts.join(", ")} als Checkout`
              : awards.maxVisitOwner
                ? `${awards.maxVisitOwner.name} mit ${awards.maxVisit} als Best Visit`
                : "Noch kein Highlight verfuegbar"}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {sortedPlayers.map((player, index) => {
          const stats = playerStats.find((entry) => entry.name === player.name);
          const legWins = liveState.history.filter((entry) => entry.result === "leg-win" && entry.playerName === player.name).length;
          return (
            <div
              key={`${player.name}-${index}`}
              className={`rounded-[1.25rem] border p-3 ${
                winner?.name === player.name ? "border-emerald-300/25 bg-emerald-400/12" : "border-white/10 bg-black/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                      <p className="text-sm font-semibold text-white">
                    #{index + 1} {player.name}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {player.sets} Sets - {legWins} Legs - {stats?.visits ?? 0} Visits
                  </p>
                </div>
                <p className="text-lg font-semibold text-white">{stats?.average.toFixed(1) ?? "0.0"} Avg</p>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <p className="text-stone-400">Best</p>
                  <p className="mt-1 font-semibold text-white">{stats?.bestVisit ?? 0}</p>
                </div>
                <div>
                  <p className="text-stone-400">Checkouts</p>
                  <p className="mt-1 font-semibold text-white">{stats?.checkouts ?? 0}</p>
                </div>
                <div>
                  <p className="text-stone-400">Busts</p>
                  <p className="mt-1 font-semibold text-white">{stats?.busts ?? 0}</p>
                </div>
                <div>
                  <p className="text-stone-400">Punkte</p>
                  <p className="mt-1 font-semibold text-white">{stats?.scoredPoints ?? 0}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
