"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LiveBoardPanel, type LiveBoardSegment } from "@/components/live/board-panel";
import {
  LiveHistoryPanel,
  LiveMatchSummaryPanel,
  LiveScoreboardPanel,
  LiveStatsPanel,
} from "@/components/live/match-panels";
import { LiveRoomCreatePanel, LiveRoomJoinPanel } from "@/components/live/room-panels";
import { MobileAppNav } from "@/components/mobile-app-nav";
import {
  addPendingDart,
  clearPendingVisit,
  finalizePendingVisit,
  getPreferredDisplayName,
  normalizeLiveState,
  removePendingDart,
  startRematchLiveMatch,
  startNextLiveLeg,
  type LiveBoardMarker,
  type LiveDart,
  type LiveFinishMode,
  type LiveMatchState,
} from "@/lib/live-match";
import { getCheckoutSuggestions } from "@/lib/checkout-hints";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type LiveMatchResponse = {
  match: {
    room_code: string;
    state: LiveMatchState;
  };
};

const LIVE_ROOM_STORAGE_KEY = "bobos-dart-live-room";

function formatLiveError(error: string) {
  switch (error) {
    case "missing_bearer_token":
    case "missing_user":
      return "Bitte zuerst einloggen.";
    case "missing_room_code":
      return "Bitte zuerst einen Raumcode eingeben.";
    case "match_not_found":
      return "Dieser Raum ist nicht mehr verfuegbar.";
    case "room_full":
      return "Der Raum ist bereits voll.";
    case "not_a_participant":
      return "Du bist aktuell nicht mehr Teil dieses Raums.";
    case "invalid_action":
      return "Diese Aktion wird gerade nicht unterstuetzt.";
    case "missing_service_role_or_supabase_config":
        return "Der Online-Modus ist noch nicht komplett konfiguriert.";
    default:
      if (error.startsWith("invalid_token:")) {
        return "Deine Sitzung ist abgelaufen. Bitte logge dich neu ein.";
      }

      return error.replaceAll("_", " ");
  }
}

function getLivePlayerStats(state: LiveMatchState) {
  return state.players.map((player) => {
    const visits = state.history.filter((entry) => entry.playerName === player.name && entry.result !== "leg-win");
    const dartsThrown = visits.reduce((sum, entry) => sum + entry.darts.length, 0);
    const scoredPoints = visits.reduce((sum, entry) => sum + entry.total, 0);
    const bestVisit = visits.reduce((best, entry) => Math.max(best, entry.total), 0);
    const average = dartsThrown > 0 ? Number(((scoredPoints / dartsThrown) * 3).toFixed(1)) : 0;
    const busts = visits.filter((entry) => entry.bust).length;
    const checkouts = visits.filter((entry) => entry.checkout).length;
    return {
      name: player.name,
      visits: visits.length,
      dartsThrown,
      scoredPoints,
      bestVisit,
      average,
      busts,
      checkouts,
    };
  });
}

