# Deployment Schritt fuer Schritt

Diese Anleitung ist fuer absolute Einsteiger gedacht. Folge die Schritte genau in der Reihenfolge.

Ziel:

- App lokal testen
- Supabase fuer Login und Cloud-Daten einrichten
- App kostenlos auf Vercel veroeffentlichen

## Teil 1: Was du am Ende haben wirst

Wenn du fertig bist, hast du:

- eine oeffentliche Webadresse fuer die App
- Login mit E-Mail und Passwort
- Cloud-Speicherung fuer Match-Historie und Trainingsdaten
- weiterhin lokale Nutzung als Fallback

## Teil 2: Was du vorher brauchst

Du brauchst:

- eine E-Mail-Adresse
- einen kostenlosen Account bei Supabase
- einen kostenlosen Account bei Vercel
- optional GitHub, wenn du per Git deployen willst

## Teil 3: Supabase Projekt anlegen

1. Gehe auf [supabase.com](https://supabase.com/)
2. Klicke auf `Start your project`
3. Registriere dich oder logge dich ein
4. Klicke im Dashboard auf `New project`
5. Waehle deine Organisation aus
6. Vergib einen Projektnamen
   Empfehlung: `bobos-dart`
7. Vergib ein Datenbank-Passwort
   Wichtig: Dieses Passwort irgendwo sicher notieren
8. Waehle eine Region
   Empfehlung: die Region, die deinem Wohnort am naechsten ist
9. Klicke auf `Create new project`
10. Warte, bis das Projekt fertig erstellt ist

## Teil 4: Datenbank-Schema einspielen

1. Oeffne in Supabase dein neues Projekt
2. Klicke links im Menue auf `SQL Editor`
3. Klicke auf `New query`
4. Oeffne lokal die Datei [supabase/schema.sql](D:/BobosDart/bobos-dart/supabase/schema.sql)
5. Kopiere den kompletten Inhalt
6. Fuege alles in das SQL-Fenster in Supabase ein
7. Klicke auf `Run`
8. Warte auf die Erfolgsmeldung

Wenn ein Fehler kommt:

- nicht weitermachen
- Fehlermeldung kopieren
- mir schicken

## Teil 5: Supabase Projektwerte holen

Jetzt brauchst du zwei Werte fuer die App:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

So findest du sie:

1. In Supabase links auf `Settings`
2. Dann auf `Data API` oder `API`
   Die genaue Bezeichnung kann je nach Ansicht leicht anders sein
3. Suche die Projekt-URL
   Das ist dein `NEXT_PUBLIC_SUPABASE_URL`
4. Suche den `anon` oder `publishable` Key
   Das ist dein `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Wichtig:

- Nicht den `service_role` Key verwenden
- Nur den `anon` bzw. `publishable` Key verwenden

## Teil 6: Lokale Umgebungsdatei anlegen

1. Oeffne den Projektordner [bobos-dart](D:/BobosDart/bobos-dart)
2. Erstelle dort eine neue Datei mit dem Namen:

```text
.env.local
```

3. Oeffne als Vorlage die Datei [.env.example](D:/BobosDart/bobos-dart/.env.example)
4. Kopiere diesen Inhalt in `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

5. Ersetze beide Werte mit deinen echten Supabase-Werten
6. Datei speichern

Wichtig:

- `.env.local` nicht oeffentlich teilen
- die Datei nicht in einen Screenshot posten

## Teil 7: Lokalen Test starten

Im Projektordner [bobos-dart](D:/BobosDart/bobos-dart):

```bash
npm run dev
```

Dann:

1. Oeffne [http://localhost:3000](http://localhost:3000)
2. Suche den Bereich `Cloud Sync`
3. Klicke auf `Registrieren`
4. Gib E-Mail und Passwort ein
5. Erstelle ein Konto

## Teil 8: Wichtige Supabase Auth-Einstellung

Laut Supabase ist E-Mail/Passwort standardmaessig aktiviert, und bei gehosteten Projekten ist E-Mail-Bestaetigung standardmaessig oft eingeschaltet.

Das bedeutet:

- Es kann sein, dass du erst einen Link in deiner E-Mail anklicken musst
- Vorher funktioniert Login eventuell noch nicht komplett

So pruefst du das:

1. In Supabase links auf `Authentication`
2. Dann auf `Providers`
3. Oeffne den Bereich `Email`
4. Pruefe:
   - Email Provider ist aktiviert
   - Password Sign-In ist aktiviert

Wenn du es fuer den Anfang einfacher willst:

- du kannst Email Confirmation testweise deaktivieren

Wenn du es sicherer willst:

- aktiviert lassen und die E-Mail bestaetigen

Offizielle Info dazu:
[Supabase Password Auth](https://supabase.com/docs/guides/auth/passwords)

## Teil 9: Cloud-Speicherung testen

Nach erfolgreichem Login:

1. Spiele ein Match zu Ende
2. Spiele optional eine Trainingssession zu Ende
3. Schaue im Bereich `Cloud Sync`, ob eine Erfolgsnachricht erscheint
4. Klicke auf `Cloud-Historie laden`
5. Pruefe, ob die Match-Historie sichtbar ist

Wenn nichts gespeichert wird:

- zuerst pruefen, ob du wirklich eingeloggt bist
- dann pruefen, ob in Supabase das Schema erfolgreich erstellt wurde
- dann mir die Fehlermeldung schicken

## Teil 10: Vercel Account anlegen

1. Gehe auf [vercel.com](https://vercel.com/)
2. Klicke auf `Sign Up`
3. Am einfachsten: mit GitHub registrieren
4. Danach im Vercel Dashboard landen

## Teil 11: App nach Vercel bringen

Es gibt zwei Wege.

### Einfachster Weg fuer Einsteiger

Nimm GitHub + Vercel Import.

Du brauchst dafuer ein GitHub-Repository mit deinem Projekt.

Falls du noch kein GitHub-Repo hast:

1. GitHub oeffnen
2. Neues Repository anlegen
3. Projekt hochladen

Wenn das Repo schon existiert:

1. In Vercel auf `Add New...`
2. `Project` waehlen
3. GitHub verbinden, falls Vercel danach fragt
4. Dein Repository auswaehlen
5. Auf `Import` klicken

Offizielle Next.js-Hinweise:
[Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)

## Teil 12: Environment Variablen in Vercel setzen

Das ist sehr wichtig. Ohne diesen Schritt funktioniert Supabase online nicht.

1. In Vercel dein Projekt oeffnen
2. Auf `Settings`
3. Auf `Environment Variables`
4. Erste Variable anlegen:
   - Name: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: deine Supabase URL
5. Zweite Variable anlegen:
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Value: dein Supabase Anon Key
6. Beide fuer mindestens `Production` setzen
   Empfehlung: auch `Preview` und `Development` auswaehlen
7. Speichern

Wichtig laut Vercel:

- Aenderungen an Environment Variables gelten nicht rueckwirkend fuer alte Deployments
- du musst danach neu deployen

Offizielle Vercel Doku:
[Vercel Environment Variables](https://vercel.com/docs/environment-variables)
[Managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)

## Teil 13: Deploy ausloesen

Wenn du das Projekt gerade importiert hast:

- Vercel startet normalerweise automatisch den ersten Deploy

Wenn du die Environment Variables erst danach gesetzt hast:

1. Gehe in Vercel auf `Deployments`
2. Suche den neuesten Deploy
3. Klicke auf die drei Punkte
4. Klicke `Redeploy`

## Teil 14: Supabase Redirect / Site URL pruefen

Wenn Login oder E-Mail-Bestaetigung online nicht sauber funktioniert, liegt es oft an fehlenden Redirect-URLs.

In Supabase:

1. Gehe auf `Authentication`
2. Gehe zu URL-/Redirect-Einstellungen
3. Trage dort deine Vercel-URL ein

Beispiele:

- `https://dein-projektname.vercel.app`
- spaeter optional deine eigene Domain

Wenn lokal und online beides funktionieren soll, trage auch lokal ein:

- `http://localhost:3000`

Hinweis:
Die Supabase Auth-Doku sagt, dass `emailRedirectTo` bzw. Redirect URLs zur Projekt-Konfiguration passen muessen.

## Teil 15: Online testen

Wenn Vercel den Deploy abgeschlossen hat:

1. Oeffne die Vercel-URL
2. Registriere einen Testnutzer oder logge dich ein
3. Beende ein Match
4. Klicke auf `Cloud-Historie laden`
5. Pruefe, ob der Eintrag erscheint

## Teil 16: Ist die App dann wirklich online?

Ja.

Dann bedeutet `online`:

- jeder mit der URL kann die Website aufrufen
- Login und Cloud-Daten laufen ueber Supabase
- das Frontend liegt auf Vercel
- die Datenbank liegt bei Supabase

## Teil 17: Was noch nicht vollstaendig online ist

Mit dem aktuellen Code ist schon online moeglich:

- Registrierung / Login
- Match-Historie in der Cloud
- Trainingsdaten in der Cloud

Was wir als naechstes verbessern sollten:

- Cloud-Statistiken sauber laden
- Profilseite
- Passwort-Reset
- bessere Anzeige von Fehlern
- spaeter Freunde / Gruppen / Einladungen

## Teil 18: Wenn du irgendwo haengst

Wenn ein Schritt nicht funktioniert, schick mir am besten genau:

1. bei welchem Schritt du bist
2. was du geklickt hast
3. die genaue Fehlermeldung
4. einen Screenshot, falls moeglich

Dann fuehre ich dich durch genau diesen einen Punkt.
