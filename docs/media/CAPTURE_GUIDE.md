# Capture Guide (Screenshots + GIFs)

## Ziel-Dateien

Lege diese Dateien in `docs/media/` ab:

- `home.png`
- `speed-mode.png`
- `settings.png`
- `device-scan.gif`
- `create-and-print.gif`

## Screenshots (Windows)

1. App starten: `npm run start`
2. Gewünschte Ansicht öffnen (Home, Speed, Settings)
3. `Win + Shift + S` fuer Bereich aufnehmen
4. Bild als PNG in `docs/media/` speichern

Empfohlene Groesse:

- 1600x900 oder 1920x1080
- Keine Browser-/Taskleisten-Raender
- Einheitliches Theme (hell oder dunkel) fuer alle Shots

## GIFs aufnehmen

Empfohlenes Tool: ScreenToGif

1. Aufnahmebereich auf App-Fenster begrenzen
2. 6-12 Sekunden aufnehmen
3. Auf 12-15 FPS reduzieren
4. Groesse max. 1280px Breite
5. Als GIF in `docs/media/` exportieren

## Qualitaetscheck vor Commit

- Text ist lesbar
- Keine sensiblen Daten sichtbar
- Dateigroesse moeglichst klein halten (GIF < 8 MB)
- Dateinamen exakt wie oben
