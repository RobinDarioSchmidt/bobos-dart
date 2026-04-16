# Online Setup

## Empfohlener Gratis-Stack

- Hosting: Vercel Hobby
- Datenbank, Auth, Realtime: Supabase Free

Stand: geprueft am 16. April 2026 auf den offiziellen Preis-/Doku-Seiten.

## Warum dieser Stack?

- Next.js passt direkt zu Vercel.
- Supabase deckt Auth, Postgres, Realtime und einfache APIs in einem Dienst ab.
- Fuer eine kleine private Dart-App mit Freunden reicht der kostenlose Umfang typischerweise aus.

## Aktueller Projektstatus

Die App ist derzeit noch lokal-first:

- gesamte Spiel- und Trainingslogik laeuft im Browser
- Langzeitdaten liegen nur in `localStorage`
- keine Cloud-Synchronisation
- keine Benutzerkonten

## Zielbild fuer die Online-Version

Phase 1:

- Benutzerkonto pro Person
- Cloud-Speicherung von Profil, Match-Historie und Trainingsstatistik
- gleiche App weiterhin auf Vercel deploybar

Phase 2:

- Freunde / Gruppen
- Match-Einladungen
- optionale Realtime-Updates fuer gemeinsame Sessions

## Kostenannahme

Vercel:

- Hobby ist kostenlos
- sinnvoll fuer persoenliche und kleine Projekte

Supabase:

- Free Plan mit bis zu 2 aktiven Free-Projekten
- Auth, Postgres, Realtime und Storage inklusive
- laut Doku u. a. 500 MB Datenbankgroesse pro Projekt auf Free

## Supabase Einrichtung

1. Projekt in Supabase anlegen
2. SQL aus `supabase/schema.sql` im SQL Editor ausfuehren
3. URL und Anon Key in `.env.local` eintragen
4. App auf Vercel deployen
5. gleiche Variablen in Vercel als Environment Variables hinterlegen

## Environment Variablen

Kopiere `.env.example` nach `.env.local` und trage deine Werte ein:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Datenmodell

Das Schema bildet die erste sinnvolle Online-Stufe ab:

- `profiles`: oeffentliche Profildaten pro Benutzer
- `matches`: Match-Kopf mit Konfiguration
- `match_players`: Teilnehmer und Ergebnis pro Match
- `training_sessions`: gespeicherte Trainingslaeufe

## Was noch im Code fehlt

Das Repo enthaelt mit diesem Stand die Online-Grundlagen als Setup-Dateien, aber die App schreibt noch nicht in Supabase. Der naechste Implementierungsschritt waere:

1. Supabase Client ins Frontend einhaengen
2. Login / Sign-up bauen
3. lokale Statistiken optional in die Cloud migrieren
4. Match speichern statt nur `localStorage`

## Empfehlung fuer kostenlos bleiben

- zuerst ohne Realtime starten
- keine Bilder / Uploads einbauen, solange sie nicht noetig sind
- nur Match- und Trainingsdaten speichern
- ein einziges Supabase-Projekt fuer eure Gruppe nutzen
