"use client";

import Link from "next/link";
import {
  LineChart,
  MatchArchiveCard,
  SimpleBarChart,
  StatPill,
  scoreTone,
  toneClasses,
} from "@/components/profile/shared";

type AnalyticsShape = {
  filteredMatches: Array<{
    id: string;
    played_at: string;
    mode: string;
    winner: string;
    opponents: string;
    did_win: boolean;
  }>;
  filteredTraining: Array<unknown>;
  monthlyMatches: Array<{ period: string; matches: number; wins: number; average: number }>;
  monthlyTraining: Array<{ period: string; sessions: number; averageScore: number }>;
  modeBreakdown: Array<{ mode: string; matches: number; wins: number; average: number; bestVisit: number }>;
  visitBuckets: Array<{ label: string; count: number }>;
  weeklyActivity: Array<{ period: string; matches: number; training: number }>;
  opponentBreakdown: Array<{
    name: string;
    profileId?: string | null;
    matches: number;
    wins: number;
    winRate: number;
    average: number;
    bestVisit: number;
    lastPlayed: string;
  }>;
  averageTrend: Array<{ period: string; average: number }>;
  bestVisitTrend: Array<{ period: string; bestVisit: number }>;
  filteredWinRate: number;
  filteredAverage: number;
  filteredBestVisit: number;
  filteredTrainingScore: number;
  badges: string[];
  achievements: Array<{
    key: string;
    title: string;
    description: string;
    unlocked: boolean;
    progress: number;
    target: number;
    unit: string;
    tone: string;
  }>;
  checkoutInsights: {
    total: number;
    bestCheckout: number;
    averageCheckout: number;
    favoriteRoute: string;
    favoriteFinish: string;
    byRange: Array<{ label: string; count: number }>;
    recent: Array<{ route: string; total: number; finishLabel: string; playedAt: string }>;
  };
  rivalryInsights: {
    closest: Array<{ name: string; matches: number; winRate: number; legDiff: number; lastPlayed: string }>;
    toughest: Array<{ name: string; matches: number; winRate: number; legDiff: number; lastPlayed: string }>;
    bestMatchups: Array<{ name: string; matches: number; winRate: number; legDiff: number; lastPlayed: string }>;
  };
  throwPatternTimeline: Array<{
    period: string;
    triples: number;
    doubles: number;
    bulls: number;
    checkouts: number;
    misses: number;
  }>;
};

type SeasonEntry = {
  profileId: string;
  name: string;
  matches: number;
  wins: number;
  winRate: number;
  average: number;
  bestVisit: number;
  isCurrentUser: boolean;
};

type SeasonMetric = "wins" | "winRate" | "average";
type SeasonWindow = "year" | "month" | "last30";

