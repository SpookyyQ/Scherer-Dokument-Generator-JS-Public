# Scherer-Dokument-Generator-JS

Electron-Anwendung zur Erstellung und optionalem Druck von Service-Dokumenten (Label, Boardkarte, Checkliste) auf Basis von Lagerdaten, Druckerzuordnung und Netzwerkerkennung.

## Public-Repo Hinweis

Dieses Repository ist als **public-ready Vorlage** vorbereitet:

- `Lager.txt` enthält nur Demo-Daten
- sensible lokale Daten gehören in `Lager.local.txt` (wird ignoriert)
- `boardkarten/` und `checklisten/` sind absichtlich leer (nur `.gitkeep`)
- keine Firmware-/Zertifikatsartefakte im Repo
- Screenshots/GIFs nur anonymisiert hinzufügen

## Zweck der Anwendung

Die App reduziert den manuellen Aufwand bei Service-/Installationsprozessen:

- Gerätedaten eingeben oder automatisch aus `Lager.txt` laden
- Passende Vorlagen ermitteln
- Dokumente erzeugen
- Optional direkt drucken (pro Dokumenttyp steuerbar)
- Jobs nachvollziehbar in Historie und Statusanzeigen protokollieren

## Screenshots und GIFs (optional)

Wenn du Medien hinzufügen willst, nutze `docs/media/` und achte auf anonymisierte Inhalte.

Aufnahme-Anleitung: [docs/media/CAPTURE_GUIDE.md](docs/media/CAPTURE_GUIDE.md)

## Feature-Referenz

### 1) Dokumenterstellung (Kernfunktion)

Die App kann diese Dokumenttypen erzeugen:

- Label (`.docx`)
- Boardkarte (`.xlsx`)
- Checkliste (`.pdf`)

Pro Auftrag kann getrennt entschieden werden:

- Welche Dokumenttypen erstellt werden
- Welche Dokumenttypen zusätzlich gedruckt werden

Das geschieht über den Dialog **"Erstellen / Drucken"** (Main + Speed verfügbar).

### 2) Intelligente Datenübernahme

Autofill aus Lagerdaten funktioniert über:

- Seriennummer (Volltreffer)
- Seriennummer-Suffix (letzte 5 Stellen)
- IDNR (5-stellig)

Geladene Datensätze liefern u. a.:

- Modell
- IDNR
- Seriennummer
- Techniker

### 3) Modell-Normalisierung und Template-Matching

Die App normalisiert Modellbezeichnungen (z. B. Schreibweisen/Trennzeichen) und versucht automatisch:

- passende Boardkarten-Vorlage zu finden
- passende Checklisten-Vorlage aus dem Boardkartenkontext abzuleiten

Fehlende Vorlagen werden im UI sichtbar als Hinweis markiert.

### 4) Druckworkflow pro Dokumenttyp

Für Label, Boardkarte, Checkliste wird getrennt unterstützt:

- Ziel-Druckerzuordnung
- Erreichbarkeitsprüfung
- Druck-Ausführung via Python-Bridge (PySide-kompatibler Druckpfad)

Zusätzliche Drucklogik:

- Duplex-/Papier-Konfiguration per PowerShell
- Kyocera-Treiber-Präferenz für definierte Flows
- Bridge-Skript: `src/main/printing_bridge.py`

### 5) Speed-Modus mit Queue

Der Speed-Modus ist für schnelle Serienverarbeitung gedacht:

- Eingabe über letzte 5 Zeichen der Seriennummer
- Vorschau des gefundenen Datensatzes
- Optional Queue mit bis zu 3 Einträgen pro Durchlauf
- Eigenes Technikerkürzel + optionaler Druck

### 6) Netzwerk-Gerätescan

Geräte können über zwei Wege erkannt werden:

- aus bekannten Druckern
- zusätzlich über CIDR-Netzscan (z. B. `192.168.1.0/24`)

