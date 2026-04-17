# Bobo's Dart

Eine lokale Dart-Scoring-App auf Basis von Next.js 16, React 19 und Tailwind CSS 4.

## Enthaltene Funktionen

- 301- und 501-Modus
- Zwei lokale Spieler mit frei editierbaren Namen
- Legs- und Sets-Matchmodus
- Double-Out oder Straight-Out
- Eingabe einzelner Darts, Segmenten (`S`, `D`, `T`, Bull) oder kompletter Besuche
- Undo fuer den letzten Dart oder den letzten Besuch
- Checkout-Hinweise fuer gaengige Restscores
- Average, beste Aufnahme und legweise Besuchshistorie pro Spieler
- Lokale Browser-Statistiken und Match-Historie
- Trainingsmodus mit `Around the Clock` und `Bull Drill`
- Lokale Trainingsstatistik im Browser
- Online-Setup-Dateien fuer Vercel + Supabase in `docs/online-setup.md` und `supabase/schema.sql`
- Admin-Flow fuer manuell angelegte Nutzer unter `/admin`

## Entwicklung

```bash
npm run dev
```

Die App laeuft danach unter [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
npm run build
npm run start
```

## Projektstruktur

- `app/page.tsx`: komplette Spieloberflaeche fuer Match-Modus, Training, Segment-Board und lokale Speicherung
- `app/layout.tsx`: App-Metadaten und Root-Layout
- `app/globals.css`: globale Styles und visuelle Basis
- `docs/online-setup.md`: Anleitung fuer eine kostenlose Online-Version
- `docs/deploy-step-by-step.md`: sehr genaue Schritt-fuer-Schritt-Anleitung fuer Supabase + Vercel
- `supabase/schema.sql`: erste Datenbankstruktur fuer Cloud-Speicherung
- `app/admin/page.tsx`: Admin-Seite fuer manuelle Nutzer und Test-Accounts
- `app/api/admin/users/route.ts`: sichere Server-Route zum Nutzer-Anlegen mit Service Role Key
