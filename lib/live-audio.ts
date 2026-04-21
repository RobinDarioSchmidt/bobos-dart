export type LiveAudioMode = "off" | "visits" | "all";

export const LIVE_AUDIO_MODE_STORAGE_KEY = "bobos-dart-live-audio-mode";

const CALL_OUT_DIRECTORY = "/audio/live/callouts";
let activeAudio: HTMLAudioElement | null = null;
let playbackToken = 0;

export const LIVE_AUDIO_EVENT_FILES = {
  bust: "/audio/live/events/bust.mp3",
  checkout: "/audio/live/events/checkout.mp3",
  legWin: "/audio/live/events/leg-win.mp3",
  matchWin: "/audio/live/events/match-win.mp3",
  bullOffWin: "/audio/live/events/bull-off-win.mp3",
  roomJoin: "/audio/live/events/room-join.mp3",
  noScore: "/audio/live/events/no-score.mp3",
  bullseye: "/audio/live/events/bullseye.mp3",
  outerBull: "/audio/live/events/outer-bull.mp3",
} as const;

export function getLiveVisitClipPath(total: number) {
  return `${CALL_OUT_DIRECTORY}/${total}.mp3`;
}

export function getLiveDartClipPath(label: string) {
  const normalized = label.trim();
  if (normalized === "Miss") {
    return LIVE_AUDIO_EVENT_FILES.noScore;
  }
  if (normalized === "Bull") {
    return LIVE_AUDIO_EVENT_FILES.bullseye;
  }
  if (normalized === "Outer Bull") {
    return LIVE_AUDIO_EVENT_FILES.outerBull;
  }

  const prefix = normalized[0];
  const number = Number(normalized.slice(1));
  if (!Number.isFinite(number)) {
    return null;
  }

  if (prefix === "D") {
    return `${CALL_OUT_DIRECTORY}/double-${number}.mp3`;
  }
  if (prefix === "T") {
    return `${CALL_OUT_DIRECTORY}/triple-${number}.mp3`;
  }

  return `${CALL_OUT_DIRECTORY}/${number}.mp3`;
}

export async function playAudioClip(src: string) {
  if (typeof window === "undefined") {
    return false;
  }

  playbackToken += 1;
  const currentToken = playbackToken;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }

  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    activeAudio = audio;
    await audio.play();
    if (currentToken !== playbackToken) {
      audio.pause();
      return false;
    }
    return true;
  } catch {
    if (currentToken === playbackToken && activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
    return false;
  }
}

export async function playLiveDartCallout(label: string, mode: LiveAudioMode) {
  if (!label || mode !== "all") {
    return false;
  }

  const clipPath = getLiveDartClipPath(label);
  if (!clipPath) {
    return false;
  }

  return playAudioClip(clipPath);
}

export async function playLiveVisitCallout(total: number, mode: LiveAudioMode) {
  if (!Number.isFinite(total) || total < 0 || mode === "off") {
    return false;
  }

  return playAudioClip(getLiveVisitClipPath(total));
}
