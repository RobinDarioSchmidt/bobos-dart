"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { TEST_USERS } from "@/lib/test-users";

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";
  const isAdmin = useMemo(
    () => Boolean(session?.user.email && adminEmail && session.user.email === adminEmail),
    [adminEmail, session],
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function callAdminApi(body: object) {
    if (!supabase || !session) {
      setMessage("Du musst als Admin eingeloggt sein.");
      return;
    }

    setLoading(true);
    setMessage("");

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();

    const accessToken = freshSession?.access_token;
    if (!accessToken) {
      setLoading(false);
      setMessage("Kein gueltiges Login gefunden.");
      return;
    }

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as {
      ok?: boolean;
      email?: string;
      error?: string;
      results?: Array<{ ok: boolean; email: string; error?: string }>;
      deleteResults?: Array<{ ok: boolean; email: string; error?: string }>;
    };

    setLoading(false);

    if (result.results) {
      const successCount = result.results.filter((entry) => entry.ok).length;
      const failed = result.results.filter((entry) => !entry.ok);
      const deletedCount = result.deleteResults?.filter((entry) => entry.ok).length ?? 0;
      setMessage(
        failed.length > 0
          ? `${deletedCount} alte Accounts entfernt, ${successCount} Test-Accounts erstellt, ${failed.length} fehlgeschlagen: ${failed
              .map((entry) => `${entry.email} (${entry.error})`)
              .join(", ")}`
          : `${deletedCount} alte Accounts entfernt, alle ${successCount} Test-Accounts erstellt.`,
      );
      return;
    }

    if (!response.ok || !result.ok) {
      setMessage(result.error ?? "Nutzer konnte nicht erstellt werden.");
      return;
    }

    setMessage(`Nutzer ${result.email} wurde erfolgreich erstellt.`);
    setEmail("");
    setPassword("");
    setDisplayName("");
  }

  async function handleCreateUser() {
    if (!email || !password || !displayName) {
      setMessage("Bitte alle Felder ausfuellen.");
      return;
    }

    await callAdminApi({
      action: "create",
      email,
      password,
      displayName,
    });
  }

  async function handleSeedUsers() {
    await callAdminApi({ action: "reset-seed" });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] px-4 py-8 text-stone-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Admin Bereich</p>
            <h1 className="mt-2 text-4xl font-semibold text-white">Nutzer manuell anlegen</h1>
          </div>
          <Link href="/" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold">
            Zurueck zur App
          </Link>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
          {!supabaseEnabled ? (
            <p className="text-sm text-stone-400">
              Supabase ist noch nicht konfiguriert. Trage zuerst die Umgebungsvariablen ein.
            </p>
          ) : !session ? (
            <p className="text-sm text-stone-400">Bitte zuerst in der App einloggen.</p>
          ) : !isAdmin ? (
            <p className="text-sm text-amber-200">
              Dieser Bereich ist nur fuer den Admin freigeschaltet. Aktuell eingeloggt: {session.user.email}
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">
                <h2 className="text-2xl font-semibold text-white">Einzelnen Nutzer anlegen</h2>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Anzeigename"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="E-Mail"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Startpasswort"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                />
                <button
                  onClick={() => void handleCreateUser()}
                  disabled={loading}
                  className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                >
                  Nutzer erstellen
                </button>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">
                <h2 className="text-2xl font-semibold text-white">5 Test-Accounts anlegen</h2>
                <p className="text-sm text-stone-400">
                  Diese Zugangsdaten werden direkt in Supabase angelegt und sind danach sofort nutzbar.
                </p>
                <div className="space-y-3">
                  {TEST_USERS.map((user) => (
                    <div key={user.email} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                      <p className="font-semibold text-white">{user.displayName}</p>
                      <p className="text-stone-300">{user.email}</p>
                      <p className="text-stone-400">{user.password}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => void handleSeedUsers()}
                  disabled={loading}
                  className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                >
                  Alte Test-Accounts ersetzen und neu anlegen
                </button>
              </div>
            </div>
          )}

          {message ? <p className="mt-4 text-sm text-stone-300">{message}</p> : null}
        </section>
      </div>
    </main>
  );
}