export function ProfileAnalyticsPanel({
  analytics,
  analyticsWindow,
  modeFilter,
  onAnalyticsWindowChange,
  onModeFilterChange,
}: {
  analytics: AnalyticsShape;
  analyticsWindow: "30" | "90" | "all";
  modeFilter: "all" | "301" | "501";
  onAnalyticsWindowChange: (value: "30" | "90" | "all") => void;
  onModeFilterChange: (value: "all" | "301" | "501") => void;
}) {
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4" open>
      <summary className="cursor-pointer list-none text-lg font-semibold text-white">Analyse-Dropdown</summary>
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatPill label="Winrate im Filter" value={`${analytics.filteredWinRate.toFixed(1)}%`} tone={scoreTone(analytics.filteredWinRate)} />
          <StatPill label="Average im Filter" value={analytics.filteredAverage.toFixed(1)} tone={scoreTone(analytics.filteredAverage)} />
          <StatPill label="Best Visit" value={String(analytics.filteredBestVisit)} tone={scoreTone(Math.min(100, analytics.filteredBestVisit / 1.8))} />
          <StatPill label="Trainingsscore" value={analytics.filteredTrainingScore.toFixed(1)} tone={scoreTone(analytics.filteredTrainingScore / 1.2)} />
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ["30", "30 Tage"],
            ["90", "90 Tage"],
            ["all", "Alle Daten"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => onAnalyticsWindowChange(value)}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                analyticsWindow === value ? "bg-emerald-400 text-black" : "border border-white/10 bg-black/20 text-white"
              }`}
            >
              {label}
            </button>
          ))}
          {([
            ["all", "Alle Modi"],
            ["301", "301"],
            ["501", "501"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => onModeFilterChange(value)}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                modeFilter === value ? "bg-amber-300 text-black" : "border border-white/10 bg-black/20 text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Match-Verlauf</h3>
              <p className="text-xs text-stone-400">{analytics.filteredMatches.length} Matches</p>
            </div>
            {analytics.monthlyMatches.length > 0 ? (
              <div className="mt-4">
                <SimpleBarChart data={analytics.monthlyMatches} valueKey="matches" colorClass="bg-emerald-400" />
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-400">Keine Match-Daten im Filter.</p>
            )}
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Training-Verlauf</h3>
              <p className="text-xs text-stone-400">{analytics.filteredTraining.length} Sessions</p>
            </div>
            {analytics.monthlyTraining.length > 0 ? (
              <div className="mt-4">
                <SimpleBarChart data={analytics.monthlyTraining} valueKey="sessions" colorClass="bg-amber-300" />
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-400">Keine Trainingsdaten im Filter.</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Scoring-Profil</h3>
              <p className="text-xs text-stone-400">Visit-Klassen</p>
            </div>
            {analytics.visitBuckets.length > 0 ? (
              <div className="mt-4">
                <SimpleBarChart data={analytics.visitBuckets} valueKey="count" colorClass="bg-fuchsia-400" />
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-400">Noch keine Visit-Daten in der Cloud.</p>
            )}
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Wochenaktivität</h3>
              <p className="text-xs text-stone-400">Matches und Training</p>
            </div>
            <div className="mt-4">
              <LineChart data={analytics.weeklyActivity} valueKey="matches" stroke="#34d399" />
            </div>
            <div className="mt-4">
              <LineChart data={analytics.weeklyActivity} valueKey="training" stroke="#fbbf24" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Modi im Vergleich</h3>
            <div className="mt-3 space-y-2">
              {analytics.modeBreakdown.length > 0 ? (
                analytics.modeBreakdown.map((entry) => (
                  <div key={entry.mode} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{entry.mode}</p>
                      <p className="text-sm text-stone-300">{entry.matches} Matches</p>
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      {entry.wins} Siege · Avg {entry.average.toFixed(1)} · Best Visit {entry.bestVisit}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-400">Keine Modus-Daten im Filter.</p>
              )}
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Gegnerbilanz</h3>
            <div className="mt-3 space-y-2">
              {analytics.opponentBreakdown.length > 0 ? (
                analytics.opponentBreakdown.map((entry) => (
                  <div key={`${entry.profileId ?? "guest"}-${entry.name}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{entry.name}</p>
                      <Link
                        href={`/profile/opponents/${encodeURIComponent(entry.profileId ?? entry.name)}`}
                        className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-2.5 py-1 text-xs font-semibold text-emerald-100"
                      >
                        Duell
                      </Link>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-stone-400">
                      <p>Winrate {entry.winRate.toFixed(1)}%</p>
                      <p>{entry.wins} Siege aus {entry.matches} Matches</p>
                      <p>Average {entry.average.toFixed(1)}</p>
                      <p>Best Visit {entry.bestVisit}</p>
                      <p>Zuletzt {new Date(entry.lastPlayed).toLocaleDateString("de-DE")}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-400">Keine Gegnerdaten im Filter.</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Average-Trend</h3>
              <p className="text-xs text-stone-400">monatlich</p>
            </div>
            <div className="mt-4">
              <LineChart data={analytics.averageTrend} valueKey="average" stroke="#34d399" />
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Best-Visit-Trend</h3>
              <p className="text-xs text-stone-400">monatlich</p>
            </div>
            <div className="mt-4">
              <LineChart data={analytics.bestVisitTrend} valueKey="bestVisit" stroke="#fbbf24" />
            </div>
          </div>
        </div>

      </div>
    </details>
  );
}

export function ProfileMatchArchiveSection({
  matches,
}: {
  matches: AnalyticsShape["filteredMatches"];
}) {
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <summary className="cursor-pointer list-none text-lg font-semibold text-white">Match-Archiv</summary>
      <div className="mt-4 space-y-2">
        {matches.length > 0 ? (
          matches.slice(0, 18).map((match) => <MatchArchiveCard key={`archive-${match.id}`} match={match} />)
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Keine Matches im aktuellen Filter.
          </div>
        )}
      </div>
    </details>
  );
}

