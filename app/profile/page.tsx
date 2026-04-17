"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type ProfileStats = {
  matchesPlayed: number;
  matchesWon: number;
  totalSetsWon: number;
  totalLegsWon: number;
  bestAverage: number;
  bestVisit: number;
  trainingSessions: number;
  bestTrainingScore: number;
  totalTrainingDarts: number;
  totalTrainingHits: number;
  winRate: number;
  trainingHitRate: number;
};

type RecentTrainingEntry = {
  score: number;
  darts_thrown: number;
  hits: number;
  played_at: string;
};

type RecentMatchEntry = {
  id: string;
  played_at: string;
  mode: string;
  double_out: boolean;
  winner: string;
  opponents: string;
  sets: string;
  did_win: boolean;
  player_average: number;
  player_best_visit: number;
  player_legs: number;
};

type ProfileResponse = {
  profile: {
    display_name: string;
    username: string | null;
    created_at: string;
  };
  stats: ProfileStats;
  recentTraining: RecentTrainingEntry[];
  recentMatches: RecentMatchEntry[];
  insights: {
    favoriteMode: string;
    matchesLast30Days: number;
    trainingLast30Days: number;
    recentTrainingAverageScore: number;
    currentWinStreak: number;
    bestWinStreak: number;
    recentForm: Array<"W" | "L">;
    consistencyScore: number;
    pressureScore: number;
    highlightTitle: string;
    highlightReason: string;
  };
};

function formatOutLabel(doubleOut: boolean, mode: string) {
  if (mode.toLowerCase().includes("master")) {
    return "Masters Out";
  }

  return doubleOut ? "Double Out" : "Single Out";
}

