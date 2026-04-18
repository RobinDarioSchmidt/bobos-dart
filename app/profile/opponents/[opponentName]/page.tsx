"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { supabase } from "@/lib/supabase";

type OpponentResponse = {
  opponentName: string;
  summary: {
    matches: number;
    wins: number;
    losses: number;
    winRate: number;
    myAverage: number;
    opponentAverage: number;
    myBestVisit: number;
    opponentBestVisit: number;
    myLegs: number;
    opponentLegs: number;
  } | null;
  matches: Array<{
    id: string;
    played_at: string;
    mode: string;
    double_out: boolean;
    didWin: boolean;
    myAverage: number;
    opponentAverage: number;
    myBestVisit: number;
    opponentBestVisit: number;
    myLegs: number;
    opponentLegs: number;
    mySets: number;
    opponentSets: number;
  }>;
  modeBreakdown: Array<{
    mode: string;
    matches: number;
    wins: number;
    winRate: number;
    myAverage: number;
    opponentAverage: number;
  }>;
  rivalryStory: {
    currentWinStreak: number;
    bestWinStreak: number;
    recentForm: Array<"W" | "L">;
    closestMatches: Array<{
      id: string;
      played_at: string;
      didWin: boolean;
      legs: string;
      sets: string;
    }>;
    bestMode: {
      mode: string;
      matches: number;
      wins: number;
      winRate: number;
      myAverage: number;
      opponentAverage: number;
    } | null;
    rivalryTone: string;
  } | null;
};

function MiniLine({
  values,
  stroke,
}: {
  values: number[];
  stroke: string;
}) {
  if (values.length === 0) {
    return <p className="text-sm text-stone-400">Keine Daten vorhanden.</p>;
  }

  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 150 : 14 + (index / (values.length - 1)) * 292;
    const normalized = max === min ? 0.5 : (value - min) / (max - min);
    const y = 124 - normalized * 96;
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 320 140" className="w-full">
      <path d="M14 124 H306" stroke="#44403c" strokeWidth="1" strokeDasharray="4 4" />
      <polyline fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={points.join(" ")} />
      {points.map((point, index) => {
        const [x, y] = point.split(",").map(Number);
        return <circle key={`${point}-${index}`} cx={x} cy={y} r="4" fill={stroke} />;
      })}
    </svg>
  );
}

