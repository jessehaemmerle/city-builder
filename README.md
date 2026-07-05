# 🏙 RETROPOLIS — 16-Bit City Builder

Ein retro-inspiriertes City-Building-Spiel im Stil der 16-Bit-Ära (SNES), komplett
im Browser spielbar und in einem Docker-Container ausgeliefert.

![Retropolis](docs/screenshot-city.png)

Alle Texturen sind **selbst entworfene Pixel-Art**, die zur Laufzeit im Code erzeugt
wird (ASCII-Pixelart + prozedurale Kacheln) — es gibt keinerlei externe Assets,
Bibliotheken oder Build-Schritte. Auch die Chiptune-Musik und alle Soundeffekte
werden live per WebAudio synthetisiert.

## 🚀 Schnellstart

```bash
docker compose up --build
```

Dann im Browser öffnen: **http://localhost:8080**

Alternativ ohne Compose:

```bash
docker build -t retropolis .
docker run -p 8080:80 retropolis
```

## 🎮 So wird gespielt

Du bist Bürgermeister:in. Baue Straßen und Kraftwerke, weise Zonen aus und
bring deine Stadt vom Dorf zur Metropole.

1. **Straßen (3)** bauen — sie erschließen Zonen und leiten Strom.
2. **Windrad (8)** oder **Kohlekraftwerk (9)** neben dem Straßennetz platzieren.
3. **Zonen ziehen**: Wohnen (5), Gewerbe (6), Industrie (7) — per Drag als Rechteck.
4. Zonen mit **Strom** (Straße/Leitung) und einer **Straße im Umkreis von 3 Feldern**
   entwickeln sich automatisch über 4 Stufen — vom Häuschen zum Hochhaus.
5. Mit **Polizei, Feuerwehr, Schule, Krankenhaus, Parks** Zufriedenheit und
   Wachstum steigern. Ab 1.500 Einwohnern wird das **Stadion** freigeschaltet.

### Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Bauen (Straßen/Leitungen als Linie, Zonen als Rechteck) |
| Rechtsklick / Ziehen | Karte verschieben |
| Mausrad / `+` `-` | Zoom (1×–4×) |
| `1`–`0` | Werkzeuge wählen |
| `ESC` | Info-Werkzeug (Kachel abfragen) |
| Leertaste | Pause |
| `WASD` / Pfeiltasten | Karte verschieben |
| Touch | Tippen = bauen, Ziehen = verschieben, Pinch = Zoom |

### Simulation

- **RCI-Nachfrage**: Wohnen, Gewerbe und Industrie beeinflussen sich gegenseitig
  (Jobs ⇄ Einwohner), angezeigt als Balken in der Statusleiste.
- **Stromnetz**: Kraftwerke speisen ein zusammenhängendes Netz aus Straßen,
  Leitungen und Gebäuden. Zu wenig Erzeugung ⇒ Brownouts.
- **Budget**: monatliche Steuereinnahmen minus Unterhalt; Steuersatz einstellbar
  (hohe Steuern bremsen Nachfrage und Zufriedenheit).
- **Umwelt**: Industrie und Kohlekraft verschmutzen, Parks und Wald gleichen aus.
  Wohngebiete meiden verschmutzte Lagen.
- **Katastrophen**: ohne Feuerwehr-Abdeckung brechen Brände aus und breiten
  sich aus (abschaltbar).
- **Meilensteine**: Boni bei 100 / 500 / 1.500 / 4.000 Einwohnern.

### Moderne Features im Retro-Gewand

- Drag-Bau mit Live-Vorschau und Kostenanzeige
- Daten-Overlays: Stromnetz, Umwelt, Polizei-/Feuerwehr-/Bildungs-/Gesundheits-Abdeckung
- Minimap mit Viewport und Schnellnavigation
- Autosave (localStorage) + Weiterspielen-Button
- 3 Spielgeschwindigkeiten + Pause, Tooltips, Meldungs-Toasts, Einsteiger-Tipps
- Animiertes Wasser, drehende Windräder, Rauch, Tag-für-Tag-Simulation
- CRT-Scanline-Effekt (abschaltbar), Chiptune-Soundtrack (abschaltbar)

## 🗂 Projektstruktur

```
├── Dockerfile            # nginx:alpine, liefert web/ aus
├── docker-compose.yml    # Port 8080 → 80
├── nginx.conf
└── web/
    ├── index.html        # UI-Gerüst (Statusleiste, Werkzeugleiste, Dialoge)
    ├── style.css         # SNES-inspiriertes UI, CRT-Effekt
    └── js/
        ├── sprites.js    # Pixel-Art-Engine: alle Texturen als Code
        ├── sim.js        # Simulation: Terrain, Strom, RCI, Budget, Brände
        ├── audio.js      # WebAudio-Chiptunes & SFX
        └── main.js       # Rendering, Eingabe, UI, Spielschleife, Save/Load
```

Reines Vanilla-JavaScript (ES2020), keine Abhängigkeiten, kein Build-Schritt —
der Container ist ein statischer nginx mit ~60 KB Spielcode.

## 🧪 Entwicklung

Lokal ohne Docker genügt ein beliebiger statischer Server:

```bash
npx http-server web -p 8080
```
