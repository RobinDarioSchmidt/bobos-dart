"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MobileAppNav } from "@/components/mobile-app-nav";
import {
  HeatmapBoard,
  MeterCard,
  StatPill,
  scoreTone,
} from "@/components/profile/shared";
import {
  ProfileAchievementsSection,
  ProfileAnalyticsPanel,
  ProfileDeepInsightsSection,
  ProfileMatchArchiveSection,
  ProfileRecordsSection,
  ProfileSeasonLeaderboardSection,
} from "@/components/profile/sections";
import { formatOutLabel } from "@/lib/darts-display";
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
  mode?: string;
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
  trainingHistory: RecentTrainingEntry[];
  recentMatches: RecentMatchEntry[];
  matchHistory: RecentMatchEntry[];
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
    throwStats: {
      totalThrows: number;
      boardThrows: number;
      bullsHit: number;
      doublesHit: number;
      triplesHit: number;
      misses: number;
      checkoutsHit: number;
      favoriteSegment: string;
      favoriteDouble: string;
    };
    favoriteSegments: Array<{
      label: string;
      count: number;
    }>;
    favoriteDoubles: Array<{
      label: string;
      count: number;
    }>;
    heatmap: {
      numbers: Record<string, number>;
      max: number;
    };
    monthlyMatches: Array<{
      period: string;
      matches: number;
      wins: number;
      average: number;
    }>;
    monthlyTraining: Array<{
      period: string;
      sessions: number;
      averageScore: number;
    }>;
    modeBreakdown: Array<{
      mode: string;
      matches: number;
      wins: number;
    }>;
    opponentBreakdown: Array<{
      name: string;
      matches: number;
      wins: number;
      winRate: number;
      average: number;
      bestVisit: number;
      legsFor: number;
      legsAgainst: number;
      lastPlayed: string;
    }>;
    records: {
      weekly: {
        matches: number;
        wins: number;
        bestAverage: number;
        bestVisit: number;
        bestTrainingScore: number;
        topVisitScore: number;
      };
      monthly: {
        matches: number;
        wins: number;
        bestAverage: number;
        bestVisit: number;
        bestTrainingScore: number;
        topVisitScore: number;
      };
      lifetime: {
        matches: number;
        wins: number;
        bestAverage: number;
        bestVisit: number;
        bestTrainingScore: number;
        topVisitScore: number;
      };
    };
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
    seasonalLeaderboards: {
      year: ProfileLeaderboardCategory;
      month: ProfileLeaderboardCategory;
      last30: ProfileLeaderboardCategory;
    };
  };
};

type ProfileLeaderboardEntry = {
  profileId: string;
  name: string;
  matches: number;
  wins: number;
  winRate: number;
  average: number;
  bestVisit: number;
  isCurrentUser: boolean;
};

type ProfileLeaderboardCategory = {
  wins: ProfileLeaderboardEntry[];
  winRate: ProfileLeaderboardEntry[];
  average: ProfileLeaderboardEntry[];
};

type AnalyticsWindow = "30" | "90" | "all";
type SeasonWindow = "year" | "month" | "last30";
type SeasonMetric = "wins" | "winRate" | "average";