Technisch:

- Host-Reachability via Ping
- Gerätedaten via SNMP (Modell/Seriennummer/MAC)
- Abgleich mit Lagerdaten zur IDNR-/Modell-Zuordnung
- Gerätedialog mit direkter Übergabe in den Dokument-Flow

### 7) Dateien, Historie, Dashboard

- **Dateien-Seite**: zeigt erzeugte Output-Dateien, Doppelklick öffnet Datei
- **Job-Historie**: Zeit, Gerätedaten, Quelle, Druckstatus, Ergebnis
- **System-Status (Settings)**: Lagerquelle, Vorlagenanzahl, Druckeranzahl, Output-Dateien, etc.

### 8) UI-/UX-Optionen

- Dark/Light Theme
- Akzentfarben
- optionaler animierter Hintergrund (Presets)
- ein-/ausblendbarer Speed-Modus
- optionales Sidebar-Statusdiagramm

## UI im Detail

### Navigation / Seiten

Die Sidebar bietet diese Bereiche:

- **Hauptbildschirm**
- **Speed-Modus** (optional sichtbar)
- **Dateien**
- **Job-Historie**
- **Einstellungen**

Zusätzlich gibt es einen Floating-Button **"DOKUMENTE ERSTELLEN"** auf dem Hauptbildschirm.

### Hauptbildschirm

Hauptbestandteile:

- Geräteeingabe: Modell, IDNR, Seriennummer, Techniker, MAC, K-Nummer
- Auto-Print-Switch
- Dialog-Button "Erstellen/Drucken auswählen"
- Druckersektion mit Status-Badges
- Netzwerkscan mit Tabelle erkannter Geräte
- Vorlagenvorschau (Boardkarte/Checkliste)
- Status-Log (Textausgabe je Job)

Ablauf:

1. Daten manuell eingeben oder per IDNR/Seriennummer autofillen
2. Vorlagenprüfung und Druckerziele kontrollieren
3. Optional Dokument-/Druck-Toggles im Dialog setzen
4. Job starten (FAB)

### Geräte-Dialog (Netzwerkscan)

Per Doppelklick auf ein Gerät öffnet sich ein Detaildialog mit:

- Modell, IDNR, Seriennummer, MAC, Host, Treiber, Status
- Techniker-Eingabe
- Direktaktion "DOKUMENTE ERSTELLEN"

Damit lässt sich ein erkannter Netzwerkdrucker direkt in einen Job überführen.

### Dialog "Erstellen / Drucken"

Es gibt 6 Toggles:

- Erstellen: Label / Boardkarte / Checkliste
- Drucken: Label / Boardkarte / Checkliste

Regeln:

- Mindestens ein Dokumenttyp muss auf "Erstellen" stehen
- Druckschalter wirken nur bei aktivierter Druckausführung

### Speed-Modus

Ziel: schneller Batch-Flow bei bekannten Lagerdaten.

- Eingabe: letzte 5 Zeichen der Seriennummer
- Live-Treffervorschau
- Optional Queue-Modus (bis 3 Suffixe)
- eigener Startbutton mit Statusausgabe

### Dateien-Seite

- listet Output-Dateien absteigend nach Zeit
- zeigt Dateianzahl
- Öffnen des Output-Ordners
- Doppelklick auf Eintrag öffnet die jeweilige Datei

### Job-Historie

Tabelle mit:

- Zeit
- Modell / IDNR / Seriennummer / Techniker
- Quelle (z. B. Main, Speed, Device)
- Druckmodus
- Ergebnisstatus

Historie ist persistent und kann im UI geleert werden.

### Einstellungen

Funktionen:

- Sprache (`de` / `en`)
- Theme (`dark` / `light`)
- Speed-Modus sichtbar
- Sidebar-Chart sichtbar
- Akzentfarbe
- Hintergrundanimation + Preset
- Output-Ordner ändern
- System-Status aktualisieren

