"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  PlayerRivalryDialog,
  type PlayerPresenceSummary,
  type SharedMatchSummary,
} from "@/components/player-rivalry-dialog";

type CloudStats = {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  bestAverage: number;
  bestVisit: number;
  trainingSessions: number;
};

type PlayerPresence = PlayerPresenceSummary;

type RecentMilestone = {
  key: string;
  title: string;
  unlockedAt: string;
  tone: string;
};

type ActiveLiveRoom = {
  room_code: string;
  mode: 301 | 501;
  finish_mode: "single" | "double" | "master";
  current_player_name: string;
  is_user_turn?: boolean;
  players: Array<{
    name: string;
    is_active: boolean;
  }>;
};

type MatchHistoryEntry = {
  id: string;
  playedAt: string;
  winner: string;
  opponents: string;
  mode: 301 | 501;
  doubleOut: boolean;
  sets: string;
  participantIds: string[];
  participantNames: string[];
};

const milestoneToneClasses: Record<string, string> = {
  amber: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  emerald: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  fuchsia: "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100",
  rose: "border-rose-300/25 bg-rose-400/10 text-rose-100",
};

export function SignedOutLandingSection({
  supabaseEnabled,
  email,
  password,
  authMessage,
  onEmailChange,
  onPasswordChange,
  onLogin,
}: {
  supabaseEnabled: boolean;
  email: string;
  password: string;
  authMessage: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Image
              src="/icons/bobo-logo.jpg"
              alt="Bobo mit Dart"
              width={80}
              height={80}
              className="h-20 w-20 rounded-2xl border border-emerald-300/30 object-cover shadow-lg shadow-emerald-950/40"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Bobo&apos;s Dart</p>
              <p className="mt-2 text-sm font-semibold text-emerald-100">Dart Counter Web-App</p>
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Bobo&apos;s Dart
            </h1>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-stone-300">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">Lokales Spiel mit Gastnamen</span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">Online-Raeume</span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">Training + Profil</span>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Login</p>
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                supabaseEnabled ? "bg-white/10 text-stone-300" : "bg-red-400/15 text-red-100"
              }`}
            >
              {supabaseEnabled ? "Bereit" : "Nicht konfiguriert"}
            </div>
          </div>

          {supabaseEnabled ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-stone-400">
                Konten werden manuell vom Admin angelegt. Hier ist nur der Login offen.
              </p>
              <input
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="E-Mail"
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Passwort"
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
              />
              <button
                onClick={onLogin}
                className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black"
              >
                Einloggen
              </button>
              {authMessage ? <p className="text-sm text-amber-200">{authMessage}</p> : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-400">
              Trage erst `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` ein.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function SignedInOverviewSection({
  sessionEmail,
  profileName,
  profileDraft,
  isAdmin,
  cloudStats,
  cloudMessage,
  cloudLoading,
  playerPresence,
  activeLiveRooms,
  cloudMatchHistory,
  recentMilestones,
  onProfileDraftChange,
  onSaveProfile,
  onStartLocal,
  onStartTraining,
  onRefreshCloud,
  onLogout,
  onOpenLiveRoom,
  canInstallApp,
  isInstalledApp,
  installBusy,
  installTitle,
  installHint,
  onInstallApp,
}: {
  sessionEmail: string;
  profileName: string;
  profileDraft: string;
  isAdmin: boolean;
  cloudStats: CloudStats | null;
  cloudMessage: string;
  cloudLoading: boolean;
  playerPresence: PlayerPresence[];
  activeLiveRooms: ActiveLiveRoom[];
  cloudMatchHistory: MatchHistoryEntry[];
  recentMilestones: RecentMilestone[];
  onProfileDraftChange: (value: string) => void;
  onSaveProfile: () => void;
  onStartLocal: () => void;
  onStartTraining: () => void;
  onRefreshCloud: () => void;
  onLogout: () => void;
  onOpenLiveRoom: (roomCode: string) => void;
  canInstallApp: boolean;
  isInstalledApp: boolean;
  installBusy: boolean;
  installTitle: string;
  installHint: string;
  onInstallApp: () => void;
}) {
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerPresence | null>(null);
  const [activeStatHint, setActiveStatHint] = useState<null | { title: string; description: string }>(null);
  const displayName = profileName || profileDraft || sessionEmail || "Spieler";
  const recentSharedMatch = useMemo<SharedMatchSummary | null>(() => {
    if (!selectedPlayer) {
      return null;
    }

    const match = cloudMatchHistory.find((entry) => {
      return entry.participantIds.includes(selectedPlayer.id);
    });

    if (!match) {
      return null;
    }

    const finishLabel = match.doubleOut ? "Double Out" : "Straight Out";
    return {
      playedAt: match.playedAt,
      winner: match.winner,
      opponents: match.opponents,
      modeLabel: `${match.mode} · ${finishLabel}`,
      scoreLine: match.sets,
    };
  }, [cloudMatchHistory, selectedPlayer]);
  const statCards = cloudStats
    ? [
        {
          title: "Matches/Wins/Loses",
          value: `${cloudStats.matchesPlayed}/${cloudStats.matchesWon}/${cloudStats.matchesLost}`,
          description: "Matches zeigt alle abgeschlossenen Cloud-Matches. Wins und Loses teilen diese in Siege und Niederlagen auf.",
        },
        {
          title: "Trainings",
          value: String(cloudStats.trainingSessions),
          description: "Trainings zaehlt, wie viele Trainingseinheiten bereits in deiner Cloud gespeichert wurden.",
        },
        {
          title: "Best Avg",
          value: cloudStats.bestAverage.toFixed(2),
          description: "Best Avg ist das beste 3-Dart-Average, das du in einem Match erreicht hast.",
        },
        {
          title: "Best Visit",
          value: String(cloudStats.bestVisit),
          description: "Best Visit ist dein bester einzelner Besuch, also die hoechste Punktzahl in einem Zug mit bis zu 3 Darts.",
        },
      ]
    : [];

  function getFinishModeLabel(value: ActiveLiveRoom["finish_mode"]) {
    if (value === "single") {
      return "Straight Out";
    }

    if (value === "master") {
      return "Masters Out";
    }

    return "Double Out";
  }

  return (
    <section className="overflow-hidden border-y border-white/10 bg-white/5 shadow-2xl shadow-black/30 backdrop-blur sm:rounded-[2rem] sm:border">
      <div className="space-y-5 px-3 py-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/icons/bobo-logo.jpg"
                alt="Bobo mit Dart"
                width={72}
                height={72}
                className="h-[4.5rem] w-[4.5rem] rounded-2xl border border-emerald-300/30 object-cover shadow-lg shadow-emerald-950/40"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Bobo&apos;s Dart</p>
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                  Prost, {displayName}!
                </h1>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onLogout}
              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white sm:px-4"
            >
              Logout
            </button>
          </div>
        </div>

        {activeLiveRooms.length > 0 ? (
          <div className="space-y-3">
            {activeLiveRooms.map((room) => (
              <button
                key={`active-room-${room.room_code}`}
                onClick={() => onOpenLiveRoom(room.room_code)}
                className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                  room.is_user_turn
                    ? "border-emerald-300/35 bg-emerald-400/12 shadow-[0_0_24px_rgba(74,222,128,0.16)]"
                    : "border-white/10 bg-black/20 hover:bg-white/5"
                }`}
              >
                <p className="truncate text-sm font-semibold text-white sm:text-base">
                  {room.room_code} - {room.mode}, {getFinishModeLabel(room.finish_mode)}
                </p>
                <div
                  className={`mt-1 flex items-center gap-2 overflow-hidden text-xs ${
                    room.is_user_turn ? "text-emerald-100" : "text-stone-400"
                  }`}
                >
                  <span className="shrink-0">{room.is_user_turn ? "Du bist dran." : `${room.current_player_name} ist am Zug.`}</span>
                  <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                    {room.players.map((player) => (
                      <div key={`${room.room_code}-${player.name}`} className="flex min-w-0 items-center gap-1">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            player.is_active
                              ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]"
                              : "bg-stone-600"
                          }`}
                        />
                        <span className="truncate">{player.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Link
            href="/live"
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(15,23,42,0.82))] p-4 transition hover:border-sky-300/40 hover:bg-sky-400/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">Online Spiel</h2>
          </Link>

          <button
            onClick={onStartLocal}
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(15,23,42,0.82))] p-4 text-left transition hover:border-emerald-300/40 hover:bg-emerald-400/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">Lokales Spiel</h2>
          </button>

          <button
            onClick={onStartTraining}
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(15,23,42,0.82))] p-4 text-left transition hover:border-amber-300/40 hover:bg-amber-300/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">Trainings</h2>
          </button>

          <Link
            href="/profile"
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(217,70,239,0.16),rgba(15,23,42,0.82))] p-4 transition hover:border-fuchsia-300/40 hover:bg-fuchsia-400/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-100">Stats</h2>
          </Link>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setProfileEditorOpen((open) => !open)}
              className="min-w-0 text-left"
            >
              <p className="truncate text-lg font-semibold text-white">{displayName}</p>
              <p className="mt-1 text-xs text-stone-400">{sessionEmail}</p>
            </button>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                Verbunden
              </div>
              {isInstalledApp ? (
                <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  App installiert
                </div>
              ) : null}
            </div>
          </div>

          {profileEditorOpen ? (
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input
                value={profileDraft}
                onChange={(event) => onProfileDraftChange(event.target.value)}
                placeholder="Profilname"
                className="h-10 min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
              />
              <button
                onClick={onSaveProfile}
                className="h-10 rounded-2xl bg-emerald-400 px-4 text-sm font-semibold text-black"
              >
                Save
              </button>
            </div>
          ) : null}

          {cloudStats ? (
            <div className="mt-4 space-y-3">
              {recentMilestones.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recentMilestones.map((milestone) => (
                    <div
                      key={milestone.key}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        milestoneToneClasses[milestone.tone] ?? milestoneToneClasses.amber
                      }`}
                    >
                      {milestone.title}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {statCards.map((card) => (
                  <button
                    key={card.title}
                    onClick={() =>
                      setActiveStatHint((current) =>
                        current?.title === card.title ? null : { title: card.title, description: card.description },
                      )
                    }
                    className="relative rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
                  >
                    <p className="text-xs text-stone-400">{card.title}</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{card.value}</p>
                    {activeStatHint?.title === card.title ? (
                      <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-56 rounded-2xl border border-white/10 bg-[#0f172a] p-3 shadow-2xl shadow-black/40">
                        <p className="text-sm text-stone-200">{card.description}</p>
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-stone-400">Deine Cloud-Daten werden gerade vorbereitet oder sind noch leer.</p>
              <button
                onClick={onRefreshCloud}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
              >
                Jetzt aktualisieren
              </button>
            </div>
          )}
        </div>


        {cloudMessage ? <p className="text-sm text-stone-300">{cloudMessage}</p> : null}
        {cloudLoading ? <p className="text-sm text-stone-500">Cloud-Historie wird geladen...</p> : null}

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Spieler</p>
            <p className="text-xs text-stone-500">aktiv: 30 min</p>
          </div>
          <div className="mt-3 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {playerPresence.length > 0 ? (
              playerPresence.map((player) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayer(player)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition hover:bg-white/5"
                >
                  <p className="truncate text-sm font-semibold text-white">{player.displayName}</p>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      player.isActive ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]" : "bg-stone-600"
                    }`}
                  />
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-stone-400">Noch keine anderen Spieler gefunden.</p>
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Web-App</p>
              {!isInstalledApp ? <p className="mt-1 text-lg font-semibold text-white">{installTitle}</p> : null}
              {!isInstalledApp ? (
                <>
                  <p className="mt-2 text-sm text-stone-400">
                    Du kannst Bobo&apos;s Dart als Web-App auf dem Homescreen nutzen. Wenn dein Browser keinen
                    direkten Installieren-Button anbietet, bekommst du hier die passende Anleitung.
                  </p>
                  <p className="mt-3 text-sm text-stone-300">{installHint}</p>
                </>
              ) : null}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-stone-200">
              {isInstalledApp ? "Installiert" : canInstallApp ? "Installierbar" : "Manuell installierbar"}
            </div>
          </div>
          {canInstallApp && !isInstalledApp ? (
            <button
              onClick={onInstallApp}
              disabled={installBusy}
              className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
            >
              App installieren
            </button>
          ) : null}
        </div>

        {isAdmin ? (
          <Link
            href="/admin"
            className="inline-flex w-fit rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black"
          >
            Admin
          </Link>
        ) : null}
      </div>

      <PlayerRivalryDialog
        viewerName={displayName}
        selectedPlayer={selectedPlayer}
        recentSharedMatch={recentSharedMatch}
        onClose={() => setSelectedPlayer(null)}
      />

    </section>
  );
}