export default function OpponentDetailPage() {
  const params = useParams<{ opponentName: string }>();
  const canLoad = Boolean(supabase && params?.opponentName);
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<OpponentResponse | null>(null);
  const [loading, setLoading] = useState(canLoad);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!canLoad || !supabase || !params?.opponentName) {
      return;
    }

    const client = supabase;
    void client.auth.getSession().then(async ({ data: sessionData }) => {
      setSession(sessionData.session);
      if (!sessionData.session) {
        setMessage("Bitte erst einloggen.");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/cloud/opponents/${encodeURIComponent(params.opponentName)}`, {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });
      const result = (await response.json()) as OpponentResponse | { error: string };

      if (!response.ok || !("opponentName" in result)) {
        setMessage("Gegnerdaten konnten nicht geladen werden.");
        setLoading(false);
        return;
      }

      setData(result);
      setLoading(false);
    });
  }, [canLoad, params?.opponentName]);

  const trends = useMemo(() => {
    if (!data) {
      return { myAverage: [], opponentAverage: [], winFlow: [] as number[] };
    }

    const sorted = [...data.matches].sort(
      (left, right) => new Date(left.played_at).getTime() - new Date(right.played_at).getTime(),
    );
    return {
      myAverage: sorted.map((entry) => entry.myAverage),
      opponentAverage: sorted.map((entry) => entry.opponentAverage),
      winFlow: sorted.map((entry) => (entry.didWin ? 1 : 0)),
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-3 py-4 pb-28 text-stone-100 sm:px-4 sm:py-6 sm:pb-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Head to Head</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
              {decodeURIComponent(params?.opponentName ?? "")}
            </h1>
          </div>
          <Link href="/profile" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white">
            Zurueck
          </Link>
        </div>

        {loading ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-sm text-stone-300">
            Gegnervergleich wird geladen...
          </div>
        ) : message ? (
          <div className="rounded-[1.5rem] border border-rose-300/20 bg-rose-400/10 p-5 text-sm text-rose-100">{message}</div>
        ) : data?.summary ? (
          <>
            {data.rivalryStory ? (
              <section className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,rgba(59,130,246,0.16),rgba(217,70,239,0.12),rgba(15,23,42,0.82))] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-200">Rivalitaet</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{data.rivalryStory.rivalryTone}</h2>
                    <p className="mt-2 text-sm text-stone-300">
                      {data.summary.wins} Siege zu {data.summary.losses} Niederlagen bei {data.summary.matches} direkten Duellen.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Aktuelle Serie</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {data.rivalryStory.currentWinStreak > 0 ? `${data.rivalryStory.currentWinStreak} Siege` : "Keine"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Beste Serie</p>
                      <p className="mt-1 text-lg font-semibold text-white">{data.rivalryStory.bestWinStreak}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 col-span-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Lieblingsmodus</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {data.rivalryStory.bestMode
                          ? `${data.rivalryStory.bestMode.mode} - ${data.rivalryStory.bestMode.winRate.toFixed(1)}%`
                          : "Noch offen"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.rivalryStory.recentForm.length > 0 ? (
                    data.rivalryStory.recentForm.map((entry, index) => (
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
                      Noch keine Formdaten.
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Matches</p>
                <p className="mt-1 text-xl font-semibold text-white">{data.summary.matches}</p>
              </div>
              <div className="rounded-[1.25rem] border border-emerald-300/25 bg-emerald-400/12 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100">Winrate</p>
                <p className="mt-1 text-xl font-semibold text-white">{data.summary.winRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Average</p>
                <p className="mt-1 text-xl font-semibold text-white">{data.summary.myAverage.toFixed(1)}</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Legs</p>
                <p className="mt-1 text-xl font-semibold text-white">
                  {data.summary.myLegs} : {data.summary.opponentLegs}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Best Visit</p>
                <p className="mt-1 text-xl font-semibold text-white">{data.summary.myBestVisit}</p>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">Average-Duell</h2>
                  <p className="text-xs text-stone-400">du vs. Gegner</p>
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <p className="mb-2 text-xs text-emerald-100">Dein Average</p>
                    <MiniLine values={trends.myAverage} stroke="#34d399" />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-amber-100">Gegner-Average</p>
                    <MiniLine values={trends.opponentAverage} stroke="#fbbf24" />
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">Momentum</h2>
                  <p className="text-xs text-stone-400">1 = Sieg, 0 = Niederlage</p>
                </div>
                <div className="mt-4">
                  <MiniLine values={trends.winFlow} stroke="#f472b6" />
                </div>
              </div>
            </section>

            {data.modeBreakdown.length > 0 || (data.rivalryStory?.closestMatches.length ?? 0) > 0 ? (
              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <h2 className="text-lg font-semibold text-white">Modusvergleich</h2>
                  <div className="mt-3 space-y-2">
                    {data.modeBreakdown.map((entry) => (
                      <div key={entry.mode} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{entry.mode}</p>
                          <p className="text-sm text-stone-300">{entry.winRate.toFixed(1)}%</p>
                        </div>
                        <p className="mt-1 text-xs text-stone-400">
                          {entry.wins}/{entry.matches} Siege - Avg {entry.myAverage.toFixed(1)} : {entry.opponentAverage.toFixed(1)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <h2 className="text-lg font-semibold text-white">Engste Duelle</h2>
                  <div className="mt-3 space-y-2">
                    {data.rivalryStory?.closestMatches.length ? (
                      data.rivalryStory.closestMatches.map((match) => (
                        <div key={match.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {match.didWin ? "Knapp gewonnen" : "Knapp verloren"}
                              </p>
                              <p className="text-xs text-stone-400">Sets {match.sets} - Legs {match.legs}</p>
                            </div>
                            <Link
                              href={`/profile/matches/${match.id}`}
                              className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-1.5 text-sm font-semibold text-emerald-100"
                            >
                              Match
                            </Link>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-stone-400">
                        Noch keine knappen Matches gespeichert.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
              <h2 className="text-lg font-semibold text-white">Direkte Duelle</h2>
              <div className="mt-3 space-y-2">
                {data.matches.map((match) => (
                  <div key={match.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                              match.didWin
                                ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                                : "border-rose-300/25 bg-rose-400/12 text-rose-100"
                            }`}
                          >
                            {match.didWin ? "Sieg" : "Niederlage"}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
                            {match.mode}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">
                          Sets {match.mySets} : {match.opponentSets} - Legs {match.myLegs} : {match.opponentLegs}
                        </p>
                        <p className="text-xs text-stone-400">
                          Average {match.myAverage.toFixed(1)} : {match.opponentAverage.toFixed(1)} - Best Visit{" "}
                          {match.myBestVisit} : {match.opponentBestVisit}
                        </p>
                      </div>
                      <Link
                        href={`/profile/matches/${match.id}`}
                        className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-1.5 text-sm font-semibold text-emerald-100"
                      >
                        Match
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-stone-400">
            Gegen diesen Gegner gibt es in der Cloud noch keine gespeicherten Direktduelle.
          </div>
        )}
      </div>
      {session ? <MobileAppNav /> : null}
    </main>
  );
}
