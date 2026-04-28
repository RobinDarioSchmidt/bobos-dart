"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LiveBoardPanel, type LiveBoardSegment } from "@/components/live/board-panel";
import {
  LiveCelebrationPanel,
  LiveHistoryPanel,
  LiveMatchSummaryPanel,
} from "@/components/live/match-panels";
import { PlayerRivalryDialog, type PlayerPresenceSummary } from "@/components/player-rivalry-dialog";
import { LiveRoomCreatePanel, LiveRoomJoinPanel, LiveRoomStatusPanel } from "@/components/live/room-panels";
import {
  getPreferredDisplayName,
  isLiveDeviceLockActive,
  normalizeLiveState,
  type LiveBoardMarker,
  type LiveDart,
  type LiveEntryMode,
  type LiveFinishMode,
  type LiveMatchState,
} from "@/lib/live-match";
import {
  LIVE_AUDIO_MODE_STORAGE_KEY,
  playLiveDartCallout,
  playLiveVisitCallout,
  type LiveAudioMode,
} from "@/lib/live-audio";
import { getCheckoutSuggestions } from "@/lib/checkout-hints";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type LiveMatchResponse = {
  match: {
    owner_id: string;
    room_code: string;
    state: LiveMatchState;
  };
};

type OpenLiveRoom = {
  room_code: string;
  owner_id: string;
  host_name: string;
  mode: 301 | 501;
  finish_mode: LiveFinishMode;
  joined_players: number;
  max_players: number;
  status_text: string;
  current_player_name: string;
  created_at: string;
  players: Array<{
    name: string;
    is_active: boolean;
  }>;
};

type CloudPlayersResponse = {
  error?: string;
  players?: PlayerPresenceSummary[];
};

const LIVE_ROOM_STORAGE_KEY = "bobos-dart-live-room";
const LIVE_ROOM_SNAPSHOT_KEY = "bobos-dart-live-room-snapshot";

type LiveRoomSnapshot = {
  roomCode: string;
  ownerId: string;
  state: LiveMatchState;
  savedAt: string;
};

function getOpenRoomsRefreshDelay(failureCount: number) {
  if (failureCount <= 0) {
    return 20_000;
  }

  return Math.min(60_000, 20_000 + failureCount * 10_000);
}

function getMatchRefreshDelay(failureCount: number) {
  if (failureCount <= 0) {
    return 2_000;
  }

  return Math.min(15_000, 2_000 * 2 ** Math.min(failureCount, 3));
}

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
    case "only_host_can_close_room":
      return "Nur der Host kann den Raum schliessen.";
    case "stale_state":
      return "Der Raum wurde gerade von jemand anderem aktualisiert. Wir laden den aktuellen Stand neu.";
    case "not_your_turn":
      return "Du kannst gerade nur werfen, wenn du selbst dran bist.";
    case "next_leg_not_allowed":
      return "Das naechste Leg kann gerade nur vom Sieger oder Host gestartet werden.";
    case "rematch_not_allowed":
      return "Das Rematch kann gerade nur vom Matchsieger oder Host gestartet werden.";
    case "missing_service_role_or_supabase_config":
      return "Der Online-Modus ist noch nicht komplett konfiguriert.";
    default:
      if (error.startsWith("device_already_active:")) {
        const activeDeviceLabel = error.slice("device_already_active:".length) || "einem anderen Geraet";
        return `Dieses Konto wird in diesem Raum schon von ${activeDeviceLabel} gesteuert.`;
      }

      if (error.startsWith("invalid_token:")) {
        return "Deine Sitzung ist abgelaufen. Bitte logge dich neu ein.";
      }

      return error.replaceAll("_", " ");
  }
}

