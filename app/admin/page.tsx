"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { TEST_USERS } from "@/lib/test-users";

type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  createdAt: string;
};

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [displayNameDrafts, setDisplayNameDrafts] = useState<Record<string, string>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
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

  const getAccessToken = useCallback(async () => {
    if (!supabase) {
      return null;
    }

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();

    return freshSession?.access_token ?? null;
  }, []);

  const loadManagedUsers = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return;
    }

    const response = await fetch("/api/admin/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const result = (await response.json()) as { users?: ManagedUser[]; error?: string };
    if (!response.ok || !result.users) {
      setMessage(result.error ?? "Nutzerliste konnte nicht geladen werden.");
      return;
    }

    setManagedUsers(result.users);
    setDisplayNameDrafts(
      Object.fromEntries(result.users.map((user) => [user.id, user.displayName])),
    );
  }, [getAccessToken]);

  useEffect(() => {
    if (!supabase || !session || !isAdmin) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadManagedUsers();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isAdmin, loadManagedUsers, session]);

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
      setMessage("Kein g?ltiges Login gefunden.");
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

    setMessage(result.email ? `Nutzer ${result.email} wurde erfolgreich erstellt.` : "Nutzer erfolgreich aktualisiert.");
    setEmail("");
    setPassword("");
    setDisplayName("");
    await loadManagedUsers();
  }

  async function handleCreateUser() {
    if (!email || !password || !displayName) {
      setMessage("Bitte alle Felder ausf?llen.");
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
    await loadManagedUsers();
  }

  async function handleUpdateUser(userId: string) {
    await callAdminApi({
      action: "update",
      userId,
      displayName: displayNameDrafts[userId] ?? "",
      password: passwordDrafts[userId] ?? "",
    });
    setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
    await loadManagedUsers();
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
            Zur?ck zur App
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
              Dieser Bereich ist nur f?r den Admin freigeschaltet. Aktuell eingeloggt: {session.user.email}
            </p>
          ) : (
            <>
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
                <h2 className="text-2xl font-semibold text-white">Test-Accounts pflegen</h2>
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

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-white">Freunde verwalten</h2>
                <button
                  onClick={() => void loadManagedUsers()}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
                >
                  Neu laden
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {managedUsers.length > 0 ? (
                  managedUsers.map((user) => (
                    <div key={user.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{user.email}</p>
                          <p className="text-xs text-stone-400">
                            Seit {new Date(user.createdAt).toLocaleDateString("de-DE")}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-stone-300">
                          {user.email === adminEmail ? "Admin" : "Freund"}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <input
                          value={displayNameDrafts[user.id] ?? user.displayName}
                          onChange={(event) =>
                            setDisplayNameDrafts((prev) => ({ ...prev, [user.id]: event.target.value }))
                          }
                          placeholder="Anzeigename"
                          className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                        />
                        <input
                          value={passwordDrafts[user.id] ?? ""}
                          onChange={(event) =>
                            setPasswordDrafts((prev) => ({ ...prev, [user.id]: event.target.value }))
                          }
                          placeholder="Neues Passwort (optional)"
                          className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                        />
                        <button
                          onClick={() => void handleUpdateUser(user.id)}
                          disabled={loading}
                          className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                        >
                          Speichern
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-400">Noch keine Nutzer gefunden.</p>
                )}
              </div>
            </div>
            </>
          )}

          {message ? <p className="mt-4 text-sm text-stone-300">{message}</p> : null}
        </section>
      </div>
    </main>
  );
}
