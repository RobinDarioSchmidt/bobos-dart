"use client";

import type { LiveAudioMode } from "@/lib/live-audio";
import type { LiveEntryMode, LiveFinishMode } from "@/lib/live-match";

const finishOptions: Array<{ value: LiveFinishMode; label: string }> = [
  { value: "single", label: "Straight Out" },
  { value: "double", label: "Double Out" },
  { value: "master", label: "Masters Out" },
];

const legOptions = [2, 3, 5] as const;
const setOptions = [1, 2, 3] as const;

function getNextValue<T>(options: readonly T[], currentValue: T) {
  const currentIndex = options.findIndex((option) => option === currentValue);
  return options[(currentIndex + 1) % options.length] ?? options[0];
}

export function LiveRoomCreatePanel({
  createOpen,
  mode,
  entryMode,
  finishMode,
  bullOffEnabled,
  legsToWin,
  setsToWin,
  loading,
  onToggle,
  onModeChange,
  onEntryModeChange,
  onFinishModeChange,
  onBullOffToggle,
  onLegsToWinChange,
  onSetsToWinChange,
  onCreate,
}: {
  createOpen: boolean;
  mode: 301 | 501;
  entryMode: LiveEntryMode;
  finishMode: LiveFinishMode;
  bullOffEnabled: boolean;
  legsToWin: number;
  setsToWin: number;
  loading: boolean;
  onToggle: () => void;
  onModeChange: (value: 301 | 501) => void;
  onEntryModeChange: (value: LiveEntryMode) => void;
  onFinishModeChange: (value: LiveFinishMode) => void;
  onBullOffToggle: () => void;
  onLegsToWinChange: (value: number) => void;
  onSetsToWinChange: (value: number) => void;
  onCreate: () => void;
}) {
  const optionButton =
    "min-w-0 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-semibold text-white transition hover:bg-white/10";

  return (
    <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5 p-3 shadow-2xl shadow-black/20 backdrop-blur sm:p-4">
      <button onClick={onToggle} className="flex w-full min-w-0 items-center justify-between gap-3 text-left">
        <h2 className="min-w-0 text-xl font-semibold text-white">Raum erstellen</h2>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-stone-300">
          {createOpen ? "Zu" : "Auf"}
        </span>
      </button>

      {createOpen ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onModeChange(301)}
              className={`${optionButton} ${mode === 301 ? "border-amber-300 bg-amber-300 text-black hover:bg-amber-300" : ""}`}
            >
              301
            </button>
            <button
              onClick={() => onModeChange(501)}
              className={`${optionButton} ${mode === 501 ? "border-emerald-400 bg-emerald-400 text-black hover:bg-emerald-400" : ""}`}
            >
              501
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() =>
                onEntryModeChange(
                  getNextValue(["single", "double", "master"] as const, entryMode),
                )
              }
              className={optionButton}
            >
              {entryMode === "single" ? "Straight In" : entryMode === "double" ? "Double In" : "Masters In"}
            </button>
            <button
              onClick={() => onFinishModeChange(getNextValue(finishOptions.map((option) => option.value), finishMode))}
              className={optionButton}
            >
              {finishOptions.find((option) => option.value === finishMode)?.label ?? "Straight Out"}
            </button>
            <button
              onClick={onBullOffToggle}
              className={`${optionButton} ${
                bullOffEnabled ? "border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10" : ""
              }`}
            >
              {bullOffEnabled ? "Bull-Off An" : "Bull-Off Aus"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onLegsToWinChange(getNextValue(legOptions, legsToWin as (typeof legOptions)[number]))}
              className={optionButton}
            >
              {legsToWin} Legs
            </button>
            <button
              onClick={() => onSetsToWinChange(getNextValue(setOptions, setsToWin as (typeof setOptions)[number]))}
              className={optionButton}
            >
              {setsToWin} {setsToWin === 1 ? "Satz" : "Saetze"}
            </button>
          </div>

          <button
            onClick={onCreate}
            disabled={loading}
            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black shadow-lg shadow-white/10 disabled:opacity-50"
          >
            Raum starten
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LiveRoomJoinPanel({
  joinOpen,
  roomCodeInput,
  liveRoomCode,
  isRoomHost,
  joinedPlayerCount,
  maxPlayers,
  openRooms,
  loading,
  message,
  onToggle,
  onRoomCodeChange,
  onJoin,
  onJoinSuggestedRoom,
  onCopyRoomCode,
  onCopyRoomLink,
  onReconnect,
  onLeaveRoom,
  onCloseRoom,
}: {
  joinOpen: boolean;
  roomCodeInput: string;
  liveRoomCode: string;
  isRoomHost: boolean;
  joinedPlayerCount: number;
  maxPlayers: number;
  openRooms: Array<{
    room_code: string;
    host_name: string;
    mode: 301 | 501;
    finish_mode: LiveFinishMode;
    joined_players: number;
    max_players: number;
    status_text: string;
  }>;
  loading: boolean;
  message: string;
  onToggle: () => void;
  onRoomCodeChange: (value: string) => void;
  onJoin: () => void;
  onJoinSuggestedRoom: (roomCode: string) => void;
  onCopyRoomCode: () => void;
  onCopyRoomLink: () => void;
  onReconnect: () => void;
  onLeaveRoom: () => void;
  onCloseRoom: () => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <button onClick={onToggle} className="flex w-full min-w-0 items-center justify-between gap-3 text-left">
        <h2 className="min-w-0 text-xl font-semibold text-white">Raum beitreten</h2>
        <span className="shrink-0 text-sm text-stone-400">{joinOpen ? "Einklappen" : "Ausklappen"}</span>
      </button>
      {joinOpen ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 min-[390px]:grid-cols-[1fr_auto]">
            <input
              value={roomCodeInput}
              onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
              placeholder="Raumcode"
              className="h-11 min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
            />
            <button
              onClick={onJoin}
              disabled={loading}
              className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              Beitreten
            </button>
          </div>

          {openRooms.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Offene Raeume</p>
              {openRooms.map((room) => (
                <button
                  key={room.room_code}
                  onClick={() => onJoinSuggestedRoom(room.room_code)}
                  disabled={loading}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-left transition hover:bg-white/10 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{room.host_name}</p>
                      <p className="mt-1 text-xs text-stone-400">
                        Raum {room.room_code} - {room.mode} - {room.finish_mode === "single" ? "Single Out" : room.finish_mode === "double" ? "Double Out" : "Masters Out"}
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
                      {room.joined_players}/{room.max_players}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-stone-300">{room.status_text}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">Gerade sind keine offenen Raeume sichtbar.</p>
          )}
        </div>
      ) : null}
      {liveRoomCode ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Dein Raumcode</p>
              <p className="mt-2 text-3xl font-semibold text-white">{liveRoomCode}</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
              {joinedPlayerCount}/{maxPlayers} Spieler
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-stone-200">
              {isRoomHost ? "Du bist Host" : "Du bist im Raum"}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onCopyRoomCode}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
            >
              Code kopieren
            </button>
            <button
              onClick={onCopyRoomLink}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
            >
              Raumlink kopieren
            </button>
            <button
              onClick={onReconnect}
              disabled={loading}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Verbindung erneuern
            </button>
            <button
              onClick={onLeaveRoom}
              disabled={loading}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Raum verlassen
            </button>
            {isRoomHost ? (
              <button
                onClick={onCloseRoom}
                disabled={loading}
                className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-50"
              >
                Raum schliessen
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
    </div>
  );
}

export function LiveRoomStatusPanel({
  liveRoomCode,
  isRoomHost,
  joinedPlayerCount,
  maxPlayers,
  loading,
  message,
  connectionState,
  connectedNames,
  isCurrentUsersTurn,
  turnStatus,
  hasDeviceControl,
  deviceLockLabel,
  cloudSyncPending,
  audioMode,
  onAudioModeChange,
  onTakeControl,
  onCopyRoomCode,
  onCopyRoomLink,
  onReconnect,
  onLeaveRoom,
  onCloseRoom,
}: {
  liveRoomCode: string;
  isRoomHost: boolean;
  joinedPlayerCount: number;
  maxPlayers: number;
  loading: boolean;
  message: string;
  connectionState: "online" | "offline" | "connecting";
  connectedNames: string[];
  isCurrentUsersTurn: boolean;
  turnStatus: string;
  hasDeviceControl: boolean;
  deviceLockLabel: string | null;
  cloudSyncPending: boolean;
  audioMode: LiveAudioMode;
  onAudioModeChange: (mode: LiveAudioMode) => void;
  onTakeControl: () => void;
  onCopyRoomCode: () => void;
  onCopyRoomLink: () => void;
  onReconnect: () => void;
  onLeaveRoom: () => void;
  onCloseRoom: () => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Dein Raumcode</p>
          <p className="mt-2 text-3xl font-semibold text-white">{liveRoomCode}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            connectionState === "online"
              ? "bg-emerald-400/20 text-emerald-200"
              : connectionState === "connecting"
                ? "bg-amber-300/20 text-amber-100"
                : "bg-red-400/20 text-red-100"
          }`}
        >
          {connectionState === "online" ? "Verbunden" : connectionState === "connecting" ? "Verbindet..." : "Offline"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
          {joinedPlayerCount}/{maxPlayers} Spieler
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-stone-200">
          {isRoomHost ? "Du bist Host" : "Du bist im Raum"}
        </div>
      </div>

      {cloudSyncPending ? (
        <p className="mt-3 text-xs text-amber-200">Cloud-Statistiken werden fuer dieses Match noch gesichert.</p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Gerade online im Raum</p>
          <p className="mt-2 text-sm text-white">
            {connectedNames.length > 0 ? connectedNames.join(", ") : "Noch keine aktiven Verbindungen"}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-3 ${
            isCurrentUsersTurn && hasDeviceControl
              ? "border-emerald-300/30 bg-emerald-400/10"
              : !hasDeviceControl
                ? "border-amber-300/30 bg-amber-300/10"
                : "border-white/10 bg-white/5"
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Dein Status</p>
          <p
            className={`mt-2 text-sm font-semibold ${
              isCurrentUsersTurn && hasDeviceControl
                ? "text-emerald-100"
                : !hasDeviceControl
                  ? "text-amber-100"
                  : "text-white"
            }`}
          >
            {turnStatus}
          </p>
          {!hasDeviceControl && deviceLockLabel ? (
            <p className="mt-2 text-xs text-amber-100">Aktives Steuergeraet: {deviceLockLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!hasDeviceControl ? (
          <button
            onClick={onTakeControl}
            disabled={loading}
            className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
          >
            Dieses Geraet uebernehmen
          </button>
        ) : null}
        <button
          onClick={onCopyRoomCode}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
        >
          Code kopieren
        </button>
        <button
          onClick={onCopyRoomLink}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
        >
          Raumlink kopieren
        </button>
        <button
          onClick={onReconnect}
          disabled={loading}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Verbindung erneuern
        </button>
        <button
          onClick={onLeaveRoom}
          disabled={loading}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Raum verlassen
        </button>
        {isRoomHost ? (
          <button
            onClick={onCloseRoom}
            disabled={loading}
            className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-50"
          >
            Raum schliessen
          </button>
        ) : null}
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Audio</p>
          <div className="flex flex-wrap gap-2">
            {([
              ["off", "Aus"],
              ["visits", "Nur Visits"],
              ["all", "Alle"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => onAudioModeChange(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  audioMode === value ? "bg-amber-300 text-black" : "border border-white/10 bg-black/20 text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
    </section>
  );
}

