"use client";

export type PlayerPresenceSummary = {
  id: string;
  displayName: string;
  lastSeenAt: string;
  isActive: boolean;
  stats: {
    matchesPlayed: number;
    matchesWon: number;
    matchesLost: number;
    trainingSessions: number;
    bestAverage: number;
    bestVisit: number;
  };
  rivalry: {
    matchesPlayed: number;
    matchesWon: number;
    matchesLost: number;
  };
};

export type SharedMatchSummary = {
  playedAt: string;
  winner: string;
  opponents: string;
  modeLabel: string;
  scoreLine: string;
};

export function PlayerRivalryDialog({
  viewerName,
  selectedPlayer,
  recentSharedMatch,
  onClose,
}: {
  viewerName: string;
  selectedPlayer: PlayerPresenceSummary | null;
  recentSharedMatch?: SharedMatchSummary | null;
  onClose: () => void;
}) {
  if (!selectedPlayer) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/65 px-3 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-8">
      <div className="mx-auto w-full max-w-2xl rounded-[1.75rem] border border-white/10 bg-[#0f172a] p-4 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold text-white">{selectedPlayer.displayName}</h2>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  selectedPlayer.isActive ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]" : "bg-stone-600"
                }`}
              />
            </div>
            <p className="mt-1 text-sm text-stone-400">Spielerprofil und direkte Rivalitaet</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white"
          >
            Schliessen
          </button>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            {viewerName} vs. {selectedPlayer.displayName}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-stone-400">Matches</p>
              <p className="mt-1 text-2xl font-semibold text-white">{selectedPlayer.rivalry.matchesPlayed}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-stone-400">Win/Lose</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {selectedPlayer.rivalry.matchesWon}/{selectedPlayer.rivalry.matchesLost}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-stone-400">KD</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {selectedPlayer.rivalry.matchesPlayed > 0
                  ? `${Math.round((selectedPlayer.rivalry.matchesWon / selectedPlayer.rivalry.matchesPlayed) * 100)}%`
                  : "0%"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-stone-400">Matches/Wins/Loses</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {selectedPlayer.stats.matchesPlayed}/{selectedPlayer.stats.matchesWon}/{selectedPlayer.stats.matchesLost}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-stone-400">Trainings</p>
            <p className="mt-1 text-2xl font-semibold text-white">{selectedPlayer.stats.trainingSessions}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-stone-400">Best Avg</p>
            <p className="mt-1 text-2xl font-semibold text-white">{selectedPlayer.stats.bestAverage.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-stone-400">Best Visit</p>
            <p className="mt-1 text-2xl font-semibold text-white">{selectedPlayer.stats.bestVisit}</p>
          </div>
        </div>

        {recentSharedMatch ? (
          <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Letztes gemeinsames Match</p>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold text-white">
                {recentSharedMatch.modeLabel} | {recentSharedMatch.scoreLine}
              </p>
              <p className="text-sm text-stone-300">
                Sieger: {recentSharedMatch.winner} | Gegner: {recentSharedMatch.opponents}
              </p>
              <p className="text-xs text-stone-500">{recentSharedMatch.playedAt}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
