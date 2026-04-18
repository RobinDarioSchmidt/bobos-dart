"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { formatOutLabel } from "@/lib/darts-display";
import { supabase } from "@/lib/supabase";

type MatchDetailResponse = {
  match: {
    id: string;
    played_at: string;
    mode: string;
    double_out: boolean;
    legs_to_win: number;
    sets_to_win: number;
    status: string;
  };
  players: Array<{
    guest_name: string | null;
    name: string;
    seat_index: number;
    is_winner: boolean;
    sets_won: number;
    legs_won: number;
    average: number | null;
    best_visit: number | null;
    throwCount: number;
    hits: number;
    misses: number;
    checkoutDarts: number;
    topSegments: Array<{
      label: string;
      count: number;
    }>;
    checkoutRoutes: Array<{
      route: string;
      score: number;
    }>;
    tonPlusVisits: number;
    tonFortyPlus: number;
    maxVisits: number;
    sixtyPlusVisits: number;
    lowScoreVisits: number;
    firstNineAverage: number;
    bestCheckout: number;
  }>;
  throwSummary: {
    totalThrows: number;
    checkoutDarts: number;
    misses: number;
    tonPlusVisits: number;
    tonFortyPlus: number;
    maxVisits: number;
  };
  visitTimeline: Array<{
    playerName: string;
    playerSeatIndex: number;
    visitIndex: number;
    score: number;
    darts: string[];
    createdAt: string;
  }>;
  scoringProgress: Array<{
    name: string;
    points: Array<{
      label: string;
      visitScore: number;
      cumulative: number;
    }>;
  }>;
  highlightVisits: Array<{
    playerName: string;
    playerSeatIndex: number;
    visitIndex: number;
    score: number;
    darts: string[];
    createdAt: string;
    route: string;
  }>;
  story: {
    mvp: {
      name: string;
      average: number;
      bestVisit: number;
      checkouts: number;
    } | null;
    highestCheckout: {
      name: string;
      score: number;
    } | null;
    strongestStarter: {
      name: string;
      firstNineAverage: number;
    } | null;
    steadiestScorer: {
      name: string;
      sixtyPlusVisits: number;
    } | null;
  };
};