export default function ProfilePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [analyticsNow] = useState(() => Date.now());
  const [analyticsWindow, setAnalyticsWindow] = useState<AnalyticsWindow>("90");
  const [modeFilter, setModeFilter] = useState<"all" | "301" | "501">("all");
  const [seasonWindow, setSeasonWindow] = useState<SeasonWindow>("year");
  const [seasonMetric, setSeasonMetric] = useState<SeasonMetric>("wins");

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
    const momentumText = `${stats.matchesWon} Siege - ${stats.totalLegsWon} Legs - ${stats.trainingSessions} Trainings`;
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

  const analytics = useMemo(() => {
    if (!data) {
      return {
        filteredMatches: [] as RecentMatchEntry[],
        filteredTraining: [] as RecentTrainingEntry[],
        monthlyMatches: [] as Array<{ period: string; matches: number; wins: number; average: number }>,
        monthlyTraining: [] as Array<{ period: string; sessions: number; averageScore: number }>,
        modeBreakdown: [] as Array<{ mode: string; matches: number; wins: number }>,
        opponentBreakdown: [] as Array<{
          name: string;
          matches: number;
          wins: number;
          winRate: number;
          average: number;
          bestVisit: number;
          legsFor: number;
          legsAgainst: number;
          lastPlayed: string;
        }>,
        averageTrend: [] as Array<{ period: string; average: number }>,
        bestVisitTrend: [] as Array<{ period: string; bestVisit: number }>,
        filteredWinRate: 0,
        filteredAverage: 0,
        filteredBestVisit: 0,
        filteredTrainingScore: 0,
        badges: [] as string[],
        achievements: [] as ProfileResponse["insights"]["achievements"],
        checkoutInsights: {
          total: 0,
          bestCheckout: 0,
          averageCheckout: 0,
          favoriteRoute: "Noch kein Checkout",
          favoriteFinish: "Noch offen",
          byRange: [],
          recent: [],
        },
        rivalryInsights: {
          closest: [],
          toughest: [],
          bestMatchups: [],
        },
        throwPatternTimeline: [],
      };
    }

    const days = analyticsWindow === "30" ? 30 : analyticsWindow === "90" ? 90 : null;
    const cutoff = days ? analyticsNow - days * 24 * 60 * 60 * 1000 : null;
    const filteredMatches = data.matchHistory.filter((match) => {
      const timeOk = cutoff ? new Date(match.played_at).getTime() >= cutoff : true;
      const modeOk = modeFilter === "all" ? true : match.mode === modeFilter;
      return timeOk && modeOk;
    });
    const filteredTraining = data.trainingHistory.filter((entry) => (cutoff ? new Date(entry.played_at).getTime() >= cutoff : true));

    const monthlyMatches = Object.values(
      filteredMatches.reduce<Record<string, { period: string; matches: number; wins: number; average: number; count: number }>>(
        (acc, match) => {
          const period = new Date(match.played_at).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
          if (!acc[period]) {
            acc[period] = { period, matches: 0, wins: 0, average: 0, count: 0 };
          }
          acc[period].matches += 1;
          acc[period].wins += match.did_win ? 1 : 0;
          if (match.player_average > 0) {
            acc[period].average += match.player_average;
            acc[period].count += 1;
          }
          return acc;
        },
        {},
      ),
    ).map((entry) => ({
      period: entry.period,
      matches: entry.matches,
      wins: entry.wins,
      average: entry.count > 0 ? Number((entry.average / entry.count).toFixed(1)) : 0,
    }));

    const monthlyTraining = Object.values(
      filteredTraining.reduce<Record<string, { period: string; sessions: number; totalScore: number }>>((acc, training) => {
        const period = new Date(training.played_at).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
        if (!acc[period]) {
          acc[period] = { period, sessions: 0, totalScore: 0 };
        }
        acc[period].sessions += 1;
        acc[period].totalScore += training.score;
        return acc;
      }, {}),
    ).map((entry) => ({
      period: entry.period,
      sessions: entry.sessions,
      averageScore: entry.sessions > 0 ? Number((entry.totalScore / entry.sessions).toFixed(1)) : 0,
    }));

    const modeBreakdown = Object.values(
      filteredMatches.reduce<Record<string, { mode: string; matches: number; wins: number }>>((acc, match) => {
        if (!acc[match.mode]) {
          acc[match.mode] = { mode: match.mode, matches: 0, wins: 0 };
        }
        acc[match.mode].matches += 1;
        acc[match.mode].wins += match.did_win ? 1 : 0;
        return acc;
      }, {}),
    );

    const opponentBreakdown = Object.entries(
      filteredMatches.reduce<Record<string, { matches: number; wins: number; averageTotal: number; averageCount: number; bestVisit: number; legsFor: number; legsAgainst: number; lastPlayed: string }>>((acc, match) => {
        const names = match.opponents
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        for (const name of names) {
          if (!acc[name]) {
            acc[name] = {
              matches: 0,
              wins: 0,
              averageTotal: 0,
              averageCount: 0,
              bestVisit: 0,
              legsFor: 0,
              legsAgainst: 0,
              lastPlayed: match.played_at,
            };
          }
          acc[name].matches += 1;
          acc[name].wins += match.did_win ? 1 : 0;
          acc[name].bestVisit = Math.max(acc[name].bestVisit, match.player_best_visit);
          acc[name].legsFor += match.player_legs;
          if (match.player_average > 0) {
            acc[name].averageTotal += match.player_average;
            acc[name].averageCount += 1;
          }
          if (new Date(match.played_at).getTime() > new Date(acc[name].lastPlayed).getTime()) {
            acc[name].lastPlayed = match.played_at;
          }
        }
        return acc;
      }, {}),
    )
      .map(([name, values]) => ({
        name,
        matches: values.matches,
        wins: values.wins,
        winRate: values.matches > 0 ? Number(((values.wins / values.matches) * 100).toFixed(1)) : 0,
        average: values.averageCount > 0 ? Number((values.averageTotal / values.averageCount).toFixed(1)) : 0,
        bestVisit: values.bestVisit,
        legsFor: values.legsFor,
        legsAgainst: values.legsAgainst,
        lastPlayed: values.lastPlayed,
      }))
      .sort((left, right) => right.matches - left.matches)
      .slice(0, 8);

    const averageTrend = monthlyMatches.map((entry) => ({
      period: entry.period,
      average: entry.average,
    }));
    const bestVisitTrend = Object.values(
      filteredMatches.reduce<Record<string, { period: string; bestVisit: number }>>((acc, match) => {
        const period = new Date(match.played_at).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
        if (!acc[period]) {
          acc[period] = { period, bestVisit: 0 };
        }
        acc[period].bestVisit = Math.max(acc[period].bestVisit, match.player_best_visit);
        return acc;
      }, {}),
    );
    const filteredWinRate =
      filteredMatches.length > 0
        ? Number(((filteredMatches.filter((match) => match.did_win).length / filteredMatches.length) * 100).toFixed(1))
        : 0;
    const filteredAverage =
      filteredMatches.filter((match) => match.player_average > 0).length > 0
        ? Number(
            (
              filteredMatches.reduce((sum, match) => sum + match.player_average, 0) /
              filteredMatches.filter((match) => match.player_average > 0).length
            ).toFixed(1),
          )
        : 0;
    const filteredBestVisit = filteredMatches.reduce((best, match) => Math.max(best, match.player_best_visit), 0);
    const filteredTrainingScore =
      filteredTraining.length > 0
        ? Number((filteredTraining.reduce((sum, entry) => sum + entry.score, 0) / filteredTraining.length).toFixed(1))
        : 0;

    const badges = [
      data.stats.bestVisit >= 180 ? "180 Club" : "",
      data.insights.throwStats.checkoutsHit >= 10 ? "Checkout Killer" : "",
      data.stats.winRate >= 65 ? "Match Closer" : "",
      data.insights.throwStats.bullsHit >= 25 ? "Bull Hunter" : "",
      data.stats.trainingSessions >= 20 ? "Trainingsmaschine" : "",
      data.insights.bestWinStreak >= 5 ? "Hot Streak" : "",
    ].filter(Boolean);

    return {
      filteredMatches,
      filteredTraining,
      monthlyMatches,
      monthlyTraining,
      modeBreakdown,
      opponentBreakdown,
      averageTrend,
      bestVisitTrend,
      filteredWinRate,
      filteredAverage,
      filteredBestVisit,
      filteredTrainingScore,
      badges,
      achievements: data.insights.achievements,
      checkoutInsights: data.insights.checkoutInsights,
      rivalryInsights: data.insights.rivalryInsights,
      throwPatternTimeline: data.insights.throwPatternTimeline,
    };
  }, [analyticsNow, analyticsWindow, data, modeFilter]);

  const seasonBoard = data?.insights.seasonalLeaderboards[seasonWindow][seasonMetric] ?? [];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-3 py-4 pb-28 text-stone-100 sm:px-4 sm:py-6 sm:pb-8">
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

                <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Spielstil Snapshot</p>
                    <p className="text-xs text-stone-400">kurz und knackig</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatPill label="Lieblings-Finish" value={data.insights.checkoutInsights.favoriteFinish} />
                    <StatPill
                      label="Engstes Duell"
                      value={data.insights.rivalryInsights.closest[0]?.name ?? "Noch offen"}
                    />
                    <StatPill label="Lieblings-Route" value={data.insights.checkoutInsights.favoriteRoute} />
                    <StatPill label="Lieblingsmodus" value={data.insights.favoriteMode} />
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

                <HeatmapBoard numbers={data.insights.heatmap.numbers} max={data.insights.heatmap.max} />

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <h2 className="text-lg font-semibold text-white">Wurfmuster</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatPill label="Alle Wuerfe" value={String(data.insights.throwStats.totalThrows)} />
                    <StatPill label="Board-Treffer" value={String(data.insights.throwStats.boardThrows)} />
                    <StatPill label="Triples" value={String(data.insights.throwStats.triplesHit)} />
                    <StatPill label="Doubles" value={String(data.insights.throwStats.doublesHit)} />
                    <StatPill label="Bulls" value={String(data.insights.throwStats.bullsHit)} />
                    <StatPill label="Checkouts" value={String(data.insights.throwStats.checkoutsHit)} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Lieblingsfeld</p>
                      <p className="mt-1 text-lg font-semibold text-white">{data.insights.throwStats.favoriteSegment}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Lieblings-Checkout</p>
                      <p className="mt-1 text-lg font-semibold text-white">{data.insights.throwStats.favoriteDouble}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Top Segmente</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {data.insights.favoriteSegments.length > 0 ? (
                        data.insights.favoriteSegments.map((entry) => (
                          <div
                            key={entry.label}
                            className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-sm font-semibold text-amber-100"
                          >
                            {entry.label} · {entry.count}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-stone-400">
                          Noch keine Board-Wurfdaten.
                        </div>
                      )}
                    </div>
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
                          <Link
                            href={`/profile/matches/${match.id}`}
                            className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-2.5 py-1 font-semibold text-emerald-100"
                          >
                            Details
                          </Link>
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

            <ProfileAnalyticsPanel
              analytics={analytics}
              analyticsWindow={analyticsWindow}
              modeFilter={modeFilter}
              onAnalyticsWindowChange={setAnalyticsWindow}
              onModeFilterChange={setModeFilter}
            />

            <ProfileMatchArchiveSection matches={analytics.filteredMatches} />

            <ProfileSeasonLeaderboardSection
              seasonWindow={seasonWindow}
              seasonMetric={seasonMetric}
              onSeasonWindowChange={setSeasonWindow}
              onSeasonMetricChange={setSeasonMetric}
              seasonBoard={seasonBoard}
            />

            <ProfileRecordsSection records={data.insights.records} />

            <ProfileDeepInsightsSection analytics={analytics} />

            <ProfileAchievementsSection badges={analytics.badges} achievements={analytics.achievements} />
          </>
        )}
      </div>
      {session ? <MobileAppNav /> : null}
    </main>
  );
}
