"use client";

import type { LiveFinishMode } from "@/lib/live-match";

export function LiveRoomCreatePanel({
  createOpen,
  displayName,
  mode,
  finishMode,
  bullOffEnabled,
  legsToWin,
  setsToWin,
  maxPlayers,
  loading,
  onToggle,
  onDisplayNameChange,
  onModeChange,
  onFinishModeChange,
  onBullOffToggle,
  onLegsToWinChange,
  onSetsToWinChange,
  onMaxPlayersChange,
  onCreate,
}: {
  createOpen: boolean;
  displayName: string;
  mode: 301 | 501;
  finishMode: LiveFinishMode;
  bullOffEnabled: boolean;
  legsToWin: number;
  setsToWin: number;
  maxPlayers: number;
  loading: boolean;
  onToggle: () => void;
  onDisplayNameChange: (value: string) => void;
  onModeChange: (value: 301 | 501) => void;
  onFinishModeChange: (value: LiveFinishMode) => void;
  onBullOffToggle: () => void;
  onLegsToWinChange: (value: number) => void;
  onSetsToWinChange: (value: number) => void;
  onMaxPlayersChange: (value: number) => void;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <h2 className="text-xl font-semibold text-white">Raum erstellen</h2>
        <span className="text-sm text-stone-400">{createOpen ? "Einklappen" : "Ausklappen"}</span>
      </button>

      {createOpen ? (
        <div className="mt-4 space-y-3">
          <input
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="Dein Anzeigename"
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onModeChange(301)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${mode === 301 ? "bg-amber-300 text-black" : "border border-white/10 bg-black/20 text-white"}`}
            >
              301
            </button>
            <button
              onClick={() => onModeChange(501)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${mode === 501 ? "bg-emerald-400 text-black" : "border border-white/10 bg-black/20 text-white"}`}
            >
              501
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["single", "double", "master"] as LiveFinishMode[]).map((option) => (
              <button
                key={option}
                onClick={() => onFinishModeChange(option)}
                className={`rounded-2xl px-3 py-3 text-xs font-semibold uppercase tracking-[0.18em] ${
                  finishMode === option ? "bg-white text-black" : "border border-white/10 bg-black/20 text-white"
                }`}
              >
                {option === "single" ? "Single Out" : option === "double" ? "Double Out" : "Masters Out"}
              </button>
            ))}
          </div>
          <button
            onClick={onBullOffToggle}
            className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
              bullOffEnabled
                ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                : "border-white/10 bg-black/20 text-stone-300"
            }`}
          >
            {bullOffEnabled ? "Bull-Out aktiv für den Startspieler" : "Startspieler normal festlegen"}
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={legsToWin}
              onChange={(event) => onLegsToWinChange(Number(event.target.value))}
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
              onChange={(event) => onSetsToWinChange(Number(event.target.value))}
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
            onChange={(event) => onMaxPlayersChange(Number(event.target.value))}
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white"
          >
            {[2, 3, 4].map((value) => (
              <option key={value} value={value}>
                Spieler: {value}
              </option>
            ))}
          </select>
          <button
            onClick={onCreate}
            disabled={loading}
            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            Online-Match starten
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
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <h2 className="text-xl font-semibold text-white">Raum beitreten</h2>
        <span className="text-sm text-stone-400">{joinOpen ? "Einklappen" : "Ausklappen"}</span>
      </button>
      {joinOpen ? (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <input
              value={roomCodeInput}
              onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
              placeholder="Raumcode"
              className="h-11 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
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
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Offene Räume</p>
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
                        Raum {room.room_code} · {room.mode} · {room.finish_mode === "single" ? "Single Out" : room.finish_mode === "double" ? "Double Out" : "Masters Out"}
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
            <p className="text-sm text-stone-400">Gerade sind keine offenen Räume sichtbar.</p>
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