## Technische Architektur

- `src/main`: Electron Main, IPC, Job-/Druck-/Scan-Backends
- `src/renderer`: Frontend-UI und Event-Handling
- `src/shared`: Konstanten/Pfade

Wichtige Module:

- `dataProvider.js`: TXT + SQL-Provider (SQL vorbereitet)
- `docsGenerator.js`: Template-Ermittlung + Dokumentaufbereitung
- `printing.js`: JS-Bridge für Druckerstatus + Python-Druckaufrufe
- `printing_bridge.py`: offizieller Druckpfad (aus PySide übernommen)
- `deviceScanner.js`: Ping/SNMP/CIDR-Scan
- `jobRunner.js`: Orchestrierung Erstellen + optional Drucken

## Voraussetzungen

- Windows 10/11
- [Node.js](https://nodejs.org/) LTS (inkl. `npm`)
- installierte Drucker/Queues im Zielsystem
- Python 3 (`py -3`)
- `pywin32` für COM-Druck (`py -3 -m pip install pywin32`)

Optional für Fallback-Pfade im Python-Druck:

- LibreOffice (C:\Program Files\LibreOffice\program\soffice.exe)
- SumatraPDF
- Microsoft Word (COM)

## Installation und Start

```powershell
git clone https://github.com/SpookyyQ/Scherer-Dokument-Generator-JS.git
cd Scherer-Dokument-Generator-JS
npm install
npm run start
```

## Website (GitHub Pages)

Für eine öffentliche Produktseite ist GitHub Pages eine gute Option (kostenlos, schnell, direkt aus dem Repo).

- Website-Dateien liegen in `docs/`
- Setup-Anleitung: [docs/PAGES_SETUP.md](./docs/PAGES_SETUP.md)

## Verzeichnisse und Dateien

- `assets/` Label-Templates und UI-Assets
- `boardkarten/` Boardkarten-Vorlagen (`.xlsx`)
- `checklisten/` Checklisten-Vorlagen (`.pdf`)
- `Lager.txt` Lagerdatenquelle
- `output/` erzeugte Dokumente (wird automatisch erstellt)

## Datenquelle `Lager.txt`

Erwartete Spalten (Alias-Unterstützung vorhanden):

- IDNR: `IDNR` oder `IDNR_Hauptgeraet`
- Modell: `Bezeichnung` (bevorzugt), fallback `ModellBezeichnung`
- Seriennummer: `Serien_Nr`, `Seriennummer` oder `Seriennr`
- Techniker: `Techniker` oder `Name`

Default-Suchpfade:

- `./Lager.txt`
- `./assets/Lager.txt`
- `%USERPROFILE%\Desktop\Scherer\Lager.txt`

## Templates

Für vollständige Erstellung sollten vorhanden sein:

- `assets/0_-_Basis_aktuell_-_Kopie.docx`
- optionale K-Nummer-Labelvarianten (z. B. `assets/0_-_Basis_K-Nummer.docx`)
- Boardkarten-Templates in `boardkarten/`
- Checklisten-Templates in `checklisten/`

## Persistenz

Einstellungen werden gespeichert in:

- `%APPDATA%\SchererGenerator\settings.json`

Enthält u. a.:

- Druckerzuordnung
- Output-Pfad
- Theme/Accent/UI-Schalter
- Job-Historie
- Device-Scan-Einstellungen

## Entwicklung

```powershell
npm run dev
```

Aktuell identisch zu `npm run start` (Electron-Start).

## Changelog

Siehe [CHANGELOG.md](./CHANGELOG.md).

## Troubleshooting

### `fatal: detected dubious ownership`

```powershell
git config --global --add safe.directory C:/Users/jason/Documents/schererJS
```

Pfad auf dein lokales Repo anpassen.

### `git clone` fordert Login

Repository-Zugriff fehlt lokal. Verwende Git Credential Manager, PAT oder `gh auth login`.