export function ProfileSeasonLeaderboardSection({
  seasonWindow,
  seasonMetric,
  onSeasonWindowChange,
  onSeasonMetricChange,
  seasonBoard,
}: {
  seasonWindow: SeasonWindow;
  seasonMetric: SeasonMetric;
  onSeasonWindowChange: (value: SeasonWindow) => void;
  onSeasonMetricChange: (value: SeasonMetric) => void;
  seasonBoard: SeasonEntry[];
}) {
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <summary className="cursor-pointer list-none text-lg font-semibold text-white">Saison-Ranglisten</summary>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {([
            ["year", "Dieses Jahr"],
            ["month", "Dieser Monat"],
            ["last30", "Letzte 30 Tage"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => onSeasonWindowChange(value)}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                seasonWindow === value ? "bg-fuchsia-400 text-black" : "border border-white/10 bg-black/20 text-white"
              }`}
            >
              {label}
            </button>
          ))}
          {([
            ["wins", "Siege"],
            ["winRate", "Winrate"],
            ["average", "Average"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => onSeasonMetricChange(value)}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                seasonMetric === value ? "bg-emerald-400 text-black" : "border border-white/10 bg-black/20 text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          {seasonBoard.length > 0 ? (
            seasonBoard.map((entry, index) => (
              <div
                key={`${entry.profileId}-${seasonMetric}`}
                className={`rounded-[1.25rem] border p-3 ${
                  entry.isCurrentUser ? "border-emerald-300/25 bg-emerald-400/12" : "border-white/10 bg-black/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      #{index + 1} {entry.name}
                    </p>
                    <p className="text-xs text-stone-400">
                      {entry.matches} Matches · {entry.wins} Siege · Best Visit {entry.bestVisit}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-white">
                    {seasonMetric === "wins"
                      ? entry.wins
                      : seasonMetric === "winRate"
                        ? `${entry.winRate.toFixed(1)}%`
                        : entry.average.toFixed(1)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
              Für dieses Zeitfenster gibt es noch nicht genug Daten.
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

export function ProfileRecordsSection({
  records,
}: {
  records: {
    weekly: { matches: number; wins: number; bestAverage: number; bestVisit: number; bestTrainingScore: number; topVisitScore: number };
    monthly: { matches: number; wins: number; bestAverage: number; bestVisit: number; bestTrainingScore: number; topVisitScore: number };
    lifetime: { matches: number; wins: number; bestAverage: number; bestVisit: number; bestTrainingScore: number; topVisitScore: number };
  };
}) {
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <summary className="cursor-pointer list-none text-lg font-semibold text-white">Rekorde & Spitzenwerte</summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {([
          ["Woche", records.weekly],
          ["30 Tage", records.monthly],
          ["Karriere", records.lifetime],
        ] as const).map(([label, record]) => (
          <div key={label} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">{label}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatPill label="Matches" value={String(record.matches)} />
              <StatPill label="Siege" value={String(record.wins)} />
              <StatPill label="Best Avg" value={record.bestAverage.toFixed(1)} />
              <StatPill label="Best Visit" value={String(record.bestVisit)} />
              <StatPill label="Training" value={String(record.bestTrainingScore)} />
              <StatPill label="Top Visit" value={String(record.topVisitScore)} />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

export function ProfileAchievementsSection({
  badges,
  achievements,
}: {
  badges: string[];
  achievements: AnalyticsShape["achievements"];
}) {
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <summary className="cursor-pointer list-none text-lg font-semibold text-white">Badges & Meilensteine</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {badges.length > 0 ? (
          badges.map((badge) => (
            <div key={badge} className="rounded-[1.25rem] border border-amber-300/25 bg-amber-300/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Freigeschaltet</p>
              <p className="mt-2 text-lg font-semibold text-white">{badge}</p>
            </div>
          ))
        ) : (
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Noch keine Badges freigeschaltet.
          </div>
        )}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {achievements.map((achievement) => {
          const tone = toneClasses(achievement.tone);
          const progressWidth = achievement.target > 0 ? Math.max(6, (achievement.progress / achievement.target) * 100) : 0;
          return (
            <div key={achievement.key} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">{achievement.title}</p>
                  <p className="mt-1 text-sm text-stone-400">{achievement.description}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.badge}`}>
                  {achievement.unlocked ? "Frei" : `${achievement.progress}/${achievement.target}`}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, progressWidth)}%` }} />
              </div>
              <p className="mt-2 text-xs text-stone-400">
                Fortschritt: {achievement.progress} / {achievement.target} {achievement.unit}
              </p>
            </div>
          );
        })}
      </div>
    </details>
  );
}

export function ProfileDeepInsightsSection({
  analytics,
}: {
  analytics: AnalyticsShape;
}) {
  const rivalryBlocks = [
    { label: "Engste Duelle", entries: analytics.rivalryInsights.closest, tone: "border-sky-300/25 bg-sky-400/10" },
    { label: "Härteste Gegner", entries: analytics.rivalryInsights.toughest, tone: "border-rose-300/25 bg-rose-400/10" },
    { label: "Lieblingsduelle", entries: analytics.rivalryInsights.bestMatchups, tone: "border-emerald-300/25 bg-emerald-400/10" },
  ] as const;

  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <summary className="cursor-pointer list-none text-lg font-semibold text-white">Checkout- und Rivalitätsdaten</summary>
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatPill label="Checkouts" value={String(analytics.checkoutInsights.total)} tone="border-emerald-300/25 bg-emerald-400/12" />
          <StatPill label="Bestes Finish" value={String(analytics.checkoutInsights.bestCheckout)} tone="border-amber-300/25 bg-amber-300/12" />
          <StatPill label="Checkout-Schnitt" value={analytics.checkoutInsights.averageCheckout.toFixed(1)} tone="border-sky-300/25 bg-sky-400/12" />
          <StatPill label="Lieblings-Finish" value={analytics.checkoutInsights.favoriteFinish} tone="border-fuchsia-300/25 bg-fuchsia-400/12" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Checkout-Bereiche</h3>
              <p className="text-xs text-stone-400">{analytics.checkoutInsights.favoriteRoute}</p>
            </div>
            <div className="mt-4">
              <SimpleBarChart data={analytics.checkoutInsights.byRange} valueKey="count" colorClass="bg-emerald-400" />
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Letzte Checkouts</h3>
            <div className="mt-3 space-y-2">
              {analytics.checkoutInsights.recent.length > 0 ? (
                analytics.checkoutInsights.recent.map((entry) => (
                  <div key={`${entry.playedAt}-${entry.route}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{entry.route}</p>
                        <p className="mt-1 text-xs text-stone-400">
                          {entry.total} Punkte · Finish auf {entry.finishLabel}
                        </p>
                      </div>
                      <p className="text-[11px] text-stone-400">
                        {new Date(entry.playedAt).toLocaleDateString("de-DE")}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-400">Noch keine Checkout-Routen in der Cloud.</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {rivalryBlocks.map((block) => (
            <div key={block.label} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
              <h3 className="text-sm font-semibold text-white">{block.label}</h3>
              <div className="mt-3 space-y-2">
                {block.entries.length > 0 ? (
                  block.entries.map((entry) => (
                    <div key={`${block.label}-${entry.name}`} className={`rounded-2xl border p-3 ${block.tone}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{entry.name}</p>
                          <p className="mt-1 text-xs text-stone-200">
                            {entry.matches} Matches · Winrate {entry.winRate.toFixed(1)}%
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {entry.legDiff > 0 ? "+" : ""}{entry.legDiff} Legs
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-400">Noch nicht genug direkte Duelle.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Triple- und Double-Trend</h3>
              <p className="text-xs text-stone-400">monatlich</p>
            </div>
            <div className="mt-4">
              <LineChart data={analytics.throwPatternTimeline} valueKey="triples" stroke="#34d399" />
            </div>
            <div className="mt-4">
              <LineChart data={analytics.throwPatternTimeline} valueKey="doubles" stroke="#fbbf24" />
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Bulls, Checkouts und Misses</h3>
              <p className="text-xs text-stone-400">monatlich</p>
            </div>
            <div className="mt-4">
              <SimpleBarChart data={analytics.throwPatternTimeline} valueKey="bulls" colorClass="bg-rose-400" />
            </div>
            <div className="mt-4">
              <SimpleBarChart data={analytics.throwPatternTimeline} valueKey="checkouts" colorClass="bg-emerald-400" />
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