function toLiveDart(segment: LiveBoardSegment): LiveDart {
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

function pickEnglishVoice(voices: SpeechSynthesisVoice[]) {
  const preferredLocales = ["en-US", "en-GB", "en-AU", "en-CA"];

  for (const locale of preferredLocales) {
    const exactMatch = voices.find((voice) => voice.lang === locale);
    if (exactMatch) {
      return exactMatch;
    }
  }

  const englishNamedVoice = voices.find((voice) => {
    const lang = voice.lang.toLowerCase();
    const name = voice.name.toLowerCase();
    return lang.startsWith("en") && !name.includes("deutsch") && !name.includes("german");
  });
  if (englishNamedVoice) {
    return englishNamedVoice;
  }

  return voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ?? null;
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
  const lastSpokenCalloutRef = useRef<string | null>(null);

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
      setMessage(`Letzten Raum ${restoredRoomCode} gefunden. Online-Match wird wiederhergestellt...`);
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
      setMessage("Kurz Geduld, der letzte Wurf wird noch synchronisiert.");
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
      setMessage("Die Verbindung zum Online-Match ist gerade unterbrochen.");
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
    setMessage("Einladungslink kopiert.");
  }

  async function reconnectToRoom() {
    if (!liveRoomCode) {
      return;
    }

    setMessage("Online-Match wird neu verbunden...");
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
  const canControlRematch = Boolean(
    liveState &&
      session &&
      liveState.matchWinner !== null &&
      currentUserSeat >= 0 &&
      (liveState.matchWinner === currentUserSeat || liveState.players[0]?.profileId === session.user.id),
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

  async function handleBoardSegment(segment: LiveBoardSegment) {
    if (!liveState) {
      return;
    }

    if (!isCurrentUsersTurn) {
      setMessage("Du kannst nur werfen, wenn du selbst dran bist.");
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
      setMessage("Du kannst nur werfen, wenn du selbst dran bist.");
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

  async function handleRematch() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    const nextState = startRematchLiveMatch(liveState);
    await pushRoomState(nextState, "rematch");
  }

  const historyHeading = liveState?.bullOff.enabled && !liveState.bullOff.completed
    ? `Live Historie - ${currentPlayer?.name ?? "Niemand"} wirft Bull-Off`
    : `Live Historie - ${currentPlayer?.name ?? "Niemand"} ist dran!`;
  const boardHeading = liveState?.bullOff.enabled && !liveState.bullOff.completed
    ? `${currentPlayer?.name ?? "Niemand"} wirft Bull-Off`
    : `${currentPlayer?.name ?? "Niemand"} ist dran${pendingLabels.length > 0 ? ` - ${pendingLabels.join(", ")}` : ""}`;
  const livePlayerStats = useMemo(() => (liveState ? getLivePlayerStats(liveState) : []), [liveState]);
  const cloudSyncPending = Boolean(
    liveState &&
      liveState.matchWinner !== null &&
      liveState.players.some(
        (player) =>
          player.joined &&
          player.profileId &&
          !(liveState.cloudSync.persistedOwnerIds ?? []).includes(player.profileId),
      ),
  );
  const currentLiveStats = useMemo(
    () => (currentPlayer ? livePlayerStats.find((entry) => entry.name === currentPlayer.name) ?? null : null),
    [currentPlayer, livePlayerStats],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const callout = liveState?.lastCallout?.trim();
    if (!callout) {
      return;
    }

    if (lastSpokenCalloutRef.current === callout) {
      return;
    }

    lastSpokenCalloutRef.current = callout;
    const utterance = new SpeechSynthesisUtterance(callout);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = pickEnglishVoice(voices);
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [liveState?.lastCallout]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-3 py-4 pb-28 text-stone-100 sm:px-4 sm:py-6 sm:pb-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Online Match</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Gemeinsam online spielen</h1>
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
              <LiveRoomCreatePanel
                createOpen={createOpen}
                displayName={displayName}
                mode={mode}
                finishMode={finishMode}
                bullOffEnabled={bullOffEnabled}
                legsToWin={legsToWin}
                setsToWin={setsToWin}
                maxPlayers={maxPlayers}
                loading={loading}
                onToggle={() => setCreateOpen((prev) => !prev)}
                onDisplayNameChange={setDisplayName}
                onModeChange={setMode}
                onFinishModeChange={setFinishMode}
                onBullOffToggle={() => setBullOffEnabled((prev) => !prev)}
                onLegsToWinChange={setLegsToWin}
                onSetsToWinChange={setSetsToWin}
                onMaxPlayersChange={setMaxPlayers}
                onCreate={() => void createRoom()}
              />

              <LiveRoomJoinPanel
                joinOpen={joinOpen}
                roomCodeInput={roomCodeInput}
                liveRoomCode={liveRoomCode}
                loading={loading}
                message={message}
                onToggle={() => setJoinOpen((prev) => !prev)}
                onRoomCodeChange={setRoomCodeInput}
                onJoin={() => void joinRoom()}
                onCopyRoomCode={() => void copyRoomCode()}
                onCopyRoomLink={() => void copyRoomLink()}
                onReconnect={() => void reconnectToRoom()}
              />
            </section>

            {liveState ? (
              <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <LiveScoreboardPanel
                    liveState={liveState}
                    currentPlayerIndex={currentPlayerIndex}
                    currentUserId={session.user.id}
                    connectionState={connectionState}
                    connectedNames={connectedNames}
                    isCurrentUsersTurn={isCurrentUsersTurn}
                    turnStatus={turnStatus}
                    onRefresh={() => void fetchMatch(liveRoomCode)}
                    cloudSyncPending={cloudSyncPending}
                  />

                  <LiveStatsPanel
                    currentLiveStats={currentLiveStats}
                    livePlayerStats={livePlayerStats}
                    currentPlayerName={currentPlayer?.name ?? null}
                  />
                  <LiveBoardPanel
                    liveState={liveState}
                    boardHeading={boardHeading}
                    currentVisitTotal={currentVisitTotal}
                    compactVisitText={compactVisitText}
                    calloutText={liveState.lastCallout}
                    isCurrentUsersTurn={isCurrentUsersTurn}
                    loading={loading}
                    boardMarkers={boardMarkers}
                    pendingLabels={pendingLabels}
                    canControlLegTransition={canControlLegTransition}
                    checkoutHints={checkoutHints}
                    currentPlayerName={currentPlayer?.name ?? null}
                    onSegmentSelect={handleBoardSegment}
                    onMiss={() => void handleMiss()}
                    onRemoveLast={() => void handleRemoveLast()}
                    onClearVisit={() => void handleClearVisit()}
                    onFinishVisit={() => void handleFinishVisit()}
                    onNextLeg={() => void handleNextLeg()}
                  />

                  {liveState.matchWinner !== null ? (
                    <LiveMatchSummaryPanel
                      liveState={liveState}
                      playerStats={livePlayerStats}
                      canControlRematch={canControlRematch}
                      loading={loading}
                      onRematch={() => void handleRematch()}
                    />
                  ) : null}

                </div>

                <LiveHistoryPanel
                  heading={historyHeading}
                  historyOpen={historyOpen}
                  history={liveState.history}
                  onToggle={() => setHistoryOpen((prev) => !prev)}
                />
              </section>
            ) : null}
          </>
        )}
      </div>
      {session ? <MobileAppNav /> : null}
    </main>
  );
}
