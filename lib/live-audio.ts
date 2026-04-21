export type LiveAudioMode = "off" | "speech" | "clips";

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
} as const;

export function normalizeCalloutToClipKey(callout: string) {
  return callout
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getLiveCalloutClipPath(callout: string) {
  return `${CALL_OUT_DIRECTORY}/${normalizeCalloutToClipKey(callout)}.mp3`;
}

export function getLiveVisitClipPath(total: number) {
  return `${CALL_OUT_DIRECTORY}/${total}.mp3`;
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

export function speakEnglishCallout(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  playbackToken += 1;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }

  const utterance = new SpeechSynthesisUtterance(text);
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
  return true;
}

export async function playLiveCallout(callout: string, mode: LiveAudioMode) {
  if (!callout || mode === "off") {
    return false;
  }

  if (mode === "clips") {
    return playAudioClip(getLiveCalloutClipPath(callout));
  }

  return speakEnglishCallout(callout);
}

export async function playLiveVisitCallout(total: number, mode: LiveAudioMode) {
  if (!Number.isFinite(total) || total < 0 || mode === "off") {
    return false;
  }

  if (mode === "clips") {
    return playAudioClip(getLiveVisitClipPath(total));
  }

  return speakEnglishCallout(String(total));
}