function getLivePlayerStats(state: LiveMatchState) {
  return state.players.filter((player) => player.joined).map((player) => {
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

function createDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDeviceLabel() {
  if (typeof navigator === "undefined") {
    return "Dieses Geraet";
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const platform = userAgent.includes("android")
    ? "Android"
    : userAgent.includes("iphone") || userAgent.includes("ipad")
      ? "iPhone"
      : userAgent.includes("windows")
        ? "Windows"
        : userAgent.includes("mac os")
          ? "Mac"
          : "Geraet";
  const browser = userAgent.includes("opr/") || userAgent.includes("opera")
    ? "Opera"
    : userAgent.includes("edg/")
      ? "Edge"
      : userAgent.includes("firefox")
        ? "Firefox"
        : userAgent.includes("samsungbrowser")
          ? "Samsung Internet"
          : userAgent.includes("chrome")
            ? "Chrome"
            : userAgent.includes("safari")
              ? "Safari"
              : "Browser";

  return `${platform} ${browser}`;
}

export default function LivePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [restoreTargetCode, setRestoreTargetCode] = useState("");
  const [liveRoomCode, setLiveRoomCode] = useState("");
  const [roomOwnerId, setRoomOwnerId] = useState("");
  const [liveState, setLiveState] = useState<LiveMatchState | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenLiveRoom[]>([]);
  const [mode, setMode] = useState<301 | 501>(501);
  const [entryMode, setEntryMode] = useState<LiveEntryMode>("single");
  const [finishMode, setFinishMode] = useState<LiveFinishMode>("double");
  const [bullOffEnabled, setBullOffEnabled] = useState(true);
  const [legsToWin, setLegsToWin] = useState(3);
  const [setsToWin, setSetsToWin] = useState(1);
  const [maxPlayers] = useState(4);
  const [message, setMessage] = useState("");
  const [spectatorMode, setSpectatorMode] = useState(false);
  const [spectatorPrompt, setSpectatorPrompt] = useState<{
    roomCode: string;
    activeDeviceLabel: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringRoom, setRestoringRoom] = useState(false);
  const [playerPresence, setPlayerPresence] = useState<PlayerPresenceSummary[]>([]);
  const [selectedPresencePlayer, setSelectedPresencePlayer] = useState<PlayerPresenceSummary | null>(null);
  const [selectedLivePlayerStats, setSelectedLivePlayerStats] = useState<{
    name: string;
    average: number;
    bestVisit: number;
    misses: number;
    checkouts: number;
  } | null>(null);
  const [connectedNames, setConnectedNames] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [audioMode, setAudioMode] = useState<LiveAudioMode>("visits");
  const [deviceId, setDeviceId] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Dieses Geraet");
  const [connectionState, setConnectionState] = useState<"online" | "offline" | "connecting">(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "connecting",
  );
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";
  const liveChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const requestInFlightRef = useRef(false);
  const deviceClaimInFlightRef = useRef(false);
  const roomFetchInFlightRef = useRef(false);
  const openRoomsFetchInFlightRef = useRef(false);
  const roomFailureCountRef = useRef(0);
  const openRoomsFailureCountRef = useRef(0);
  const roomNotFoundCountRef = useRef(0);
  const lastPlayedVisitRef = useRef<string | null>(null);
  const messageTimeoutRef = useRef<number | null>(null);

  const saveRoomSnapshot = useCallback((snapshot: LiveRoomSnapshot | null) => {
    if (typeof window === "undefined") {
      return;
    }

    if (!snapshot) {
      window.localStorage.removeItem(LIVE_ROOM_SNAPSHOT_KEY);
      return;
    }

    window.localStorage.setItem(LIVE_ROOM_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }, [liveRoomCode]);

  const flashMessage = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
    if (typeof window === "undefined") {
      return;
    }

    if (messageTimeoutRef.current) {
      window.clearTimeout(messageTimeoutRef.current);
    }

    messageTimeoutRef.current = window.setTimeout(() => {
      setMessage((current) => (current === nextMessage ? "" : current));
      messageTimeoutRef.current = null;
    }, 2000);
  }, []);

  const syncRoomCodeInUrl = useCallback((roomCode: string | null) => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set("room", roomCode);
    } else {
      url.searchParams.delete("room");
    }

    const nextPath = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextPath);
  }, []);

  const restoreRoomSnapshot = useCallback((roomCode: string) => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(LIVE_ROOM_SNAPSHOT_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<LiveRoomSnapshot>;
      if (
        typeof parsed.roomCode !== "string" ||
        parsed.roomCode !== roomCode ||
        typeof parsed.ownerId !== "string" ||
        !parsed.state
      ) {
        return null;
      }

      return {
        roomCode: parsed.roomCode,
        ownerId: parsed.ownerId,
        state: normalizeLiveState(parsed.state),
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      } satisfies LiveRoomSnapshot;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = "bobos-dart-live-device-id";
    const storedDeviceId = window.sessionStorage.getItem(storageKey);
    const nextDeviceId = storedDeviceId || createDeviceId();
    window.sessionStorage.setItem(storageKey, nextDeviceId);
    setDeviceId(nextDeviceId);
    setDeviceLabel(getDeviceLabel());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const queryRoomCode = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
    const storedRoomCode = window.localStorage.getItem(LIVE_ROOM_STORAGE_KEY) ?? "";
    const restoreTarget = queryRoomCode || storedRoomCode;
    if (restoreTarget && !liveRoomCode) {
      setRestoreTargetCode(restoreTarget);
      setRestoringRoom(true);
      setRoomCodeInput(restoreTarget);
    }

    const storedMode = window.localStorage.getItem(LIVE_AUDIO_MODE_STORAGE_KEY);
    if (storedMode === "off" || storedMode === "darts" || storedMode === "visits" || storedMode === "all") {
      setAudioMode(storedMode);
    } else if (storedMode === "clips") {
      setAudioMode("visits");
    } else if (storedMode === "speech") {
      setAudioMode("off");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LIVE_AUDIO_MODE_STORAGE_KEY, audioMode);
  }, [audioMode]);

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && messageTimeoutRef.current) {
        window.clearTimeout(messageTimeoutRef.current);
      }
    },
    [],
  );

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

    if (restoreTargetCode) {
      return;
    }

    window.localStorage.removeItem(LIVE_ROOM_STORAGE_KEY);
  }, [liveRoomCode, restoreTargetCode]);

  useEffect(() => {
    if (!liveRoomCode && restoreTargetCode) {
      return;
    }

    syncRoomCodeInUrl(liveRoomCode || null);
  }, [liveRoomCode, restoreTargetCode, syncRoomCodeInUrl]);

  async function getAccessToken() {
    if (!supabase) {
      return null;
    }

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();

    return freshSession?.access_token ?? null;
  }

  const loadOpenRooms = useCallback(async () => {
    if (openRoomsFetchInFlightRef.current || (typeof document !== "undefined" && document.visibilityState !== "visible")) {
      return false;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setOpenRooms([]);
      return false;
    }

    openRoomsFetchInFlightRef.current = true;

    try {
      const response = await fetch("/api/live", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const result = (await response.json()) as { rooms?: OpenLiveRoom[]; error?: string };
      if (!response.ok || result.error) {
        openRoomsFailureCountRef.current += 1;
        return false;
      }

      setOpenRooms(result.rooms ?? []);
      openRoomsFailureCountRef.current = 0;
      return true;
    } catch {
      // Keep the current list until the next successful refresh.
      openRoomsFailureCountRef.current += 1;
      return false;
    } finally {
      openRoomsFetchInFlightRef.current = false;
    }
  }, [liveRoomCode]);

  const loadCloudPlayers = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return false;
    }

    try {
      const response = await fetch("/api/cloud/players", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const result = (await response.json()) as CloudPlayersResponse;
      if (!response.ok) {
        return false;
      }

      setPlayerPresence(result.players ?? []);
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchMatch = useCallback(async (roomCode: string, options?: { silent?: boolean }) => {
    if (roomFetchInFlightRef.current) {
      return false;
    }

    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return false;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      if (!options?.silent) {
        setMessage("Bitte zuerst einloggen.");
      }
      return false;
    }

    roomFetchInFlightRef.current = true;

    try {
      const response = await fetch(`/api/live?roomCode=${encodeURIComponent(roomCode)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const result = (await response.json()) as LiveMatchResponse | { error: string };
      if (!response.ok || !("match" in result)) {
        roomFailureCountRef.current += 1;
        setConnectionState("offline");
        const nextError = "error" in result && result.error ? result.error : "match_not_found";
        if (nextError === "match_not_found") {
          roomNotFoundCountRef.current += 1;
        } else {
          roomNotFoundCountRef.current = 0;
        }
        if (!options?.silent || roomFailureCountRef.current >= 2 || nextError === "match_not_found") {
          setMessage(formatLiveError(nextError));
        }
        if (nextError === "match_not_found" && roomNotFoundCountRef.current >= 3) {
          setLiveRoomCode("");
          setRoomOwnerId("");
          setLiveState(null);
          setRestoreTargetCode("");
          saveRoomSnapshot(null);
          void loadOpenRooms();
        }
        setRestoringRoom(false);
        return false;
      }

      const normalizedState = normalizeLiveState(result.match.state);
      setLiveRoomCode(result.match.room_code);
      setRoomOwnerId(result.match.owner_id);
      setLiveState(normalizedState);
      setRestoreTargetCode(result.match.room_code);
      setConnectionState("online");
      roomFailureCountRef.current = 0;
      roomNotFoundCountRef.current = 0;
      saveRoomSnapshot({
        roomCode: result.match.room_code,
        ownerId: result.match.owner_id,
        state: normalizedState,
        savedAt: new Date().toISOString(),
      });
      setRestoringRoom(false);
      void loadOpenRooms();
      return true;
    } catch {
      roomFailureCountRef.current += 1;
      setConnectionState("offline");
      if (!options?.silent || roomFailureCountRef.current >= 2) {
        setMessage("Die Verbindung zum Online-Match ist gerade unterbrochen.");
      }
      setRestoringRoom(false);
      return false;
    } finally {
      roomFetchInFlightRef.current = false;
    }
  }, [loadOpenRooms, saveRoomSnapshot]);

  useEffect(() => {
    if (!session) {
      setOpenRooms([]);
      return;
    }

    void loadOpenRooms();
    void loadCloudPlayers();
  }, [loadCloudPlayers, loadOpenRooms, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    let timeout: number | null = null;

    const schedule = () => {
      if (!active) {
        return;
      }

      timeout = window.setTimeout(async () => {
        await loadOpenRooms();
        schedule();
      }, getOpenRoomsRefreshDelay(openRoomsFailureCountRef.current));
    };

    schedule();

    return () => {
      active = false;
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [loadOpenRooms, session]);

  useEffect(() => {
    if (!liveRoomCode || !session) {
      return;
    }

    let active = true;
    let timeout: number | null = null;

    const schedule = () => {
      if (!active) {
        return;
      }

      timeout = window.setTimeout(async () => {
        await fetchMatch(liveRoomCode, { silent: true });
        schedule();
      }, getMatchRefreshDelay(roomFailureCountRef.current));
    };

    schedule();

    return () => {
      active = false;
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [fetchMatch, liveRoomCode, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const refreshVisibleData = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void loadOpenRooms();
      if (liveRoomCode) {
        void fetchMatch(liveRoomCode, { silent: true });
      }
    };

    window.addEventListener("focus", refreshVisibleData);
    document.addEventListener("visibilitychange", refreshVisibleData);

    return () => {
      window.removeEventListener("focus", refreshVisibleData);
      document.removeEventListener("visibilitychange", refreshVisibleData);
    };
  }, [fetchMatch, liveRoomCode, loadOpenRooms, session]);

  useEffect(() => {
    if (typeof window === "undefined" || !session || liveRoomCode) {
      return;
    }

    const queryRoomCode = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
    const storedRoomCode = window.localStorage.getItem(LIVE_ROOM_STORAGE_KEY) ?? "";
    const restoredRoomCode = queryRoomCode || storedRoomCode;
    if (!restoredRoomCode) {
      setRestoreTargetCode("");
      setRestoringRoom(false);
      return;
    }

    setRestoreTargetCode(restoredRoomCode);
    setRoomCodeInput(restoredRoomCode);
    const snapshot = restoreRoomSnapshot(restoredRoomCode);
    if (snapshot) {
      setLiveRoomCode(snapshot.roomCode);
      setRoomOwnerId(snapshot.ownerId);
      setLiveState(snapshot.state);
    }
    setMessage(`Letzten Raum ${restoredRoomCode} gefunden. Online-Match wird wiederhergestellt...`);
    void fetchMatch(restoredRoomCode);
  }, [fetchMatch, liveRoomCode, restoreRoomSnapshot, session]);

  const hasRoomRestoreTarget = Boolean(restoringRoom || liveRoomCode || restoreTargetCode);

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

      const result = (await response.json()) as LiveMatchResponse | { error: string } | { closed: true };

      if (!response.ok || !("match" in result)) {
        if ("closed" in result && result.closed) {
          setLiveRoomCode("");
          setRoomOwnerId("");
          setLiveState(null);
          setConnectedNames([]);
          saveRoomSnapshot(null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(LIVE_ROOM_STORAGE_KEY);
          }
        setMessage("Der Raum ist beendet.");
        setConnectionState("online");
        void loadOpenRooms();
        return { closed: true };
      }
        const nextError = "error" in result && result.error ? result.error : "update_failed";
        setMessage(formatLiveError(nextError));
        setConnectionState(nextError === "stale_state" ? "online" : "offline");
        return null;
      }

      const normalized = normalizeLiveState(result.match.state);
      setLiveRoomCode(result.match.room_code);
      setRoomOwnerId(result.match.owner_id);
      setLiveState(normalized);
      saveRoomSnapshot({
        roomCode: result.match.room_code,
        ownerId: result.match.owner_id,
        state: normalized,
        savedAt: new Date().toISOString(),
      });
      setConnectionState("online");
      void loadOpenRooms();
      return {
        owner_id: result.match.owner_id,
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

  const claimDeviceLock = useCallback(async (force = false) => {
    if (!liveRoomCode || !deviceId) {
      return false;
    }

    if (deviceClaimInFlightRef.current || requestInFlightRef.current) {
      return false;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return false;
    }

    deviceClaimInFlightRef.current = true;

    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "claim_device",
          roomCode: liveRoomCode,
          deviceId,
          deviceLabel,
          force,
        }),
      });

      const result = (await response.json()) as LiveMatchResponse | { error: string };
      if (!response.ok || !("match" in result)) {
        const nextError = "error" in result && result.error ? result.error : "";
        if (nextError.startsWith("device_already_active:")) {
          setMessage(formatLiveError(nextError));
        }
        return false;
      }

      setLiveState(normalizeLiveState(result.match.state));
      setRoomOwnerId(result.match.owner_id);
      setLiveRoomCode(result.match.room_code);
      return true;
    } catch {
      // Keep the last known state and retry on the next heartbeat.
      return false;
    } finally {
      deviceClaimInFlightRef.current = false;
    }
  }, [deviceId, deviceLabel, liveRoomCode]);

  async function handleTakeControl() {
    const claimed = await claimDeviceLock(true);
    if (claimed) {
      setMessage("Dieses Geraet steuert den Account jetzt.");
    }
  }

  useEffect(() => {
    if (!liveRoomCode || !session || !deviceId || spectatorMode) {
      return;
    }

    void claimDeviceLock();
    const interval = window.setInterval(() => {
      void claimDeviceLock();
    }, 15_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [claimDeviceLock, deviceId, liveRoomCode, session, spectatorMode]);

  async function performServerLiveAction(
    body:
      | { action: "add_dart"; dart: LiveDart }
      | { action: "remove_dart" }
      | { action: "finalize_visit" }
      | { action: "next_leg" }
      | { action: "rematch" },
    reason: string,
  ) {
    if (!liveRoomCode) {
      return null;
    }

    const result = await callLiveApi({
      ...body,
      roomCode: liveRoomCode,
      deviceId,
    });

    if (result) {
      await broadcastRefresh(liveRoomCode, reason);
      return result.state;
    }

    await fetchMatch(liveRoomCode, { silent: true });
    return null;
  }

  async function createRoom() {
    const match = await callLiveApi({
      action: "create",
      mode,
      entryMode,
      finishMode,
      legsToWin,
      setsToWin,
      maxPlayers,
      displayName,
      bullOffEnabled,
      deviceId,
      deviceLabel,
    });

    if (match?.room_code) {
      setCreateOpen(false);
      setJoinOpen(false);
      await loadOpenRooms();
      await broadcastRefresh(match.room_code, "create");
    }
  }

  async function joinRoom(roomCode = roomCodeInput) {
    if (!roomCode) {
      setMessage("Bitte einen Raumcode eingeben.");
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("Bitte zuerst einloggen.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "join",
          roomCode,
          displayName,
          deviceId,
          deviceLabel,
        }),
      });

      const result = (await response.json()) as LiveMatchResponse | { error: string };
      if (!response.ok || !("match" in result)) {
        const nextError = "error" in result && result.error ? result.error : "join_failed";
        if (nextError.startsWith("device_already_active:")) {
          setSpectatorPrompt({
            roomCode: roomCode.toUpperCase(),
            activeDeviceLabel: nextError.slice("device_already_active:".length) || "einem anderen Geraet",
          });
          return;
        }

        setMessage(formatLiveError(nextError));
        return;
      }

      const normalized = normalizeLiveState(result.match.state);
      setSpectatorMode(false);
      setLiveRoomCode(result.match.room_code);
      setRoomOwnerId(result.match.owner_id);
      setLiveState(normalized);
      setRoomCodeInput(result.match.room_code);
      saveRoomSnapshot({
        roomCode: result.match.room_code,
        ownerId: result.match.owner_id,
        state: normalized,
        savedAt: new Date().toISOString(),
      });
      setJoinOpen(false);
      await loadOpenRooms();
      await broadcastRefresh(result.match.room_code, "join");
    } catch {
      setMessage("Die Verbindung zum Online-Match ist gerade unterbrochen.");
    } finally {
      setLoading(false);
    }
  }

  async function copyRoomCode() {
    if (!liveRoomCode) {
      return;
    }

    await navigator.clipboard.writeText(liveRoomCode);
    flashMessage("Raumcode kopiert.");
  }

  async function copyRoomLink() {
    if (!liveRoomCode) {
      return;
    }

    const url = `${window.location.origin}/live?room=${encodeURIComponent(liveRoomCode)}`;
    await navigator.clipboard.writeText(url);
    flashMessage("Einladungslink kopiert.");
  }

  async function reconnectToRoom() {
    if (!liveRoomCode) {
      return;
    }

    setMessage("Online-Match wird neu verbunden...");
    const reconnected = await fetchMatch(liveRoomCode);
    if (reconnected) {
      setMessage("Online-Match ist wieder verbunden.");
    }
  }

  async function enterSpectatorMode(roomCode: string) {
    setSpectatorPrompt(null);
    setSpectatorMode(true);
    setRoomCodeInput(roomCode);
    setJoinOpen(false);
    setCreateOpen(false);
    const restored = await fetchMatch(roomCode);
    if (restored) {
      flashMessage("Zuschauer-Modus aktiv.");
    }
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
  const livePlayerStats = useMemo(() => (liveState ? getLivePlayerStats(liveState) : []), [liveState]);
  const openPresencePlayer = useCallback(
    (playerName: string, profileId: string | null) => {
      if (profileId && profileId === session?.user.id) {
        const match = livePlayerStats.find((entry) => entry.name === playerName);
        if (match) {
          setSelectedLivePlayerStats({
            name: match.name,
            average: match.average,
            bestVisit: match.bestVisit,
            misses: match.busts,
            checkouts: match.checkouts,
          });
          return;
        }
      }

      const match =
        (profileId ? playerPresence.find((entry) => entry.id === profileId) : null) ??
        playerPresence.find((entry) => entry.displayName.trim().toLowerCase() === playerName.trim().toLowerCase()) ??
        null;

      if (!match) {
        setMessage("Fuer diesen Spieler gibt es noch keine Cloud-Rivalitaet.");
        return;
      }

      setSelectedPresencePlayer(match);
    },
    [livePlayerStats, playerPresence, session?.user.id],
  );
  const activeDeviceLock = useMemo(() => {
    if (!liveState || !session) {
      return null;
    }

    return (
      (liveState.cloudSync.deviceLocks ?? []).find(
        (lock) => lock.profileId === session.user.id && isLiveDeviceLockActive(lock),
      ) ?? null
    );
  }, [liveState, session]);
  const hasDeviceControl = Boolean(deviceId && (!activeDeviceLock || activeDeviceLock.deviceId === deviceId));
  const deviceLockLabel = activeDeviceLock?.deviceLabel ?? null;

  useEffect(() => {
    if (!liveState || !session || !deviceId) {
      return;
    }

    const nextSpectatorMode = Boolean(activeDeviceLock && activeDeviceLock.deviceId !== deviceId);
    setSpectatorMode(nextSpectatorMode);
  }, [activeDeviceLock, deviceId, liveState, session]);

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
      hasDeviceControl &&
      (liveState.legWinner === currentUserSeat || roomOwnerId === session.user.id),
  );
  const canControlRematch = Boolean(
    liveState &&
      session &&
      liveState.matchWinner !== null &&
      currentUserSeat >= 0 &&
      hasDeviceControl &&
      (liveState.matchWinner === currentUserSeat || roomOwnerId === session.user.id),
  );
  const isRoomHost = Boolean(session?.user.id && roomOwnerId && session.user.id === roomOwnerId);
  const joinedPlayerCount = liveState?.players.filter((player) => player.joined).length ?? 0;

  const pendingVisit = liveState?.pendingVisit;
  const pendingLabels = pendingVisit?.darts.map((dart) => dart.label) ?? [];
  const currentVisitTotal = pendingVisit?.darts.reduce((sum, dart) => sum + dart.score, 0) ?? 0;
  const compactVisitText = pendingLabels.length > 0 ? pendingLabels.join(", ") : "Noch kein Dart";
  const boardInputLockedByVisit = Boolean(
    liveState &&
      pendingLabels.length >= 3 &&
      (!liveState.bullOff.enabled || liveState.bullOff.completed),
  );
  const checkoutHints = useMemo(() => {
    if (
      !liveState ||
      !currentPlayer ||
      !currentPlayer.entered ||
      (liveState.bullOff.enabled && !liveState.bullOff.completed)
    ) {
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
      ? "Nicht als Spieler drin"
      : !hasDeviceControl
        ? deviceLockLabel
          ? `${deviceLockLabel} steuert`
          : "Nur Zuschauen"
      : isCurrentUsersTurn
        ? liveState.bullOff.enabled && !liveState.bullOff.completed
          ? "Du wirfst Bull-Off"
          : currentPlayer && !currentPlayer.entered
            ? `Du suchst ${liveState.entryMode === "double" ? "Double In" : "Masters In"}`
          : "Du bist dran"
        : currentPlayer
          ? liveState.bullOff.enabled && !liveState.bullOff.completed
            ? `${currentPlayer.name} wirft Bull-Off`
            : !currentPlayer.entered
              ? `${currentPlayer.name} sucht ${liveState.entryMode === "double" ? "Double In" : "Masters In"}`
            : `${currentPlayer.name} ist dran`
          : "Warte auf den naechsten Spieler";
  const boardDisabledReason = loading
    ? "Synchronisiert..."
    : !hasDeviceControl
      ? "Dieses Geraet schaut zu"
      : boardInputLockedByVisit
        ? "Visit loggen oder korrigieren"
        : "Warte auf deinen Zug";
  const canPlayFromThisDevice = isCurrentUsersTurn && hasDeviceControl;
  const canSelectBoardInput = canPlayFromThisDevice && !boardInputLockedByVisit;
  const isTurnHighlightActive = canPlayFromThisDevice;
  const boardStatusText = !currentPlayer
    ? null
    : liveState?.bullOff.enabled && !liveState.bullOff.completed
      ? `Aktuell: ${currentPlayer.name} wirft Bull-Off`
      : pendingLabels.length >= 3
        ? `Aktuell: ${currentPlayer.name} loggt den Visit`
        : `Aktuell: ${currentPlayer.name} wirft den ${pendingLabels.length + 1}. Dart`;

  async function handleBoardSegment(segment: LiveBoardSegment) {
    if (!liveState) {
      return;
    }

    if (!canSelectBoardInput) {
      setMessage(
        boardInputLockedByVisit
          ? "Bitte erst den Visit loggen oder mit Korrektur anpassen."
          : hasDeviceControl
            ? "Du kannst nur werfen, wenn du selbst dran bist."
            : "Dieses Geraet darf den Account gerade nicht steuern.",
      );
      return;
    }

    const dart = toLiveDart(segment);
    const nextState = await performServerLiveAction({ action: "add_dart", dart }, "dart");
    if (!nextState) {
      return;
    }
    const completedVisit = nextState.history.find((entry) => entry.result !== "leg-win") ?? null;
    const previousVisit = liveState.history.find((entry) => entry.result !== "leg-win") ?? null;
    if (
      (audioMode === "all" || audioMode === "darts") &&
      (!completedVisit || completedVisit.createdAt === previousVisit?.createdAt)
    ) {
      void playLiveDartCallout(dart.label, audioMode);
    }
  }

  async function handleMiss() {
    if (!liveState) {
      return;
    }

    if (!canSelectBoardInput) {
      setMessage(
        boardInputLockedByVisit
          ? "Bitte erst den Visit loggen oder mit Korrektur anpassen."
          : hasDeviceControl
            ? "Du kannst nur werfen, wenn du selbst dran bist."
            : "Dieses Geraet darf den Account gerade nicht steuern.",
      );
      return;
    }

    const dart = missDart();
    const nextState = await performServerLiveAction({ action: "add_dart", dart }, "miss");
    if (!nextState) {
      return;
    }
    const completedVisit = nextState.history.find((entry) => entry.result !== "leg-win") ?? null;
    const previousVisit = liveState.history.find((entry) => entry.result !== "leg-win") ?? null;
    if (
      (audioMode === "all" || audioMode === "darts") &&
      (!completedVisit || completedVisit.createdAt === previousVisit?.createdAt)
    ) {
      void playLiveDartCallout(dart.label, audioMode);
    }
  }

  async function handleRemoveLast() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    if (!canPlayFromThisDevice) {
      setMessage(hasDeviceControl ? "Du kannst diesen Besuch gerade nicht bearbeiten." : "Dieses Geraet darf den Account gerade nicht steuern.");
      return;
    }

    await performServerLiveAction({ action: "remove_dart" }, "undo_dart");
  }

  async function handleFinishVisit() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    if (!canPlayFromThisDevice) {
      setMessage(hasDeviceControl ? "Du kannst diesen Besuch gerade nicht abschliessen." : "Dieses Geraet darf den Account gerade nicht steuern.");
      return;
    }

    const nextState = await performServerLiveAction({ action: "finalize_visit" }, "finalize_visit");
    if (!nextState) {
      return;
    }
    queueVisitAudio(liveState, nextState);
  }

  async function handleNextLeg() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    if (!canControlLegTransition) {
      setMessage(hasDeviceControl ? "Dieses Geraet kann das naechste Leg gerade nicht starten." : "Dieses Geraet darf den Account gerade nicht steuern.");
      return;
    }

    await performServerLiveAction({ action: "next_leg" }, "next_leg");
  }

  async function handleRematch() {
    if (!liveState) {
      return;
    }

    if (loading) {
      return;
    }

    if (!canControlRematch) {
      setMessage(hasDeviceControl ? "Dieses Geraet kann das Rematch gerade nicht starten." : "Dieses Geraet darf den Account gerade nicht steuern.");
      return;
    }

    await performServerLiveAction({ action: "rematch" }, "rematch");
  }

  async function leaveRoom() {
    if (!liveRoomCode) {
      return;
    }

    const previousRoomCode = liveRoomCode;
    const result = await callLiveApi({
      action: "leave",
      roomCode: liveRoomCode,
    });

    if (result && "room_code" in result && typeof result.room_code === "string") {
      setLiveRoomCode("");
      setRoomOwnerId("");
      setLiveState(null);
      setRestoreTargetCode("");
      setConnectedNames([]);
      saveRoomSnapshot(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LIVE_ROOM_STORAGE_KEY);
      }
      setMessage("Du hast den Raum verlassen.");
      await loadOpenRooms();
      await broadcastRefresh(previousRoomCode, "leave");
    }
  }

  async function closeRoom() {
    if (!liveRoomCode) {
      return;
    }

    const result = await callLiveApi({
      action: "close",
      roomCode: liveRoomCode,
    });

    if (result && "closed" in result && result.closed) {
      setRestoreTargetCode("");
      saveRoomSnapshot(null);
      setMessage("Der Raum wurde geschlossen.");
      await loadOpenRooms();
    }
  }

  const historyHeading = "Historie";
  const boardHeading = "";
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
  const liveCelebration = useMemo(() => {
    if (!liveState || liveState.legWinner === null || liveState.matchWinner !== null) {
      return null;
    }

    const winner = liveState.players[liveState.legWinner];
    if (!winner) {
      return null;
    }

    const setWon = winner.legs === 0 && winner.sets > 0;
    return {
      kind: setWon ? ("set" as const) : ("leg" as const),
      winnerName: winner.name,
      scoreLine: `${winner.sets} Sets - ${winner.legs} Legs`,
      nextStep: setWon ? "Naechster Satz steht bereit" : "Naechstes Leg kann starten",
    };
  }, [liveState]);
  const latestScoredVisit = useMemo(() => {
    if (!liveState) {
      return null;
    }

    return [...liveState.history].find((entry) => entry.result !== "leg-win") ?? null;
  }, [liveState]);

  function queueVisitAudio(previousState: LiveMatchState, nextState: LiveMatchState) {
    const previousVisit = previousState.history.find((entry) => entry.result !== "leg-win") ?? null;
    const nextVisit = nextState.history.find((entry) => entry.result !== "leg-win") ?? null;
    if (!nextVisit) {
      return;
    }

    const previousKey = previousVisit
      ? `${previousVisit.createdAt}-${previousVisit.playerIndex}-${previousVisit.total}`
      : null;
    const nextKey = `${nextVisit.createdAt}-${nextVisit.playerIndex}-${nextVisit.total}`;
    if (previousKey === nextKey) {
      return;
    }

    lastPlayedVisitRef.current = nextKey;
    void playLiveVisitCallout(nextVisit.total, audioMode);
  }

  useEffect(() => {
    lastPlayedVisitRef.current = null;
  }, [liveRoomCode]);

  useEffect(() => {
    if (!latestScoredVisit) {
      lastPlayedVisitRef.current = null;
      return;
    }

    const visitKey = `${latestScoredVisit.createdAt}-${latestScoredVisit.playerIndex}-${latestScoredVisit.total}`;
    if (lastPlayedVisitRef.current === null) {
      lastPlayedVisitRef.current = visitKey;
      return;
    }

    if (lastPlayedVisitRef.current === visitKey) {
      return;
    }

    lastPlayedVisitRef.current = visitKey;
    void playLiveVisitCallout(latestScoredVisit.total, audioMode);
  }, [audioMode, latestScoredVisit]);

  return (
    <main className="relative min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-2 py-4 pb-28 text-stone-100 sm:px-4 sm:py-6 sm:pb-8">
      {isTurnHighlightActive ? (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(circle at center, rgba(0,0,0,0) 58%, rgba(34,197,94,0.14) 82%, rgba(34,197,94,0.34) 100%)",
          }}
        />
      ) : null}
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/icons/bobo-logo.jpg"
              alt="Bobo mit Dart"
              width={72}
              height={72}
              className="h-[4.5rem] w-[4.5rem] rounded-2xl border border-emerald-300/30 object-cover shadow-lg shadow-emerald-950/40"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Bobo&apos;s Dart</p>
              {liveRoomCode ? (
                <button
                  onClick={() => void copyRoomCode()}
                  className="mt-1 truncate text-left text-2xl font-semibold text-white sm:text-3xl"
                >
                  {liveRoomCode}
                </button>
              ) : (
                <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">Online Spiel</h1>
              )}
            </div>
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
            {!liveState && restoringRoom ? (
              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
                Letzter Raum wird wiederhergestellt...
              </section>
            ) : !liveState && !hasRoomRestoreTarget ? (
              <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <LiveRoomCreatePanel
                  createOpen={createOpen}
                  mode={mode}
                  entryMode={entryMode}
                  finishMode={finishMode}
                  bullOffEnabled={bullOffEnabled}
                  legsToWin={legsToWin}
                  setsToWin={setsToWin}
                  loading={loading}
                  onToggle={() => {
                    setCreateOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setJoinOpen(false);
                      }
                      return next;
                    });
                  }}
                  onModeChange={setMode}
                  onEntryModeChange={setEntryMode}
                  onFinishModeChange={setFinishMode}
                  onBullOffToggle={() => setBullOffEnabled((prev) => !prev)}
                  onLegsToWinChange={setLegsToWin}
                  onSetsToWinChange={setSetsToWin}
                  onCreate={() => void createRoom()}
                />

                <LiveRoomJoinPanel
                  joinOpen={joinOpen}
                  roomCodeInput={roomCodeInput}
                  liveRoomCode={liveRoomCode}
                  isRoomHost={isRoomHost}
                  joinedPlayerCount={joinedPlayerCount}
                  maxPlayers={maxPlayers}
                  openRooms={openRooms.filter((room) => room.room_code !== liveRoomCode)}
                  loading={loading}
                  message={message}
                  onToggle={() => {
                    setJoinOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setCreateOpen(false);
                      }
                      return next;
                    });
                  }}
                  onRoomCodeChange={setRoomCodeInput}
                  onJoin={() => void joinRoom()}
                  onJoinSuggestedRoom={(roomCode) => {
                    setRoomCodeInput(roomCode);
                    void joinRoom(roomCode);
                  }}
                  onCopyRoomCode={() => void copyRoomCode()}
                  onCopyRoomLink={() => void copyRoomLink()}
                  onReconnect={() => void reconnectToRoom()}
                  onLeaveRoom={() => void leaveRoom()}
                  onCloseRoom={() => void closeRoom()}
                />
              </section>
            ) : !liveState ? (
              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
                Raum wird vorbereitet...
              </section>
            ) : null}

            {liveState ? (
              <section className={`grid gap-4 ${spectatorMode ? "xl:grid-cols-[1.35fr_0.65fr]" : "lg:grid-cols-[1.1fr_0.9fr]"}`}>
                <div className="space-y-4">
                  {spectatorMode ? (
                    <section className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
                      Zuschauer-Modus aktiv. Dieses Geraet zeigt den Raum nur an, waehrend {deviceLockLabel ?? "ein anderes Geraet"} den Account steuert.
                    </section>
                  ) : null}
                  <LiveBoardPanel
                    liveState={liveState}
                    currentPlayerIndex={currentPlayerIndex}
                    currentUserId={session.user.id}
                    boardHeading={boardHeading}
                    currentVisitTotal={currentVisitTotal}
                    compactVisitText={compactVisitText}
                    calloutText={boardStatusText}
                    canPlayFromThisDevice={canPlayFromThisDevice}
                    canSelectBoardInput={canSelectBoardInput}
                    boardDisabledReason={boardDisabledReason}
                    loading={loading}
                    boardMarkers={boardMarkers}
                    pendingLabels={pendingLabels}
                    connectedNames={connectedNames}
                    canControlLegTransition={canControlLegTransition}
                    checkoutHints={checkoutHints}
                    currentPlayerName={currentPlayer?.name ?? null}
                    onPlayerSelect={openPresencePlayer}
                    onSegmentSelect={handleBoardSegment}
                    onMiss={() => void handleMiss()}
                    onRemoveLast={() => void handleRemoveLast()}
                    onFinishVisit={() => void handleFinishVisit()}
                    onNextLeg={() => void handleNextLeg()}
                  />
                  {liveCelebration ? (
                    <LiveCelebrationPanel
                      kind={liveCelebration.kind}
                      winnerName={liveCelebration.winnerName}
                      scoreLine={liveCelebration.scoreLine}
                      nextStep={liveCelebration.nextStep}
                    />
                  ) : null}
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

                <div className="space-y-4">
                  <LiveHistoryPanel
                    heading={historyHeading}
                    historyOpen={historyOpen}
                    history={liveState.history}
                    onToggle={() => setHistoryOpen((prev) => !prev)}
                  />
                  <LiveRoomStatusPanel
                    liveRoomCode={liveRoomCode}
                    isRoomHost={isRoomHost}
                    joinedPlayerCount={joinedPlayerCount}
                    maxPlayers={liveState.maxPlayers ?? maxPlayers}
                    loading={loading}
                    message={message}
                    connectionState={connectionState}
                    connectedNames={connectedNames}
                    isCurrentUsersTurn={isCurrentUsersTurn}
                    turnStatus={turnStatus}
                    hasDeviceControl={hasDeviceControl}
                    deviceLockLabel={deviceLockLabel}
                    cloudSyncPending={cloudSyncPending}
                    audioMode={audioMode}
                    events={liveState.events ?? []}
                    onAudioModeChange={setAudioMode}
                    onTakeControl={() => void handleTakeControl()}
                    onCopyRoomCode={() => void copyRoomCode()}
                    onRoomCodeTap={() => void copyRoomCode()}
                    onCopyRoomLink={() => void copyRoomLink()}
                    onReconnect={() => void reconnectToRoom()}
                    onLeaveRoom={() => void leaveRoom()}
                    onCloseRoom={() => void closeRoom()}
                  />
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
      {spectatorPrompt ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-3 sm:items-center sm:p-6">
          <div className="w-full max-w-lg rounded-[1.75rem] border border-white/10 bg-[#0f172a] p-4 shadow-2xl shadow-black/40">
            <h2 className="text-2xl font-semibold text-white">Nur Zuschauen?</h2>
            <p className="mt-3 text-sm text-stone-300">
              Dieser Account steuert den Raum bereits ueber {spectatorPrompt.activeDeviceLabel}. Du kannst den Raum auf diesem Geraet trotzdem im Zuschauer-Modus oeffnen.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => void enterSpectatorMode(spectatorPrompt.roomCode)}
                className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black"
              >
                Zuschauen
              </button>
              <button
                onClick={() => setSpectatorPrompt(null)}
                className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <PlayerRivalryDialog
        viewerName={displayName}
        selectedPlayer={selectedPresencePlayer}
        onClose={() => setSelectedPresencePlayer(null)}
      />
      {selectedLivePlayerStats ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-3 sm:items-center sm:p-6">
          <div className="w-full max-w-xl rounded-[1.75rem] border border-white/10 bg-[#0f172a] p-4 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-white">{selectedLivePlayerStats.name}</h2>
                <p className="mt-1 text-sm text-stone-400">Aktuelle Live-Statline</p>
              </div>
              <button
                onClick={() => setSelectedLivePlayerStats(null)}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white"
              >
                Schliessen
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Average</p>
                <p className="mt-1 text-2xl font-semibold text-white">{selectedLivePlayerStats.average.toFixed(1)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Best Visit</p>
                <p className="mt-1 text-2xl font-semibold text-white">{selectedLivePlayerStats.bestVisit}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Misses</p>
                <p className="mt-1 text-2xl font-semibold text-white">{selectedLivePlayerStats.misses}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Checkouts</p>
                <p className="mt-1 text-2xl font-semibold text-white">{selectedLivePlayerStats.checkouts}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

