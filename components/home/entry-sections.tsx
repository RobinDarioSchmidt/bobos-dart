"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type CloudStats = {
  matchesPlayed: number;
  matchesWon: number;
  bestAverage: number;
  bestVisit: number;
  trainingSessions: number;
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
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-emerald-200">
                Dart Hub
              </div>
              <p className="mt-2 text-sm font-semibold text-emerald-100">Bobo ist bereit.</p>
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Darts fÃ¼r Zuhause, Training und Online-Matches in einer klaren App.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-stone-300 sm:text-base">
              Logge dich ein und entscheide danach, ob du lokal mit Gastspielern spielen,
              online einen Raum Ã¶ffnen, trainieren oder direkt in deine Langzeitstatistiken gehen willst.
            </p>
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
  onProfileDraftChange,
  onSaveProfile,
  onStartLocal,
  onStartTraining,
  onRefreshCloud,
  onLogout,
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
  onProfileDraftChange: (value: string) => void;
  onSaveProfile: () => void;
  onStartLocal: () => void;
  onStartTraining: () => void;
  onRefreshCloud: () => void;
  onLogout: () => void;
  canInstallApp: boolean;
  isInstalledApp: boolean;
  installBusy: boolean;
  installTitle: string;
  installHint: string;
  onInstallApp: () => void;
}) {
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const displayName = profileName || profileDraft || sessionEmail || "Spieler";

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
                  Hi, {displayName}!
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <button
            onClick={onStartLocal}
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(15,23,42,0.82))] p-4 text-left transition hover:border-emerald-300/40 hover:bg-emerald-400/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">Lokales Spiel</h2>
            <p className="mt-2 whitespace-nowrap text-sm text-stone-300">
              Gastmatch vor Ort starten.
            </p>
          </button>

          <Link
            href="/live"
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(15,23,42,0.82))] p-4 transition hover:border-sky-300/40 hover:bg-sky-400/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">Online Spiel</h2>
            <p className="mt-2 whitespace-nowrap text-sm text-stone-300">
              Raum erstellen oder beitreten.
            </p>
          </Link>

          <button
            onClick={onStartTraining}
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(15,23,42,0.82))] p-4 text-left transition hover:border-amber-300/40 hover:bg-amber-300/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">Training</h2>
            <p className="mt-2 whitespace-nowrap text-sm text-stone-300">
              Drills und Boardarbeit.
            </p>
          </button>

          <Link
            href="/profile"
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(217,70,239,0.16),rgba(15,23,42,0.82))] p-4 transition hover:border-fuchsia-300/40 hover:bg-fuchsia-400/10 sm:p-5"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-100">Profil & Stats</h2>
            <p className="mt-2 whitespace-nowrap text-sm text-stone-300">
              Historie und Statistiken.
            </p>
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
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Matches</p>
                <p className="mt-1 text-2xl font-semibold text-white">{cloudStats.matchesPlayed}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Training</p>
                <p className="mt-1 text-2xl font-semibold text-white">{cloudStats.trainingSessions}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Best Avg</p>
                <p className="mt-1 text-2xl font-semibold text-white">{cloudStats.bestAverage.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-stone-400">Best Visit</p>
                <p className="mt-1 text-2xl font-semibold text-white">{cloudStats.bestVisit}</p>
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Web-App Installation</p>
              <p className="mt-1 text-lg font-semibold text-white">{isInstalledApp ? "Web-App ist installiert" : installTitle}</p>
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
    </section>
  );
}