function scoreTone(value: number) {
  if (value >= 75) {
    return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  }

  if (value >= 55) {
    return "border-amber-300/25 bg-amber-300/12 text-amber-100";
  }

  return "border-white/10 bg-black/20 text-stone-200";
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${tone ?? "border-white/10 bg-black/20"}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function MeterCard({
  label,
  value,
  hint,
  colorClass,
}: {
  label: string;
  value: number;
  hint: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">{label}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(8, value)}%` }} />
      </div>
      <p className="mt-2 text-xs text-stone-400">{hint}</p>
    </div>
  );
}

export default function ProfilePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;

    void client.auth.getSession().then(async ({ data: sessionData }) => {
      setSession(sessionData.session);
      if (!sessionData.session) {
        setLoading(false);
        return;
      }

      const {
        data: { session: freshSession },
      } = await client.auth.getSession();

      const accessToken = freshSession?.access_token ?? sessionData.session.access_token;
      if (!accessToken) {
        setMessage("Kein gueltiger Cloud-Token gefunden.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/cloud/dashboard", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const result = (await response.json()) as ProfileResponse | { error: string };

      if (!response.ok || !("profile" in result)) {
        setMessage("Profil konnte nicht geladen werden.");
        setLoading(false);
        return;
      }

      setData(result);
      setLoading(false);
    });
  }, []);

  const profileSummary = useMemo(() => {
    if (!data) {
      return {
        playerArchetype: "Noch in der Einspielphase",
        momentumText: "",
        trendText: "",
      };
    }

    const { stats, insights } = data;
    const playerArchetype =
      stats.winRate >= 65
        ? "Checkout-Killer"
        : stats.trainingHitRate >= 55
          ? "Trainingsmaschine"
          : stats.bestAverage >= 60
            ? "Scoring-Motor"
            : "Konstanter Leg-Jaeger";
    const momentumText = `${stats.matchesWon} Siege · ${stats.totalLegsWon} Legs · ${stats.trainingSessions} Trainings`;
    const trendText =
      insights.currentWinStreak > 1
        ? `${insights.currentWinStreak} Siege in Serie`
        : insights.matchesLast30Days > 0
          ? `${insights.matchesLast30Days} Matches in den letzten 30 Tagen`
          : "Neue Matchserie aufbauen";

    return {
      playerArchetype,
      momentumText,
      trendText,
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-3 py-4 text-stone-100 sm:px-4 sm:py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Player Profile</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Langzeitstatistiken</h1>
          </div>
          <Link href="/" className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold">
            Zurueck
          </Link>
        </div>

        {!supabaseEnabled ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
            Supabase ist noch nicht konfiguriert.
          </section>
        ) : !session ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
            Bitte zuerst in der Haupt-App einloggen.
          </section>
        ) : loading ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
            Profil wird geladen...
          </section>
        ) : !data ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-amber-200">
            {message || "Profil konnte nicht geladen werden."}
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,rgba(245,158,11,0.16),rgba(16,185,129,0.14),rgba(15,23,42,0.78))] p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-stone-200">Spielerkarte</p>
                    <h2 className="mt-2 text-3xl font-semibold text-white">{data.profile.display_name}</h2>
                    <p className="mt-1 text-sm text-stone-300">{session.user.email}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Mitglied seit</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {new Date(data.profile.created_at).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                      {data.insights.highlightTitle}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
                      {profileSummary.playerArchetype}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white">{data.insights.highlightReason}</p>
                  <p className="mt-1 text-sm text-stone-300">{profileSummary.momentumText}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-400">{profileSummary.trendText}</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatPill label="Winrate" value={`${data.stats.winRate.toFixed(1)}%`} tone="border-emerald-300/25 bg-emerald-400/12" />
                  <StatPill label="Best Avg" value={data.stats.bestAverage.toFixed(2)} tone="border-sky-300/25 bg-sky-400/12" />
                  <StatPill label="Best Visit" value={String(data.stats.bestVisit)} tone="border-amber-300/25 bg-amber-300/12" />
                  <StatPill label="Trefferquote" value={`${data.stats.trainingHitRate.toFixed(1)}%`} tone="border-fuchsia-300/25 bg-fuchsia-400/12" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Karriere kompakt</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatPill label="Matches" value={String(data.stats.matchesPlayed)} />
                    <StatPill label="Siege" value={String(data.stats.matchesWon)} />
                    <StatPill label="Sets" value={String(data.stats.totalSetsWon)} />
                    <StatPill label="Legs" value={String(data.stats.totalLegsWon)} />
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Aktivitaet</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatPill label="30 Tage Match" value={String(data.insights.matchesLast30Days)} />
                    <StatPill label="30 Tage Training" value={String(data.insights.trainingLast30Days)} />
                    <StatPill label="Lieblingsmodus" value={data.insights.favoriteMode} />
                    <StatPill label="Trainingsschnitt" value={data.insights.recentTrainingAverageScore.toFixed(1)} />
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Formkurve</p>
                    <p className="text-xs text-stone-400">letzte {data.insights.recentForm.length || 0} Matches</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.insights.recentForm.length > 0 ? (
                      data.insights.recentForm.map((entry, index) => (
                        <div
                          key={`${entry}-${index}`}
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-semibold ${
                            entry === "W"
                              ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                              : "border-rose-300/25 bg-rose-400/12 text-rose-100"
                          }`}
                        >
                          {entry}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-400">
                        Noch keine Match-Serie in der Cloud.
                      </div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatPill
                      label="Aktuelle Serie"
                      value={
                        data.insights.currentWinStreak > 0 ? `${data.insights.currentWinStreak} Siege` : "Neu starten"
                      }
                      tone={scoreTone(data.insights.currentWinStreak > 0 ? 80 : 30)}
                    />
                    <StatPill
                      label="Beste Serie"
                      value={
                        data.insights.bestWinStreak > 0 ? `${data.insights.bestWinStreak} Siege` : "Noch offen"
                      }
                      tone={scoreTone(data.insights.bestWinStreak > 1 ? 78 : 48)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <h2 className="text-lg font-semibold text-white">Spielprofil</h2>
                  <div className="mt-3 grid gap-3">
                    <MeterCard
                      label="Konstanz"
                      value={data.insights.consistencyScore}
                      hint="Mix aus Winrate, Trainingstreffern und Average."
                      colorClass="bg-emerald-400"
                    />
                    <MeterCard
                      label="Druckmoment"
                      value={data.insights.pressureScore}
                      hint="Wie stark deine Top-Visits und dein Peak-Average wirken."
                      colorClass="bg-amber-300"
                    />
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <h2 className="text-lg font-semibold text-white">Trainingsform</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatPill label="Sessions" value={String(data.stats.trainingSessions)} />
                    <StatPill label="Best Score" value={String(data.stats.bestTrainingScore)} />
                    <StatPill label="Darts" value={String(data.stats.totalTrainingDarts)} />
                    <StatPill label="Treffer" value={String(data.stats.totalTrainingHits)} />
                  </div>
                  <div className="mt-3 space-y-2">
                    {data.recentTraining.length > 0 ? (
                      data.recentTraining.map((entry, index) => (
                        <div
                          key={`${entry.played_at}-${index}`}
                          className="rounded-2xl border border-white/10 bg-black/20 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">Score {entry.score}</p>
                              <p className="text-xs text-stone-400">
                                Treffer {entry.hits} · Darts {entry.darts_thrown}
                              </p>
                            </div>
                            <p className="text-[11px] text-stone-400">
                              {new Date(entry.played_at).toLocaleDateString("de-DE")}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-stone-400">
                        Noch keine Trainingssessions in der Cloud.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <h2 className="text-lg font-semibold text-white">Letzte Matches</h2>
                <div className="mt-3 space-y-2">
                  {data.recentMatches.length > 0 ? (
                    data.recentMatches.map((match) => (
                      <div key={match.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                  match.did_win
                                    ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                                    : "border-rose-300/25 bg-rose-400/12 text-rose-100"
                                }`}
                              >
                                {match.did_win ? "Sieg" : "Niederlage"}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
                                {match.mode}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-white">{match.winner} gewinnt</p>
                            <p className="text-xs text-stone-400">gegen {match.opponents}</p>
                          </div>
                          <p className="text-[11px] text-stone-400">
                            {new Date(match.played_at).toLocaleDateString("de-DE")}
                          </p>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <StatPill label="Avg" value={match.player_average.toFixed(2)} />
                          <StatPill label="Best Visit" value={String(match.player_best_visit)} />
                          <StatPill label="Legs" value={String(match.player_legs)} />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-300">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                            {formatOutLabel(match.double_out, match.mode)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{match.sets}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-stone-400">
                      Noch keine Cloud-Matches.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
