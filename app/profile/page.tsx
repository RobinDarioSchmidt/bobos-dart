"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type ProfileResponse = {
  profile: {
    display_name: string;
    username: string | null;
    created_at: string;
  };
  stats: ProfileStats;
  recentTraining: Array<{
    score: number;
    darts_thrown: number;
    hits: number;
    played_at: string;
  }>;
  recentMatches: Array<{
    id: string;
    played_at: string;
    mode: string;
    double_out: boolean;
    winner: string;
    opponents: string;
    sets: string;
  }>;
};

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

  const stats = data?.stats;
  const playerArchetype = !stats
    ? "Noch in der Einspielphase"
    : stats.winRate >= 65
      ? "Checkout-Killer"
      : stats.trainingHitRate >= 55
        ? "Trainingsmaschine"
        : stats.bestAverage >= 60
          ? "Scoring-Motor"
          : "Konstanter Leg-Jaeger";
  const momentumText = !stats
    ? ""
    : `${stats.matchesWon} Siege · ${stats.totalLegsWon} Legs · ${stats.trainingSessions} Trainings`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-3 py-4 text-stone-100 sm:px-4 sm:py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
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
            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
              <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.25rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.14),rgba(16,185,129,0.12),rgba(15,23,42,0.68))] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-stone-300">Spielerkarte</p>
                  <h2 className="mt-2 text-3xl font-semibold text-white">{data.profile.display_name}</h2>
                  <p className="mt-1 text-sm text-stone-400">{session.user.email}</p>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Spielstil</p>
                    <p className="mt-1 text-lg font-semibold text-white">{playerArchetype}</p>
                    <p className="mt-1 text-xs text-stone-300">{momentumText}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Winrate</p>
                      <p className="mt-1 text-xl font-semibold text-emerald-200">{stats?.winRate.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Best Avg</p>
                      <p className="mt-1 text-xl font-semibold text-white">{stats?.bestAverage.toFixed(2)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Best Visit</p>
                      <p className="mt-1 text-xl font-semibold text-white">{stats?.bestVisit}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-white/10 bg-emerald-400/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-200">Matches</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{stats?.matchesPlayed}</p>
                    <p className="text-sm text-emerald-100">{stats?.matchesWon} Siege</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-amber-300/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Training</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{stats?.trainingSessions}</p>
                    <p className="text-sm text-amber-50">{stats?.trainingHitRate.toFixed(1)}% Trefferquote</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Sets / Legs</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {stats?.totalSetsWon} / {stats?.totalLegsWon}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Best Training</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{stats?.bestTrainingScore}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Darts Training</p>
                    <p className="mt-1 text-xl font-semibold text-white">{stats?.totalTrainingDarts}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Treffer Training</p>
                    <p className="mt-1 text-xl font-semibold text-white">{stats?.totalTrainingHits}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Mitglied seit</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {new Date(data.profile.created_at).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Konto</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{data.profile.username ?? "Kein Name"}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100">Winrate</p>
                    <p className="mt-1 text-xl font-semibold text-white">{stats?.winRate.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-sky-100">Best Avg</p>
                    <p className="mt-1 text-xl font-semibold text-white">{stats?.bestAverage.toFixed(2)}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Best Visit</p>
                    <p className="mt-1 text-xl font-semibold text-white">{stats?.bestVisit}</p>
                  </div>
                  <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-100">Trefferquote</p>
                    <p className="mt-1 text-xl font-semibold text-white">{stats?.trainingHitRate.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="mt-4">
                  <h2 className="text-lg font-semibold text-white">Letzte Matches</h2>
                  <div className="mt-3 space-y-2">
                    {data.recentMatches.length > 0 ? (
                      data.recentMatches.map((match) => (
                        <div key={match.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{match.winner} gewinnt</p>
                              <p className="text-xs text-stone-400">gegen {match.opponents}</p>
                            </div>
                            <p className="text-[11px] text-stone-400">{new Date(match.played_at).toLocaleDateString("de-DE")}</p>
                          </div>
                          <p className="mt-2 text-xs text-stone-300">
                            {match.mode} · {match.double_out ? "Double Out" : "Single Out"} · {match.sets}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-stone-400">
                        Noch keine Cloud-Matches.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <h2 className="text-lg font-semibold text-white">Trainingsform</h2>
                <div className="mt-3 space-y-2">
                  {data.recentTraining.length > 0 ? (
                    data.recentTraining.map((entry, index) => (
                      <div key={`${entry.played_at}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
