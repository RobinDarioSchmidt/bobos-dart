"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { applyLiveVisit, getPreferredDisplayName, startNextLiveLeg, type LiveMatchState } from "@/lib/live-match";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type LiveMatchResponse = {
  match: {
    room_code: string;
    state: LiveMatchState;
  };
};

const PRESETS = [26, 41, 45, 60, 81, 100, 121, 140, 180];
const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const BOARD_START_ANGLE = -9;
const BOARD_SLICE_ANGLE = 18;
const BOARD_RADIUS = {
  bullInner: 14,
  bullOuter: 28,
  tripleInner: 88,
  tripleOuter: 108,
  doubleInner: 150,
  doubleOuter: 172,
  label: 188,
};

type Segment = {
  label: string;
  score: number;
  number: number;
  multiplier: 1 | 2 | 3;
};

function polarToCartesian(radius: number, angleDeg: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: 200 + radius * Math.cos(angle),
    y: 200 + radius * Math.sin(angle),
  };
}

function describeSlice(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(outerRadius, startAngle);
  const endOuter = polarToCartesian(outerRadius, endAngle);
  const startInner = polarToCartesian(innerRadius, startAngle);
  const endInner = polarToCartesian(innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

function handleBoardKeyDown(
  event: React.KeyboardEvent<SVGGElement>,
  onSegmentSelect: (segment: Segment) => void,
  segment: Segment,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSegmentSelect(segment);
  }
}

function LiveDartboard({
  onSegmentSelect,
  caption,
}: {
  onSegmentSelect: (segment: Segment) => void;
  caption: string;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<Segment | null>(null);

  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Visuelles Dartboard</h3>
          <p className="text-sm text-stone-400">{caption}</p>
        </div>
        {hoveredSegment ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-100">Ziel</p>
            <p className="text-sm font-semibold text-white">
              {hoveredSegment.label} · {hoveredSegment.score} Punkte
            </p>
          </div>
        ) : (
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-stone-300">
            Hover + Klick
          </div>
        )}
      </div>

      <svg viewBox="0 0 400 400" className="mx-auto w-full max-w-[34rem] drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
        <circle cx="200" cy="200" r="194" fill="#111827" />
        <circle cx="200" cy="200" r="182" fill="#d6d3d1" />
        <circle cx="200" cy="200" r={BOARD_RADIUS.doubleOuter} fill="#0f172a" />

        {BOARD_ORDER.map((value, index) => {
          const startAngle = BOARD_START_ANGLE + index * BOARD_SLICE_ANGLE;
          const endAngle = startAngle + BOARD_SLICE_ANGLE;
          const midAngle = startAngle + BOARD_SLICE_ANGLE / 2;
          const isEven = index % 2 === 0;
          const singleColor = isEven ? "#f5f5f4" : "#111827";
          const doubleTripleColor = isEven ? "#b91c1c" : "#166534";
          const labelPoint = polarToCartesian(BOARD_RADIUS.label, midAngle);

          const segments: Array<{
            key: string;
            fill: string;
            path: string;
            segment: Segment;
          }> = [
            {
              key: `double-${value}`,
              fill: doubleTripleColor,
              path: describeSlice(BOARD_RADIUS.doubleInner, BOARD_RADIUS.doubleOuter, startAngle, endAngle),
              segment: { label: `D${value}`, score: value * 2, number: value, multiplier: 2 },
            },
            {
              key: `outer-single-${value}`,
              fill: singleColor,
              path: describeSlice(BOARD_RADIUS.tripleOuter, BOARD_RADIUS.doubleInner, startAngle, endAngle),
              segment: { label: `S${value}`, score: value, number: value, multiplier: 1 },
            },
            {
              key: `triple-${value}`,
              fill: doubleTripleColor,
              path: describeSlice(BOARD_RADIUS.tripleInner, BOARD_RADIUS.tripleOuter, startAngle, endAngle),
              segment: { label: `T${value}`, score: value * 3, number: value, multiplier: 3 },
            },
            {
              key: `inner-single-${value}`,
              fill: singleColor,
              path: describeSlice(BOARD_RADIUS.bullOuter, BOARD_RADIUS.tripleInner, startAngle, endAngle),
              segment: { label: `S${value}`, score: value, number: value, multiplier: 1 },
            },
          ];

          return (
            <g key={value}>
              {segments.map(({ key, fill, path, segment }) => (
                <g
                  key={key}
                  role="button"
                  tabIndex={0}
                  aria-label={segment.label}
                  onClick={() => onSegmentSelect(segment)}
                  onKeyDown={(event) => handleBoardKeyDown(event, onSegmentSelect, segment)}
                  className="cursor-pointer outline-none"
                >
                  <path
                    d={path}
                    fill={fill}
                    stroke="#0a0a0a"
                    strokeWidth="1.5"
                    onMouseEnter={() => setHoveredSegment(segment)}
                    onMouseLeave={() => setHoveredSegment((current) => (current?.label === segment.label ? null : current))}
                    onFocus={() => setHoveredSegment(segment)}
                    onBlur={() => setHoveredSegment((current) => (current?.label === segment.label ? null : current))}
                    className="transition duration-150 hover:brightness-125 focus:brightness-125"
                  />
                </g>
              ))}
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                fill="#9ca3af"
                fontSize="16"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {value}
              </text>
            </g>
          );
        })}

        <g
          role="button"
          tabIndex={0}
          aria-label="Outer Bull"
          onClick={() => onSegmentSelect({ label: "Outer Bull", score: 25, number: 25, multiplier: 1 })}
          onKeyDown={(event) =>
            handleBoardKeyDown(event, onSegmentSelect, {
              label: "Outer Bull",
              score: 25,
              number: 25,
              multiplier: 1,
            })
          }
          className="cursor-pointer outline-none"
        >
          <circle
            cx="200"
            cy="200"
            r={BOARD_RADIUS.bullOuter}
            fill="#166534"
            stroke="#0a0a0a"
            strokeWidth="2"
            onMouseEnter={() => setHoveredSegment({ label: "Outer Bull", score: 25, number: 25, multiplier: 1 })}
            onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
            onFocus={() => setHoveredSegment({ label: "Outer Bull", score: 25, number: 25, multiplier: 1 })}
            onBlur={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
            className="transition duration-150 hover:brightness-125 focus:brightness-125"
          />
        </g>
        <g
          role="button"
          tabIndex={0}
          aria-label="Bull"
          onClick={() => onSegmentSelect({ label: "Bull", score: 50, number: 25, multiplier: 2 })}
          onKeyDown={(event) =>
            handleBoardKeyDown(event, onSegmentSelect, {
              label: "Bull",
              score: 50,
              number: 25,
              multiplier: 2,
            })
          }
          className="cursor-pointer outline-none"
        >
          <circle
            cx="200"
            cy="200"
            r={BOARD_RADIUS.bullInner}
            fill="#b91c1c"
            stroke="#0a0a0a"
            strokeWidth="2"
            onMouseEnter={() => setHoveredSegment({ label: "Bull", score: 50, number: 25, multiplier: 2 })}
            onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
            onFocus={() => setHoveredSegment({ label: "Bull", score: 50, number: 25, multiplier: 2 })}
            onBlur={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
            className="transition duration-150 hover:brightness-125 focus:brightness-125"
          />
        </g>
      </svg>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300">
          Single: normaler Ring
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          Double: aeusserer Ring
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Triple: mittlerer Ring
        </div>
      </div>
    </div>
  );
}

export default function LivePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
  });
  const [liveRoomCode, setLiveRoomCode] = useState("");
  const [liveState, setLiveState] = useState<LiveMatchState | null>(null);
  const [mode, setMode] = useState<301 | 501>(501);
  const [doubleOut, setDoubleOut] = useState(true);
  const [legsToWin, setLegsToWin] = useState(3);
  const [setsToWin, setSetsToWin] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [visitTotal, setVisitTotal] = useState("");
  const [currentDarts, setCurrentDarts] = useState<number[]>([]);
  const [currentLabels, setCurrentLabels] = useState<string[]>([]);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectedNames, setConnectedNames] = useState<string[]>([]);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";
  const liveChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        setDisplayName(getPreferredDisplayName(data.session.user.email, "", adminEmail));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setDisplayName(getPreferredDisplayName(nextSession.user.email, "", adminEmail));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [adminEmail]);

  async function getAccessToken() {
    if (!supabase) {
      return null;
    }

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();

    return freshSession?.access_token ?? null;
  }

  const fetchMatch = useCallback(async (roomCode: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("Bitte zuerst einloggen.");
      return;
    }

    const response = await fetch(`/api/live?roomCode=${encodeURIComponent(roomCode)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const result = (await response.json()) as LiveMatchResponse | { error: string };
    if (!response.ok || !("match" in result)) {
      setMessage("Raum konnte nicht geladen werden.");
      return;
    }

    setLiveRoomCode(result.match.room_code);
    setLiveState(result.match.state);
  }, []);

  useEffect(() => {
    if (!liveRoomCode || !session) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchMatch(liveRoomCode);
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchMatch, liveRoomCode, session]);

  const broadcastRefresh = useCallback(async (roomCode: string, reason: string) => {
    const channel = liveChannelRef.current;
    if (!channel) {
      return;
    }

    await channel.send({
      type: "broadcast",
      event: "match_updated",
      payload: {
        roomCode,
        reason,
        updatedAt: new Date().toISOString(),
      },
    });
  }, []);

  useEffect(() => {
    if (!supabase || !session || !liveRoomCode || !displayName) {
      return;
    }

    const client = supabase;
    const channel = client.channel(`live-room:${liveRoomCode}`, {
      config: {
        broadcast: { self: false },
        presence: { key: session.user.id },
      },
    });

    liveChannelRef.current = channel;

    channel
      .on("broadcast", { event: "match_updated" }, () => {
        void fetchMatch(liveRoomCode);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ name?: string }>>;
        const names = Object.values(state)
          .flat()
          .map((entry) => entry.name)
          .filter((name): name is string => Boolean(name));
        setConnectedNames(Array.from(new Set(names)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            name: displayName,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      setConnectedNames([]);
      liveChannelRef.current = null;
      void channel.untrack();
      void client.removeChannel(channel);
    };
  }, [displayName, fetchMatch, liveRoomCode, session]);

  async function callLiveApi(body: object) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("Bitte zuerst einloggen.");
      return null;
    }

    setLoading(true);
    setMessage("");

    const response = await fetch("/api/live", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as LiveMatchResponse | { error: string };
    setLoading(false);

    if (!response.ok || !("match" in result)) {
      setMessage("error" in result ? result.error : "Aktion fehlgeschlagen.");
      return null;
    }

    setLiveRoomCode(result.match.room_code);
    setLiveState(result.match.state);
    return result.match;
  }

  async function createRoom() {
    const match = await callLiveApi({
      action: "create",
      mode,
      doubleOut,
      legsToWin,
      setsToWin,
      maxPlayers,
      displayName,
    });

    if (match?.room_code) {
      await broadcastRefresh(match.room_code, "create");
    }
  }

  async function joinRoom() {
    if (!roomCodeInput) {
      setMessage("Bitte einen Raumcode eingeben.");
      return;
    }

    const match = await callLiveApi({
      action: "join",
      roomCode: roomCodeInput,
      displayName,
    });

    if (match?.room_code) {
      await broadcastRefresh(match.room_code, "join");
    }
  }

  async function copyRoomCode() {
    if (!liveRoomCode) {
      return;
    }

    await navigator.clipboard.writeText(liveRoomCode);
    setMessage("Raumcode kopiert.");
  }

  async function copyRoomLink() {
    if (!liveRoomCode) {
      return;
    }

    const url = `${window.location.origin}/live?room=${encodeURIComponent(liveRoomCode)}`;
    await navigator.clipboard.writeText(url);
    setMessage("Raumlink kopiert.");
  }

  async function updateRoom(nextState: LiveMatchState) {
    if (!liveRoomCode) {
      return;
    }

    const result = await callLiveApi({
      action: "update",
      roomCode: liveRoomCode,
      state: nextState,
    });

    if (result) {
      setVisitTotal("");
      setCurrentDarts([]);
      setCurrentLabels([]);
      setConfirmCheckout(false);
      await broadcastRefresh(liveRoomCode, "update");
    }
  }

  function addBoardSegment(segment: Segment) {
    if (currentDarts.length >= 3 || loading) {
      return;
    }

    const nextDarts = [...currentDarts, segment.score];
    setCurrentDarts(nextDarts);
    setCurrentLabels((prev) => [...prev, segment.label]);
    setVisitTotal(String(nextDarts.reduce((sum, value) => sum + value, 0)));
  }

  function removeLastBoardDart() {
    if (currentDarts.length === 0) {
      return;
    }

    const nextDarts = currentDarts.slice(0, -1);
    setCurrentDarts(nextDarts);
    setCurrentLabels((prev) => prev.slice(0, -1));
    setVisitTotal(nextDarts.length > 0 ? String(nextDarts.reduce((sum, value) => sum + value, 0)) : "");
  }

  function clearBoardVisit() {
    setCurrentDarts([]);
    setCurrentLabels([]);
    setVisitTotal("");
  }

  async function submitVisit(total: number) {
    if (!liveState) {
      return;
    }

    const nextState = applyLiveVisit(liveState, total, confirmCheckout);
    await updateRoom(nextState);
  }

  async function nextLeg() {
    if (!liveState) {
      return;
    }

    await updateRoom(startNextLiveLeg(liveState));
  }

  const activePlayer = useMemo(
    () => (liveState ? liveState.players[liveState.activePlayer] : null),
    [liveState],
  );
  const currentUserSeat = useMemo(
    () => liveState?.players.findIndex((player) => player.profileId === session?.user.id) ?? -1,
    [liveState, session?.user.id],
  );
  const isCurrentUsersTurn = Boolean(
    liveState &&
      session &&
      liveState.matchWinner === null &&
      liveState.legWinner === null &&
      currentUserSeat >= 0 &&
      liveState.activePlayer === currentUserSeat,
  );
  const canControlLegTransition = Boolean(
    liveState &&
      session &&
      liveState.legWinner !== null &&
      liveState.matchWinner === null &&
      currentUserSeat >= 0 &&
      (liveState.legWinner === currentUserSeat || liveState.players[0]?.profileId === session.user.id),
  );
  const turnStatus = !liveState
    ? ""
    : currentUserSeat < 0
      ? "Du bist aktuell kein aktiver Spieler in diesem Raum."
      : isCurrentUsersTurn
        ? "Du bist dran."
        : activePlayer
          ? `${activePlayer.name} ist gerade am Zug.`
          : "Warte auf den naechsten Spieler.";
  const currentVisitTotal = currentDarts.reduce((sum, dart) => sum + dart, 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-4 py-8 text-stone-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Shared Match</p>
            <h1 className="mt-2 text-4xl font-semibold text-white">Gemeinsames Live-Match</h1>
          </div>
          <Link href="/" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold">
            Zurueck zur App
          </Link>
        </div>

        {!supabaseEnabled ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 text-sm text-stone-300">
            Supabase ist noch nicht konfiguriert.
          </section>
        ) : !session ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 text-sm text-stone-300">
            Bitte zuerst in der Haupt-App einloggen und dann hierher zurueckkommen.
          </section>
        ) : (
          <>
            <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <h2 className="text-2xl font-semibold text-white">Raum erstellen</h2>
                <p className="mt-1 text-sm text-stone-400">
                  Erstelle einen Raum und schicke den Raumcode an deine Freunde.
                </p>

                <div className="mt-5 space-y-4">
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Dein Anzeigename"
                    className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => setMode(301)}
                      className={`rounded-2xl px-4 py-3 font-semibold ${mode === 301 ? "bg-amber-300 text-black" : "border border-white/10 bg-black/20"}`}
                    >
                      301
                    </button>
                    <button
                      onClick={() => setMode(501)}
                      className={`rounded-2xl px-4 py-3 font-semibold ${mode === 501 ? "bg-emerald-400 text-black" : "border border-white/10 bg-black/20"}`}
                    >
                      501
                    </button>
                  </div>
                  <button
                    onClick={() => setDoubleOut((prev) => !prev)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold"
                  >
                    {doubleOut ? "Double-Out aktiv" : "Straight-Out aktiv"}
                  </button>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      value={legsToWin}
                      onChange={(event) => setLegsToWin(Number(event.target.value))}
                      className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white"
                    >
                      {[2, 3, 5].map((value) => (
                        <option key={value} value={value}>
                          Legs zum Satz: {value}
                        </option>
                      ))}
                    </select>
                    <select
                      value={setsToWin}
                      onChange={(event) => setSetsToWin(Number(event.target.value))}
                      className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white"
                    >
                      {[1, 2, 3].map((value) => (
                        <option key={value} value={value}>
                          Saetze zum Match: {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={maxPlayers}
                    onChange={(event) => setMaxPlayers(Number(event.target.value))}
                    className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white"
                  >
                    {[2, 3, 4].map((value) => (
                      <option key={value} value={value}>
                        Spieler: {value}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void createRoom()}
                    disabled={loading}
                    className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    Raum erstellen
                  </button>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <h2 className="text-2xl font-semibold text-white">Raum beitreten</h2>
                <p className="mt-1 text-sm text-stone-400">Code eingeben und dem laufenden Match beitreten.</p>
                <div className="mt-5 flex gap-3">
                  <input
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                    placeholder="Raumcode"
                    className="h-11 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                  />
                  <button
                    onClick={() => void joinRoom()}
                    disabled={loading}
                    className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    Beitreten
                  </button>
                </div>
                {liveRoomCode ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Aktueller Raumcode</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{liveRoomCode}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => void copyRoomCode()}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Code kopieren
                      </button>
                      <button
                        onClick={() => void copyRoomLink()}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Raumlink kopieren
                      </button>
                    </div>
                  </div>
                ) : null}
                {message ? <p className="mt-4 text-sm text-amber-200">{message}</p> : null}
              </div>
            </section>

            {liveState ? (
              <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-6">
                  <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold text-white">Synchronisierter Spielstand</h2>
                        <p className="mt-1 text-sm text-stone-400">{liveState.statusText}</p>
                      </div>
                      <button
                        onClick={() => void fetchMatch(liveRoomCode)}
                        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold"
                      >
                        Aktualisieren
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {liveState.players.map((player, index) => (
                        <div
                          key={`${player.name}-${index}`}
                          className={`rounded-[1.5rem] border p-4 ${
                            liveState.activePlayer === index && liveState.matchWinner === null
                              ? "border-emerald-300/40 bg-emerald-300/10"
                              : "border-white/10 bg-black/20"
                          }`}
                        >
                          <p className="text-lg font-semibold text-white">{player.name}</p>
                          <p className="mt-3 text-5xl font-semibold leading-none text-white">
                            {player.joined ? player.score : "—"}
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-2xl bg-white/5 p-3">
                              <p className="text-stone-400">Sets</p>
                              <p className="mt-1 text-xl font-semibold text-white">{player.sets}</p>
                            </div>
                            <div className="rounded-2xl bg-white/5 p-3">
                              <p className="text-stone-400">Legs</p>
                              <p className="mt-1 text-xl font-semibold text-white">{player.legs}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Gerade online im Raum</p>
                      <p className="mt-2 text-sm text-stone-300">
                        {connectedNames.length > 0 ? connectedNames.join(", ") : "Noch keine aktiven Verbindungen erkannt."}
                      </p>
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Dein Status</p>
                      <p className="mt-2 text-sm font-semibold text-white">{turnStatus}</p>
                    </div>
                  </section>

                  <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                    <h2 className="text-2xl font-semibold text-white">Visit buchen</h2>
                    <p className="mt-1 text-sm text-stone-400">
                      Diese Eingabe synchronisiert sich automatisch zwischen den Teilnehmern.
                    </p>

                    <div className="mt-5">
                      <LiveDartboard
                        onSegmentSelect={(segment) => {
                          if (!isCurrentUsersTurn) {
                            setMessage("Du kannst nur buchen, wenn du gerade am Zug bist.");
                            return;
                          }

                          addBoardSegment(segment);
                        }}
                        caption="Baue deinen Besuch direkt auf dem Board zusammen oder nutze unten weiter den Zahlen-Input."
                      />
                    </div>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Aktueller Board-Besuch</p>
                          <p className="mt-2 text-3xl font-semibold text-white">{currentVisitTotal}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={removeLastBoardDart}
                            disabled={currentDarts.length === 0 || !isCurrentUsersTurn}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            Letzten Dart entfernen
                          </button>
                          <button
                            onClick={clearBoardVisit}
                            disabled={currentDarts.length === 0 || !isCurrentUsersTurn}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            Board leeren
                          </button>
                          <button
                            onClick={() => void submitVisit(currentVisitTotal)}
                            disabled={loading || currentDarts.length === 0 || !isCurrentUsersTurn}
                            className="rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                          >
                            Board-Visit buchen
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {currentLabels.length > 0 ? (
                          currentLabels.map((label, index) => (
                            <div
                              key={`${label}-${index}`}
                              className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm font-semibold text-amber-100"
                            >
                              {label}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-stone-400">Noch keine Segmente angeklickt.</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex gap-3">
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={visitTotal}
                        onChange={(event) => setVisitTotal(event.target.value)}
                        placeholder="Visit 0-180"
                        disabled={!isCurrentUsersTurn}
                        className="h-11 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                      />
                      <button
                        onClick={() => void submitVisit(Number(visitTotal))}
                        disabled={loading || !visitTotal || !isCurrentUsersTurn}
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
                      >
                        Buchen
                      </button>
                    </div>
                    <label className="mt-4 flex items-center gap-3 text-sm text-stone-300">
                      <input
                        type="checkbox"
                        checked={confirmCheckout}
                        onChange={(event) => setConfirmCheckout(event.target.checked)}
                        disabled={!isCurrentUsersTurn}
                      />
                      Double-Out / Checkout fuer diesen Besuch bestaetigen
                    </label>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => void submitVisit(preset)}
                          disabled={!isCurrentUsersTurn}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-lg font-semibold text-white hover:bg-white/10 disabled:opacity-40"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    {liveState.legWinner !== null && liveState.matchWinner === null ? (
                      <button
                        onClick={() => void nextLeg()}
                        disabled={!canControlLegTransition}
                        className="mt-5 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
                      >
                        Naechstes Leg starten
                      </button>
                    ) : null}
                  </section>
                </div>

                <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="text-2xl font-semibold text-white">Live Historie</h2>
                  <p className="mt-1 text-sm text-stone-400">Die letzten Besuche im geteilten Raum.</p>
                  <div className="mt-5 space-y-3">
                    {liveState.history.length > 0 ? (
                      liveState.history.map((visit, index) => (
                        <div key={`${visit.createdAt}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                          <p className="font-semibold text-white">{visit.playerName}</p>
                          <p className="mt-1 text-stone-300">
                            {visit.total} Punkte · {visit.scoreBefore} → {visit.scoreAfter}
                          </p>
                          <p className="mt-1 text-stone-400">
                            {visit.checkout ? "Checkout" : visit.bust ? "Bust" : "OK"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
                        Noch keine Besuche im Raum.
                      </div>
                    )}
                  </div>
                  {activePlayer ? (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Aktiver Spieler</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{activePlayer.name}</p>
                    </div>
                  ) : null}
                </section>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
