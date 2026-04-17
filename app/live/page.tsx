"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MobileAppNav } from "@/components/mobile-app-nav";
import {
  addPendingDart,
  clearPendingVisit,
  finalizePendingVisit,
  getPreferredDisplayName,
  normalizeLiveState,
  removePendingDart,
  startNextLiveLeg,
  type LiveBoardMarker,
  type LiveDart,
  type LiveFinishMode,
  type LiveMatchState,
  type LiveSegmentRing,
} from "@/lib/live-match";
import { getCheckoutSuggestions } from "@/lib/checkout-hints";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type LiveMatchResponse = {
  match: {
    room_code: string;
    state: LiveMatchState;
  };
};

type Segment = {
  label: string;
  score: number;
  number: number;
  multiplier: 0 | 1 | 2 | 3;
  ring: LiveSegmentRing;
  marker: LiveBoardMarker | null;
};

const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const LIVE_ROOM_STORAGE_KEY = "bobos-dart-live-room";
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

function createMarker(radius: number, angleDeg: number, label: string, ring: LiveSegmentRing): LiveBoardMarker {
  const point = polarToCartesian(radius, angleDeg);
  return {
    x: point.x,
    y: point.y,
    label,
    ring,
  };
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

function markerColorForRing(ring: LiveSegmentRing) {
  if (ring === "miss") {
    return "#6b7280";
  }

  return "#6b7280";
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

function formatLiveError(error: string) {
  switch (error) {
    case "missing_bearer_token":
    case "missing_user":
      return "Bitte zuerst einloggen.";
    case "missing_room_code":
      return "Bitte zuerst einen Raumcode eingeben.";
    case "match_not_found":
      return "Dieser Raum existiert nicht mehr oder wurde geloescht.";
    case "room_full":
      return "Der Raum ist bereits voll.";
    case "not_a_participant":
      return "Du gehoerst aktuell nicht zu diesem Raum.";
    case "invalid_action":
      return "Diese Aktion wird gerade nicht unterstuetzt.";
    case "missing_service_role_or_supabase_config":
      return "Die Live-Cloud ist noch nicht fertig konfiguriert.";
    default:
      if (error.startsWith("invalid_token:")) {
        return "Deine Sitzung ist abgelaufen. Bitte logge dich neu ein.";
      }

      return error.replaceAll("_", " ");
  }
}

function LiveDartboard({
  onSegmentSelect,
  disabled,
  markers,
  loading,
}: {
  onSegmentSelect: (segment: Segment) => void;
  disabled: boolean;
  markers: LiveBoardMarker[];
  loading: boolean;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<Segment | null>(null);

  return (
    <div className={`rounded-[1.5rem] border border-white/10 bg-black/20 p-3 transition ${disabled ? "opacity-45" : ""}`}>
      <div className="mb-3 flex items-center justify-end gap-3">
        {hoveredSegment ? (
          <div className="min-h-[3rem] min-w-[8.5rem] rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-amber-100">Ziel</p>
            <p className="whitespace-nowrap text-sm font-semibold text-white">
              {hoveredSegment.label} · {hoveredSegment.score}
            </p>
          </div>
        ) : (
          <div className="flex min-h-[3rem] min-w-[8.5rem] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-center text-[11px] uppercase tracking-[0.22em] text-stone-300 whitespace-nowrap">
            Hover + Klick
          </div>
        )}
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 400 400"
          className={`mx-auto w-full max-w-[28rem] drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)] ${disabled ? "pointer-events-none" : ""}`}
        >
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
                segment: {
                  label: `D${value}`,
                  score: value * 2,
                  number: value,
                  multiplier: 2,
                  ring: "double",
                  marker: createMarker((BOARD_RADIUS.doubleInner + BOARD_RADIUS.doubleOuter) / 2, midAngle, `D${value}`, "double"),
                },
              },
              {
                key: `outer-single-${value}`,
                fill: singleColor,
                path: describeSlice(BOARD_RADIUS.tripleOuter, BOARD_RADIUS.doubleInner, startAngle, endAngle),
                segment: {
                  label: `S${value}`,
                  score: value,
                  number: value,
                  multiplier: 1,
                  ring: "single-outer",
                  marker: createMarker((BOARD_RADIUS.tripleOuter + BOARD_RADIUS.doubleInner) / 2, midAngle, `S${value}`, "single-outer"),
                },
              },
              {
                key: `triple-${value}`,
                fill: doubleTripleColor,
                path: describeSlice(BOARD_RADIUS.tripleInner, BOARD_RADIUS.tripleOuter, startAngle, endAngle),
                segment: {
                  label: `T${value}`,
                  score: value * 3,
                  number: value,
                  multiplier: 3,
                  ring: "triple",
                  marker: createMarker((BOARD_RADIUS.tripleInner + BOARD_RADIUS.tripleOuter) / 2, midAngle, `T${value}`, "triple"),
                },
              },
              {
                key: `inner-single-${value}`,
                fill: singleColor,
                path: describeSlice(BOARD_RADIUS.bullOuter, BOARD_RADIUS.tripleInner, startAngle, endAngle),
                segment: {
                  label: `S${value}`,
                  score: value,
                  number: value,
                  multiplier: 1,
                  ring: "single-inner",
                  marker: createMarker((BOARD_RADIUS.bullOuter + BOARD_RADIUS.tripleInner) / 2, midAngle, `S${value}`, "single-inner"),
                },
              },
            ];

            return (
              <g key={value}>
                {segments.map(({ key, fill, path, segment }) => (
                  <g
                    key={key}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={segment.label}
                    onClick={() => !disabled && onSegmentSelect(segment)}
                    onKeyDown={(event) => !disabled && handleBoardKeyDown(event, onSegmentSelect, segment)}
                    className="cursor-pointer outline-none"
                  >
                    <path
                      d={path}
                      fill={fill}
                      stroke="#0a0a0a"
                      strokeWidth="1.5"
                      onMouseEnter={() => !disabled && setHoveredSegment(segment)}
                      onMouseLeave={() => setHoveredSegment((current) => (current?.label === segment.label ? null : current))}
                      onFocus={() => !disabled && setHoveredSegment(segment)}
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
            tabIndex={disabled ? -1 : 0}
            aria-label="Outer Bull"
            onClick={() =>
              !disabled &&
              onSegmentSelect({
                label: "Outer Bull",
                score: 25,
                number: 25,
                multiplier: 1,
                ring: "outer-bull",
                marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
              })
            }
            onKeyDown={(event) =>
              !disabled &&
              handleBoardKeyDown(event, onSegmentSelect, {
                label: "Outer Bull",
                score: 25,
                number: 25,
                multiplier: 1,
                ring: "outer-bull",
                marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
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
              onMouseEnter={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Outer Bull",
                  score: 25,
                  number: 25,
                  multiplier: 1,
                  ring: "outer-bull",
                  marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
                })
              }
              onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
              onFocus={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Outer Bull",
                  score: 25,
                  number: 25,
                  multiplier: 1,
                  ring: "outer-bull",
                  marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
                })
              }
              onBlur={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
              className="transition duration-150 hover:brightness-125 focus:brightness-125"
            />
          </g>
          <g
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Bull"
            onClick={() =>
              !disabled &&
              onSegmentSelect({
                label: "Bull",
                score: 50,
                number: 25,
                multiplier: 2,
                ring: "bull",
                marker: createMarker(8, 0, "Bull", "bull"),
              })
            }
            onKeyDown={(event) =>
              !disabled &&
              handleBoardKeyDown(event, onSegmentSelect, {
                label: "Bull",
                score: 50,
                number: 25,
                multiplier: 2,
                ring: "bull",
                marker: createMarker(8, 0, "Bull", "bull"),
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
              onMouseEnter={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Bull",
                  score: 50,
                  number: 25,
                  multiplier: 2,
                  ring: "bull",
                  marker: createMarker(8, 0, "Bull", "bull"),
                })
              }
              onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
              onFocus={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Bull",
                  score: 50,
                  number: 25,
                  multiplier: 2,
                  ring: "bull",
                  marker: createMarker(8, 0, "Bull", "bull"),
                })
              }
              onBlur={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
              className="transition duration-150 hover:brightness-125 focus:brightness-125"
            />
          </g>

          {markers.map((marker, index) =>
            marker.ring === "miss" || marker.x < 0 || marker.y < 0 ? null : (
              <g key={`${marker.label}-${index}`}>
                <line
                  x1={marker.x - 7}
                  y1={marker.y - 7}
                  x2={marker.x + 7}
                  y2={marker.y + 7}
                  stroke={markerColorForRing(marker.ring)}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <line
                  x1={marker.x + 7}
                  y1={marker.y - 7}
                  x2={marker.x - 7}
                  y2={marker.y + 7}
                  stroke={markerColorForRing(marker.ring)}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>
            ),
          )}
        </svg>

        {disabled ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs uppercase tracking-[0.22em] text-stone-200">
              {loading ? "Synchronisiert..." : "Warte auf deinen Zug"}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function toLiveDart(segment: Segment): LiveDart {
  return {
    label: segment.label,
    score: segment.score,
    number: segment.number,
    multiplier: segment.multiplier,
    ring: segment.ring,
    marker: segment.marker,
  };
}

function missDart(): LiveDart {
  return {
    label: "Miss",
    score: 0,
    number: 0,
    multiplier: 0,
    ring: "miss",
    marker: null,
  };
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
  const [finishMode, setFinishMode] = useState<LiveFinishMode>("double");
  const [bullOffEnabled, setBullOffEnabled] = useState(true);
  const [legsToWin, setLegsToWin] = useState(3);
  const [setsToWin, setSetsToWin] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectedNames, setConnectedNames] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(true);
  const [joinOpen, setJoinOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [connectionState, setConnectionState] = useState<"online" | "offline" | "connecting">(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "connecting",
  );
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";
  const liveChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateConnectionState = () => {
      setConnectionState(window.navigator.onLine ? "connecting" : "offline");
    };

    updateConnectionState();
    window.addEventListener("online", updateConnectionState);
    window.addEventListener("offline", updateConnectionState);

    return () => {
      window.removeEventListener("online", updateConnectionState);
      window.removeEventListener("offline", updateConnectionState);
    };
  }, []);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (liveRoomCode) {
      window.localStorage.setItem(LIVE_ROOM_STORAGE_KEY, liveRoomCode);
      return;
    }

    window.localStorage.removeItem(LIVE_ROOM_STORAGE_KEY);
  }, [liveRoomCode]);

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
      setConnectionState("offline");
      const nextError = "error" in result && result.error ? result.error : "match_not_found";
      setMessage(formatLiveError(nextError));
      if (nextError === "match_not_found") {
        setLiveRoomCode("");
        setLiveState(null);
      }
      return;
    }

    setLiveRoomCode(result.match.room_code);
    setLiveState(normalizeLiveState(result.match.state));
    setConnectionState("online");
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

  useEffect(() => {
    if (typeof window === "undefined" || !session || liveRoomCode) {
      return;
    }

    const restoredRoomCode = window.localStorage.getItem(LIVE_ROOM_STORAGE_KEY);
    if (!restoredRoomCode) {
      return;
    }

    setRoomCodeInput(restoredRoomCode);
    setMessage(`Letzten Raum ${restoredRoomCode} gefunden. Raum wird wieder geladen...`);
    void fetchMatch(restoredRoomCode);
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
          setConnectionState("online");
          await channel.track({
            name: displayName,
            online_at: new Date().toISOString(),
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionState("offline");
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
    if (requestInFlightRef.current) {
      setMessage("Bitte kurz warten, der letzte Spielzug wird noch synchronisiert.");
      return null;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("Bitte zuerst einloggen.");
      return null;
    }

    requestInFlightRef.current = true;
    setLoading(true);
    setMessage("");
    setConnectionState((current) => (current === "offline" ? "offline" : "connecting"));

    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as LiveMatchResponse | { error: string };

      if (!response.ok || !("match" in result)) {
        const nextError = "error" in result && result.error ? result.error : "update_failed";
        setMessage(formatLiveError(nextError));
        setConnectionState("offline");
        return null;
      }

      const normalized = normalizeLiveState(result.match.state);
      setLiveRoomCode(result.match.room_code);
      setLiveState(normalized);
      setConnectionState("online");
      return {
        room_code: result.match.room_code,
        state: normalized,
      };
    } catch {
      setMessage("Die Verbindung zum Live-Raum ist gerade unterbrochen.");
      setConnectionState("offline");
      return null;
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function pushRoomState(nextState: LiveMatchState, reason: string) {
    if (!liveRoomCode) {
      return;
    }

    setLiveState(nextState);
    const result = await callLiveApi({
      action: "update",
      roomCode: liveRoomCode,
      state: nextState,
    });

    if (result) {
      await broadcastRefresh(liveRoomCode, reason);
      return;
    }

    await fetchMatch(liveRoomCode);
  }

  async function createRoom() {
    const match = await callLiveApi({
      action: "create",
      mode,
      finishMode,
      legsToWin,
      setsToWin,
      maxPlayers,
      displayName,
      bullOffEnabled,
    });

    if (match?.room_code) {
      setCreateOpen(false);
      setJoinOpen(false);
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
      setJoinOpen(false);
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

  async function reconnectToRoom() {
    if (!liveRoomCode) {
      return;
    }

    setMessage("Live-Raum wird neu verbunden...");
    await fetchMatch(liveRoomCode);
  }

  const currentPlayerIndex = useMemo(() => {
    if (!liveState) {
      return -1;
    }

    if (liveState.bullOff.enabled && !liveState.bullOff.completed) {
      return liveState.bullOff.currentPlayerIndex ?? liveState.activePlayer;
    }

    return liveState.activePlayer;
  }, [liveState]);

  const currentPlayer = useMemo(
    () => (liveState && currentPlayerIndex >= 0 ? liveState.players[currentPlayerIndex] : null),
    [currentPlayerIndex, liveState],
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
      currentPlayerIndex === currentUserSeat,
  );

  const canControlLegTransition = Boolean(
    liveState &&
      session &&
      liveState.legWinner !== null &&
      liveState.matchWinner === null &&
      currentUserSeat >= 0 &&
      (liveState.legWinner === currentUserSeat || liveState.players[0]?.profileId === session.user.id),
  );

  const pendingVisit = liveState?.pendingVisit;
  const pendingLabels = pendingVisit?.darts.map((dart) => dart.label) ?? [];
  const currentVisitTotal = pendingVisit?.darts.reduce((sum, dart) => sum + dart.score, 0) ?? 0;
  const compactVisitText = pendingLabels.length > 0 ? pendingLabels.join(", ") : "Noch kein Dart";
  const checkoutHints = useMemo(() => {
    if (!liveState || !currentPlayer || (liveState.bullOff.enabled && !liveState.bullOff.completed)) {
      return [];
    }

    return getCheckoutSuggestions(currentPlayer.score, liveState.finishMode);
  }, [currentPlayer, liveState]);
  const boardMarkers = useMemo(() => {
    if (!liveState) {
      return [] as LiveBoardMarker[];
    }

    if (liveState.bullOff.enabled && !liveState.bullOff.completed) {
      return liveState.bullOff.attempts
        .map((attempt) => attempt.dart.marker)
        .filter((marker): marker is LiveBoardMarker => Boolean(marker));
    }

    return (liveState.pendingVisit?.darts ?? [])
      .map((dart) => dart.marker)
      .filter((marker): marker is LiveBoardMarker => Boolean(marker));
  }, [liveState]);

  const turnStatus = !liveState
    ? ""
    : currentUserSeat < 0
      ? "Du bist nicht als Spieler eingetragen."
      : isCurrentUsersTurn
        ? liveState.bullOff.enabled && !liveState.bullOff.completed
          ? "Du wirfst fuer das Bull-Off."
          : "Du bist dran."
        : currentPlayer
          ? liveState.bullOff.enabled && !liveState.bullOff.completed
            ? `${currentPlayer.name} wirft gerade fuer das Bull-Off.`
            : `${currentPlayer.name} ist gerade am Zug.`
          : "Warte auf den naechsten Spieler.";

  async function handleBoardSegment(segment: Segment) {
    if (!liveState) {
      return;
    }

    if (!isCurrentUsersTurn) {
      setMessage("Du kannst nur klicken, wenn du gerade am Zug bist.");
      return;
    }

    const nextState = addPendingDart(liveState, toLiveDart(segment));
    await pushRoomState(nextState, "dart");
  }

  async function handleMiss() {
    if (!liveState) {
      return;
    }

    if (!isCurrentUsersTurn) {
      setMessage("Du kannst nur klicken, wenn du gerade am Zug bist.");
      return;
    }

    const nextState = addPendingDart(liveState, missDart());
    await pushRoomState(nextState, "miss");
  }

  async function handleRemoveLast() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    const nextState = removePendingDart(liveState);
    await pushRoomState(nextState, "undo_dart");
  }

  async function handleClearVisit() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    const nextState = clearPendingVisit(liveState);
    await pushRoomState(nextState, "clear_visit");
  }

  async function handleFinishVisit() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    const nextState = finalizePendingVisit(liveState);
    await pushRoomState(nextState, "finalize_visit");
  }

  async function handleNextLeg() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    const nextState = startNextLiveLeg(liveState);
    await pushRoomState(nextState, "next_leg");
  }

  const historyHeading = liveState?.bullOff.enabled && !liveState.bullOff.completed
    ? `Live Historie - ${currentPlayer?.name ?? "Niemand"} wirft Bull-Off`
    : `Live Historie - ${currentPlayer?.name ?? "Niemand"} ist dran!`;
  const boardHeading = liveState?.bullOff.enabled && !liveState.bullOff.completed
    ? `${currentPlayer?.name ?? "Niemand"} wirft Bull-Off`
    : `${currentPlayer?.name ?? "Niemand"} ist dran${pendingLabels.length > 0 ? ` - ${pendingLabels.join(", ")}` : ""}`;
  const playerStatusLine = `${connectedNames.length > 0 ? connectedNames.join(", ") : "Noch keine aktiven Verbindungen"}${isCurrentUsersTurn ? " · Du bist dran" : ""}`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-3 py-4 pb-28 text-stone-100 sm:px-4 sm:py-6 sm:pb-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Shared Match</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Gemeinsames Live-Match</h1>
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
            Bitte zuerst in der Haupt-App einloggen und dann hierher zurueckkommen.
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <button
                  onClick={() => setCreateOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <h2 className="text-xl font-semibold text-white">Raum erstellen</h2>
                  <span className="text-sm text-stone-400">{createOpen ? "Einklappen" : "Ausklappen"}</span>
                </button>

                {createOpen ? <div className="mt-4 space-y-3">
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Dein Anzeigename"
                    className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setMode(301)}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold ${mode === 301 ? "bg-amber-300 text-black" : "border border-white/10 bg-black/20 text-white"}`}
                    >
                      301
                    </button>
                    <button
                      onClick={() => setMode(501)}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold ${mode === 501 ? "bg-emerald-400 text-black" : "border border-white/10 bg-black/20 text-white"}`}
                    >
                      501
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["single", "double", "master"] as LiveFinishMode[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => setFinishMode(option)}
                        className={`rounded-2xl px-3 py-3 text-xs font-semibold uppercase tracking-[0.18em] ${
                          finishMode === option
                            ? "bg-white text-black"
                            : "border border-white/10 bg-black/20 text-white"
                        }`}
                      >
                        {option === "single" ? "Single Out" : option === "double" ? "Double Out" : "Masters Out"}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setBullOffEnabled((prev) => !prev)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
                      bullOffEnabled
                        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                        : "border-white/10 bg-black/20 text-stone-300"
                    }`}
                  >
                    {bullOffEnabled ? "Bull-Out aktiv fuer den Startspieler" : "Startspieler normal festlegen"}
                  </button>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      value={legsToWin}
                      onChange={(event) => setLegsToWin(Number(event.target.value))}
                      className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white"
                    >
                      {[2, 3, 5].map((value) => (
                        <option key={value} value={value}>
                          Legs: {value}
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
                          Saetze: {value}
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
                </div> : null}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <button
                  onClick={() => setJoinOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <h2 className="text-xl font-semibold text-white">Raum beitreten</h2>
                  <span className="text-sm text-stone-400">{joinOpen ? "Einklappen" : "Ausklappen"}</span>
                </button>
                {joinOpen ? <div className="mt-4 flex gap-2">
                  <input
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                    placeholder="Raumcode"
                    className="h-11 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                  />
                  <button
                    onClick={() => void joinRoom()}
                    disabled={loading}
                    className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    Join
                  </button>
                </div> : null}
                {liveRoomCode ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Aktueller Raumcode</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{liveRoomCode}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                      <button
                        onClick={() => void reconnectToRoom()}
                        disabled={loading}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Neu verbinden
                      </button>
                    </div>
                  </div>
                ) : null}
                {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
              </div>
            </section>

            {liveState ? (
              <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-white">Synchronisierter Spielstand</h2>
                        <p className="mt-1 text-sm text-stone-400">{liveState.statusText}</p>
                      </div>
                      <button
                        onClick={() => void fetchMatch(liveRoomCode)}
                        className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold"
                      >
                        Refresh
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 grid-cols-2 xl:grid-cols-4">
                      {liveState.players.map((player, index) => {
                        const isActive = currentPlayerIndex === index && liveState.matchWinner === null;
                        const isMe = player.profileId === session.user.id;

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
                            <p className="mt-2 text-4xl font-semibold leading-none text-white">
                              {player.joined ? player.score : "—"}
                            </p>
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
                          {connectionState === "online"
                            ? "Online"
                            : connectionState === "connecting"
                              ? "Verbindet"
                              : "Offline"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-stone-300">
                        {connectionState === "online"
                          ? "Der Raum ist synchronisiert."
                          : connectionState === "connecting"
                            ? "Der Raum wird gerade erneut verbunden oder aktualisiert."
                            : "Der Raum ist gerade nicht erreichbar. Nutze bei Bedarf den Neu-verbinden-Button."}
                      </p>
                    </div>

                    <div
                      className={`mt-4 rounded-2xl border p-3 ${
                        isCurrentUsersTurn ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Gerade online im Raum</p>
                          <p className="mt-1 truncate text-sm text-stone-300">{playerStatusLine}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Dein Status</p>
                          <p className={`mt-1 text-sm font-semibold ${isCurrentUsersTurn ? "text-emerald-200" : "text-white"}`}>
                            {turnStatus}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-white">{boardHeading}</h2>
                        <p className="mt-1 text-sm text-stone-400">
                          {liveState.bullOff.enabled && !liveState.bullOff.completed
                            ? "Ein Wurf pro Spieler entscheidet ueber den Start."
                            : `${currentVisitTotal} Punkte · ${compactVisitText}`}
                        </p>
                      </div>
                      <button
                        onClick={() => void handleMiss()}
                        disabled={!isCurrentUsersTurn || loading}
                        className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-40"
                      >
                        Miss
                      </button>
                    </div>

                    <div className="mt-4">
                      <LiveDartboard
                        onSegmentSelect={handleBoardSegment}
                        disabled={!isCurrentUsersTurn || loading}
                        markers={boardMarkers}
                        loading={loading}
                      />
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap gap-2">
                        {pendingLabels.length > 0 ? (
                          pendingLabels.map((label, index) => (
                            <div
                              key={`${label}-${index}`}
                              className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm font-semibold text-amber-100"
                            >
                              {label}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-stone-400">
                            {liveState.bullOff.enabled && !liveState.bullOff.completed
                              ? "Bull-Off wartet auf den naechsten Wurf."
                              : "Noch keine Darts geklickt."}
                          </p>
                        )}
                      </div>
                      {!liveState.bullOff.enabled || liveState.bullOff.completed ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => void handleRemoveLast()}
                            disabled={!isCurrentUsersTurn || pendingLabels.length === 0}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            Letzten Dart entfernen
                          </button>
                          <button
                            onClick={() => void handleClearVisit()}
                            disabled={!isCurrentUsersTurn || pendingLabels.length === 0}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            Board leeren
                          </button>
                          <button
                            onClick={() => void handleFinishVisit()}
                            disabled={!isCurrentUsersTurn || pendingLabels.length === 0}
                            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                          >
                            Zug abschliessen
                          </button>
                        </div>
                      ) : null}

                      {liveState.legWinner !== null && liveState.matchWinner === null ? (
                        <button
                          onClick={() => void handleNextLeg()}
                          disabled={!canControlLegTransition}
                          className="mt-4 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
                        >
                          Naechstes Leg starten
                        </button>
                      ) : null}
                    </div>

                    {checkoutHints.length > 0 ? (
                      <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                          Moegliche Finishes fuer {currentPlayer?.name}
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          {checkoutHints.map((hint) => (
                            <div
                              key={hint}
                              className="rounded-2xl border border-emerald-300/15 bg-black/20 px-3 py-2 text-sm text-emerald-50"
                            >
                              {hint}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                </div>

                <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <button
                    onClick={() => setHistoryOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <h2 className="text-lg font-semibold text-white">{historyHeading}</h2>
                    <span className="text-sm text-stone-400">{historyOpen ? "Einklappen" : "Ausklappen"}</span>
                  </button>
                  {historyOpen ? <div className="mt-4 space-y-2">
                    {liveState.history.length > 0 ? (
                      liveState.history.map((visit, index) => (
                        <div key={`${visit.createdAt}-${index}`} className={`rounded-2xl border p-3 text-sm ${resultStyles(visit.result)}`}>
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold">{visit.playerName}</p>
                            <p className="text-xs opacity-70">{new Date(visit.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          <p className="mt-1 text-xs opacity-85">{visit.note} · {visit.darts.join(", ") || "Ohne Dartdaten"}</p>
                          <p className="mt-2 text-xs opacity-90">
                            {visit.total} Punkte · {visit.scoreBefore} → {visit.scoreAfter}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
                        Noch keine Besuche im Raum.
                      </div>
                    )}
                  </div> : null}
                </section>
              </section>
            ) : null}
          </>
        )}
      </div>
      {session ? <MobileAppNav /> : null}
    </main>
  );
}
