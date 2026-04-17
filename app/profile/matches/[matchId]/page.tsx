"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { MobileAppNav } from "@/components/mobile-app-nav";
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
  }>;
  throwSummary: {
    totalThrows: number;
    checkoutDarts: number;
    misses: number;
  };
};

function formatOutLabel(doubleOut: boolean, mode: string) {
  if (mode.toLowerCase().includes("master")) {
    return "Masters Out";
  }

  return doubleOut ? "Double Out" : "Single Out";
}

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  const canLoad = Boolean(supabase && params?.matchId);
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(canLoad);
  const [message, setMessage] = useState("");

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
            </section>

            <section className="grid gap-3">
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
