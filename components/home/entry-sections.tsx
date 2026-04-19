"use client";

import Link from "next/link";

type CloudStats = {
  matchesPlayed: number;
  matchesWon: number;
  bestAverage: number;
  bestVisit: number;
  trainingSessions: number;
};

type RecentTrainingEntry = {
  score: number;
  darts_thrown: number;
  hits: number;
  played_at: string;
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
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-emerald-200">
            Dart Hub
          </div>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Darts für Zuhause, Training und Online-Matches in einer klaren App.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-stone-300 sm:text-base">
              Logge dich ein und entscheide danach, ob du lokal mit Gastspielern spielen,
              online einen Raum öffnen, trainieren oder direkt in deine Langzeitstatistiken gehen willst.
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
  recentTrainingSessions,
  onProfileDraftChange,
  onSaveProfile,
  onStartLocal,
  onStartTraining,
  onLoadCloudDashboard,
  onLoadCloudMatches,
  onLogout,
  canInstallApp,
  isInstalledApp,
  installBusy,
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
  recentTrainingSessions: RecentTrainingEntry[];
  onProfileDraftChange: (value: string) => void;
  onSaveProfile: () => void;
  onStartLocal: () => void;
  onStartTraining: () => void;
  onLoadCloudDashboard: () => void;
  onLoadCloudMatches: () => void;
  onLogout: () => void;
  canInstallApp: boolean;
  isInstalledApp: boolean;
  installBusy: boolean;
  installHint: string;
  onInstallApp: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="space-y-6 p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-emerald-200">
              Willkommen zurück
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {profileName || profileDraft || "Spieler"}, wie soll es weitergehen?
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300 sm:text-base">
                Wähle deinen Modus und starte direkt in lokales Spiel, Online-Raum, Training oder Profil.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {canInstallApp && !isInstalledApp ? (
              <button
                onClick={onInstallApp}
                disabled={installBusy}
                className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
              >
                App installieren
              </button>
            ) : null}
            {isInstalledApp ? (
              <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                App installiert
              </div>
            ) : null}
            {isAdmin ? (
              <Link
                href="/admin"
                className="rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black"
              >
                Admin
              </Link>
            ) : null}
            <button
              onClick={onLogout}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <button
            onClick={onStartLocal}
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(15,23,42,0.82))] p-5 text-left transition hover:border-emerald-300/40 hover:bg-emerald-400/10"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-100">Lokales Spiel</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Mit Gastspielern spielen</h2>
            <p className="mt-2 text-sm text-stone-300">
              Vor Ort spielen, Namen frei vergeben und ein Match sofort starten.
            </p>
          </button>

          <Link
            href="/live"
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(15,23,42,0.82))] p-5 transition hover:border-sky-300/40 hover:bg-sky-400/10"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-sky-100">Online Spiel</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Raum erstellen oder beitreten</h2>
            <p className="mt-2 text-sm text-stone-300">
              Live gegen Freunde spielen, synchronisiert über eure Konten.
            </p>
          </Link>

          <button
            onClick={onStartTraining}
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(15,23,42,0.82))] p-5 text-left transition hover:border-amber-300/40 hover:bg-amber-300/10"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-amber-100">Training</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Boardarbeit und Drills</h2>
            <p className="mt-2 text-sm text-stone-300">
              Around the Clock, Bull Drill, Shanghai oder Doubles Around mit deinen Cloud-Daten.
            </p>
          </button>

          <Link
            href="/profile"
            className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(217,70,239,0.16),rgba(15,23,42,0.82))] p-5 transition hover:border-fuchsia-300/40 hover:bg-fuchsia-400/10"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-fuchsia-100">Historische Daten</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Profil und Statistiken</h2>
            <p className="mt-2 text-sm text-stone-300">
              Siege, Averages, Training und deine letzten Sessions kompakt ansehen.
            </p>
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Konto</p>
                <p className="mt-1 text-lg font-semibold text-white">{sessionEmail}</p>
                {profileName ? <p className="text-sm text-stone-400">Profilname: {profileName}</p> : null}
              </div>
              <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                Verbunden
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={profileDraft}
                onChange={(event) => onProfileDraftChange(event.target.value)}
                placeholder="Profilname"
                className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
              />
              <button
                onClick={onSaveProfile}
                className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black"
              >
                Profil speichern
              </button>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Cloud übersicht</p>
            {cloudStats ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
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
                  onClick={onLoadCloudDashboard}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
                >
                  Cloud-Statistik laden
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">App-Gefühl</p>
              <p className="mt-1 text-lg font-semibold text-white">F?r Handy vorbereitet</p>
              <p className="mt-2 text-sm text-stone-400">
                Du kannst Bobo&apos;s Dart als Web-App auf dem Homescreen nutzen. Wenn dein Browser keinen
                direkten Installieren-Button anbietet, bekommst du hier die passende Anleitung.
              </p>
              <p className="mt-3 text-sm text-stone-300">{installHint}</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-stone-200">
              {isInstalledApp ? "Installiert" : canInstallApp ? "Installierbar" : "Manuell installierbar"}
            </div>
          </div>
        </div>

        {cloudMessage ? <p className="text-sm text-stone-300">{cloudMessage}</p> : null}
        {cloudLoading ? <p className="text-sm text-stone-500">Cloud-Historie wird geladen...</p> : null}

        {cloudStats ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onLoadCloudMatches}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black"
              >
                Cloud-Historie laden
              </button>
              <button
                onClick={onLoadCloudDashboard}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
              >
                Cloud-Statistik laden
              </button>
              <Link
                href="/profile"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
              >
                Profilseite
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Matches</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {cloudStats.matchesWon} / {cloudStats.matchesPlayed}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Training</p>
                <p className="mt-2 text-xl font-semibold text-white">{cloudStats.trainingSessions}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Best Visit</p>
                <p className="mt-2 text-xl font-semibold text-white">{cloudStats.bestVisit}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Letzte Trainingssessions</p>
              {recentTrainingSessions.length > 0 ? (
                recentTrainingSessions.slice(0, 3).map((entry, index) => (
                  <div
                    key={`${entry.played_at}-${index}`}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300"
                  >
                    {new Date(entry.played_at).toLocaleString("de-DE")} · Score {entry.score} · Treffer {entry.hits} · Darts {entry.darts_thrown}
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-400">Noch keine Trainingsdaten in der Cloud.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