function CompareBars({
  label,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  leftColor,
  rightColor,
}: {
  label: string;
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
  leftColor: string;
  rightColor: string;
}) {
  const max = Math.max(1, leftValue, rightValue);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">{label}</p>
        <p className="text-xs text-stone-400">
          {leftValue} : {rightValue}
        </p>
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-stone-300">
            <span>{leftLabel}</span>
            <span>{leftValue}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${leftColor}`} style={{ width: `${Math.max(8, (leftValue / max) * 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-stone-300">
            <span>{rightLabel}</span>
            <span>{rightValue}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${rightColor}`} style={{ width: `${Math.max(8, (rightValue / max) * 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressLine({
  series,
  stroke,
}: {
  series: Array<{ label: string; visitScore: number; cumulative: number }>;
  stroke: string;
}) {
  if (series.length === 0) {
    return <p className="text-sm text-stone-400">Keine Verlaufsdaten.</p>;
  }

  const values = series.map((entry) => entry.cumulative);
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const points = series.map((entry, index) => {
    const x = series.length === 1 ? 150 : 14 + (index / (series.length - 1)) * 292;
    const normalized = max === min ? 0.5 : (entry.cumulative - min) / (max - min);
    const y = 124 - normalized * 96;
    return `${x},${y}`;
  });

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 140" className="w-full">
        <path d="M14 124 H306" stroke="#44403c" strokeWidth="1" strokeDasharray="4 4" />
        <polyline fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={points.join(" ")} />
        {points.map((point, index) => {
          const [x, y] = point.split(",").map(Number);
          return <circle key={`${point}-${index}`} cx={x} cy={y} r="4" fill={stroke} />;
        })}
      </svg>
      <div className="flex flex-wrap gap-2">
        {series.map((entry) => (
          <span key={`${entry.label}-${entry.cumulative}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-stone-300">
            {entry.label}: +{entry.visitScore} / {entry.cumulative}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  const canLoad = Boolean(supabase && params?.matchId);
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(canLoad);
  const [message, setMessage] = useState("");

  const comparisons =
    data && data.players.length >= 2
      ? [
          {
            label: "Average",
            leftLabel: data.players[0].name,
            leftValue: Number(data.players[0].average ?? 0),
            rightLabel: data.players[1].name,
            rightValue: Number(data.players[1].average ?? 0),
          },
          {
            label: "Best Visit",
            leftLabel: data.players[0].name,
            leftValue: data.players[0].best_visit ?? 0,
            rightLabel: data.players[1].name,
            rightValue: data.players[1].best_visit ?? 0,
          },
          {
            label: "Treffer",
            leftLabel: data.players[0].name,
            leftValue: data.players[0].hits,
            rightLabel: data.players[1].name,
            rightValue: data.players[1].hits,
          },
        ]
      : [];

  useEffect(() => {
    if (!canLoad || !supabase || !params?.matchId) {
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

      const accessToken = sessionData.session.access_token;
      const response = await fetch(`/api/cloud/matches/${params.matchId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const result = (await response.json()) as MatchDetailResponse | { error: string };

      if (!response.ok || !("match" in result)) {
        setMessage("Match-Details konnten nicht geladen werden.");
        setLoading(false);
        return;
      }

      setData(result);
      setLoading(false);
    });
  }, [canLoad, params?.matchId]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-3 py-4 pb-28 text-stone-100 sm:px-4 sm:py-6 sm:pb-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Match Detail</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Partie im Detail</h1>
          </div>
          <Link href="/profile" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white">
            Zurueck
          </Link>
        </div>

        {loading ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-sm text-stone-300">
            Match-Details werden geladen...
          </div>
        ) : message ? (
          <div className="rounded-[1.5rem] border border-rose-300/20 bg-rose-400/10 p-5 text-sm text-rose-100">{message}</div>
        ) : data ? (
          <>
            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
                  {data.match.mode}
                </span>
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                  {formatOutLabel(data.match.double_out, data.match.mode)}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-stone-300">
                  Legs bis {data.match.legs_to_win}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-stone-300">
                  Sets bis {data.match.sets_to_win}
                </span>
              </div>
              <p className="mt-3 text-sm text-stone-400">
                Gespielt am {new Date(data.match.played_at).toLocaleDateString("de-DE")} um{" "}
                {new Date(data.match.played_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Wuerfe</p>
                  <p className="mt-1 text-lg font-semibold text-white">{data.throwSummary.totalThrows}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Checkout-Darts</p>
                  <p className="mt-1 text-lg font-semibold text-white">{data.throwSummary.checkoutDarts}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Misses</p>
                  <p className="mt-1 text-lg font-semibold text-white">{data.throwSummary.misses}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">100+</p>
                  <p className="mt-1 text-lg font-semibold text-white">{data.throwSummary.tonPlusVisits}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">140+</p>
                  <p className="mt-1 text-lg font-semibold text-white">{data.throwSummary.tonFortyPlus}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">180er</p>
                  <p className="mt-1 text-lg font-semibold text-white">{data.throwSummary.maxVisits}</p>
                </div>
              </div>
            </section>

            <section className="grid gap-3">
              <div className="grid gap-3 lg:grid-cols-4">
                <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-400/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100">Match MVP</p>
                  <p className="mt-2 text-lg font-semibold text-white">{data.story.mvp?.name ?? "-"}</p>
                  <p className="mt-1 text-xs text-emerald-50">
                    {data.story.mvp
                      ? `${data.story.mvp.average.toFixed(2)} Avg - ${data.story.mvp.bestVisit} Best - ${data.story.mvp.checkouts} Checkout-Darts`
                      : "Noch keine MVP-Daten"}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Bestes Finish</p>
                  <p className="mt-2 text-lg font-semibold text-white">{data.story.highestCheckout?.score ?? 0}</p>
                  <p className="mt-1 text-xs text-amber-50">{data.story.highestCheckout?.name ?? "Kein Checkout"}</p>
                </div>
                <div className="rounded-[1.5rem] border border-sky-300/20 bg-sky-400/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-sky-100">Staerkster Start</p>
                  <p className="mt-2 text-lg font-semibold text-white">{data.story.strongestStarter?.name ?? "-"}</p>
                  <p className="mt-1 text-xs text-sky-50">
                    {data.story.strongestStarter
                      ? `${data.story.strongestStarter.firstNineAverage.toFixed(2)} First-9 Avg`
                      : "Noch keine Startdaten"}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-fuchsia-300/20 bg-fuchsia-400/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-100">Konstantester Druck</p>
                  <p className="mt-2 text-lg font-semibold text-white">{data.story.steadiestScorer?.name ?? "-"}</p>
                  <p className="mt-1 text-xs text-fuchsia-50">
                    {data.story.steadiestScorer
                      ? `${data.story.steadiestScorer.sixtyPlusVisits} Visits mit 60+`
                      : "Noch keine Konstanzdaten"}
                  </p>
                </div>
              </div>

              {comparisons.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-3">
                  {comparisons.map((comparison) => (
                    <CompareBars
                      key={comparison.label}
                      label={comparison.label}
                      leftLabel={comparison.leftLabel}
                      leftValue={comparison.leftValue}
                      rightLabel={comparison.rightLabel}
                      rightValue={comparison.rightValue}
                      leftColor="bg-emerald-400"
                      rightColor="bg-amber-300"
                    />
                  ))}
                </div>
              ) : null}

              {data.scoringProgress.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.scoringProgress.map((series, index) => (
                    <div key={series.name} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-white">{series.name} - Scoring-Verlauf</h2>
                        <p className="text-xs text-stone-400">{series.points.length} Visits</p>
                      </div>
                      <div className="mt-4">
                        <ProgressLine series={series.points} stroke={index % 2 === 0 ? "#34d399" : "#fbbf24"} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {data.visitTimeline.length > 0 ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <h2 className="text-lg font-semibold text-white">Visit-Timeline</h2>
                  <div className="mt-3 space-y-2">
                    {data.visitTimeline.map((visit) => (
                      <div key={`${visit.playerSeatIndex}-${visit.visitIndex}`} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {visit.playerName} - Visit {visit.visitIndex + 1}
                            </p>
                            <p className="text-xs text-stone-400">{visit.darts.filter(Boolean).join(", ") || "Miss"}</p>
                          </div>
                          <p className="text-lg font-semibold text-white">+{visit.score}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.highlightVisits.length > 0 ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <h2 className="text-lg font-semibold text-white">Top Visits der Partie</h2>
                  <div className="mt-3 space-y-2">
                    {data.highlightVisits.map((visit) => (
                      <div key={`highlight-${visit.playerSeatIndex}-${visit.visitIndex}`} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {visit.playerName} - Visit {visit.visitIndex + 1}
                            </p>
                            <p className="text-xs text-stone-400">{visit.route || "No score"}</p>
                          </div>
                          <p className="text-lg font-semibold text-white">{visit.score}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.players.map((player) => (
                <div key={`${player.seat_index}-${player.name}`} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{player.name}</h2>
                        {player.is_winner ? (
                          <span className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                            Gewinner
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-stone-400">
                        {player.sets_won} Sets - {player.legs_won} Legs
                      </p>
                    </div>
                    <p className="text-sm text-stone-300">Seat {player.seat_index + 1}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Average</p>
                      <p className="mt-1 text-lg font-semibold text-white">{Number(player.average ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Best Visit</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.best_visit ?? 0}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Treffer</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.hits}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Misses</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.misses}</p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">100+</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.tonPlusVisits}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">140+</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.tonFortyPlus}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">180er</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.maxVisits}</p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">60+</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.sixtyPlusVisits}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">0-45</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.lowScoreVisits}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">First 9 Avg</p>
                      <p className="mt-1 text-lg font-semibold text-white">{player.firstNineAverage.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Top Segmente</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {player.topSegments.length > 0 ? (
                        player.topSegments.map((segment) => (
                          <span
                            key={`${player.name}-${segment.label}`}
                            className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-sm font-semibold text-amber-100"
                          >
                            {segment.label} - {segment.count}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-stone-400">
                          Noch keine Wurfdaten vorhanden.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Checkout-Routen</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {player.checkoutRoutes.length > 0 ? (
                        player.checkoutRoutes.map((route) => (
                          <span
                            key={`${player.name}-${route.route}-${route.score}`}
                            className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-1.5 text-sm font-semibold text-emerald-100"
                          >
                            {route.route} - {route.score}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-stone-400">
                          Kein Checkout in dieser Partie.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </>
        ) : null}
      </div>
      {session ? <MobileAppNav /> : null}
    </main>
  );
}
