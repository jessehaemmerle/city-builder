# 🏙 RETROPOLIS — 16-Bit City Builder

Ein retro-inspiriertes City-Building-Spiel im Stil der 16-Bit-Ära (SNES), komplett
im Browser spielbar und in einem Docker-Container ausgeliefert.

![Retropolis bei Tag](docs/screenshot-city.png)

Alle Texturen sind **selbst entworfene Pixel-Art**, die zur Laufzeit im Code erzeugt
wird (ASCII-Pixelart + prozedurale Kacheln) — es gibt keinerlei externe Assets,
Bibliotheken oder Build-Schritte. Auch die Chiptune-Musik und alle Soundeffekte
werden live per WebAudio synthetisiert.

![Retropolis bei Nacht](docs/screenshot-night.png)

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
4. Zonen mit **Strom** und einer **Straße/Schiene im Umkreis von 3 Feldern**
   entwickeln sich über 4 Stufen — vom Häuschen zum Hochhaus.
5. **Wasser**: Ab Stufe 2 brauchen Zonen Wasserversorgung — Wasserturm bauen
   oder Pumpwerk ans Ufer setzen.
6. Mit **Polizei, Feuerwehr, Schule, Krankenhaus, Parks** Zufriedenheit und
   **Landwert** steigern — bei hohem Landwert entstehen Luxus-Hochhäuser.
7. Meilensteine schalten **Rathaus, Stadion, Denkmal und Casino** frei.

### Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Bauen (Straßen/Schienen/Leitungen als Linie, Zonen als Rechteck) |
| Rechtsklick / Ziehen | Karte verschieben |
| Mausrad / `+` `-` | Zoom (1×–4×) |
| `1`–`0` | Werkzeuge wählen |
| `Strg+Z` / `Strg+Y` | Rückgängig / Wiederholen |
| `ESC` | Info-Werkzeug (Kachel abfragen) |
| Leertaste | Pause |
| `WASD` / Pfeiltasten | Karte verschieben |
| Touch | Tippen = bauen, Ziehen = verschieben, Pinch = Zoom |

### Simulation

- **RCI-Nachfrage**: Wohnen, Gewerbe und Industrie beeinflussen sich gegenseitig
  (Jobs ⇄ Einwohner), angezeigt als Balken in der Statusleiste.
- **Stromnetz**: Kraftwerke speisen ein Netz aus Straßen, Schienen, Leitungen und
  Gebäuden. Zu wenig Erzeugung ⇒ Brownouts.
- **Wassernetz**: Wasserturm (Radius 7) und Pumpwerk am Ufer (Radius 12) versorgen
  Zonen — ohne Wasser ist bei Stufe 2 Schluss.
- **Verkehr**: Entwickelte Zonen erzeugen Verkehr auf den Straßen; Staus bremsen
  Wachstum und Zufriedenheit. Animierte Autos fahren durch die Stadt, auf
  Schienen rollt ein Zug. Schienen erschließen staufrei.
- **Brücken**: Straßen, Schienen und Leitungen können Flüsse überqueren (3× Kosten).
- **Landwert**: Wasserlage, Parks und Sicherheit steigern ihn; Verschmutzung und
  Stau drücken ihn. Hoher Landwert ⇒ Luxus-Gebäudevarianten und schnelleres Wachstum.
- **Budget & Kredite**: monatliche Steuern minus Unterhalt; bei Ebbe in der Kasse
  Kredite in 5.000-€-Schritten (1,5% Zins/Monat), jederzeit tilgbar.
- **Katastrophen**: Brände, **Tornados**, **Hochwasser** am Ufer — und
  gelegentlich ein **UFO** 👽 (alles abschaltbar).
- **Berater**: Fünf Berater-Charaktere mit Pixel-Porträts melden sich bei
  Geldnot, Stromausfall, Smog, fehlender Feuerwehr oder Wassermangel.
- **Meilensteine**: Boni bei 100 / 500 / 1.500 / 2.500 / 4.000 Einwohnern
  inkl. Freischaltung der Belohnungsgebäude.

### Spielmodi

- **Freies Spiel** — klassisch, eigene Karte per Größe (48–96) und Seed mit Vorschau.
- **Sandbox** — unbegrenztes Geld, Katastrophen aus.
- **Szenarien** mit Sieg-/Niederlagen-Bedingungen:
  - *Wachstums-Sprint*: 1.000 Einwohner in 5 Jahren.
  - *Grüne Metropole*: 2.000 Einwohner + 55% Zufriedenheit ohne Kohlekraft in 10 Jahren.
  - *Die Pleite-Stadt*: Übernimm eine verschuldete Bestandsstadt und saniere sie.

### Moderne Features im Retro-Gewand

- Drag-Bau mit Live-Vorschau und Kostenanzeige, **Undo/Redo**
- 10 Daten-Overlays: Strom, Wasser, Verkehr, Landwert, Umwelt, Polizei,
  Feuerwehr, Bildung, Gesundheit, Freizeit
- **Statistik-Panel** mit Verlaufsgraphen (Einwohner, Kasse, Zufriedenheit)
- **Tag/Nacht-Zyklus** mit leuchtenden Fenstern und Auto-Scheinwerfern
- **3 Save-Slots** mit Autosave, Export/Import als JSON-Datei
- Minimap, 3 Geschwindigkeiten + Pause, Meldungs-Toasts, Einsteiger-Tipps
- Animiertes Wasser, drehende Windräder, Rauch, fahrende Autos und Züge
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
        ├── sprites.js    # Pixel-Art-Engine: alle Texturen als Code, Nacht-Atlas
        ├── sim.js        # Simulation: Terrain, Strom, Wasser, RCI, Landwert,
        │                 #   Verkehr, Budget/Kredite, Katastrophen, Szenarien
        ├── audio.js      # WebAudio-Chiptunes & SFX
        └── main.js       # Rendering, Eingabe, UI, Fahrzeuge, Tag/Nacht,
                          #   Undo/Redo, Berater, Statistik, Save-Slots
```

Reines Vanilla-JavaScript (ES2020), keine Abhängigkeiten, kein Build-Schritt —
der Container ist ein statischer nginx mit ~100 KB Spielcode.

## 🧪 Entwicklung

Lokal ohne Docker genügt ein beliebiger statischer Server:

```bash
npx http-server web -p 8080
```
