/* ============================================================
 * RETROPOLIS — Balancing
 * ALLE Tuning-Konstanten der Simulation an einem Ort.
 * Nach Änderungen: `npm run benchmark` prüft die Wachstumskurven.
 * ============================================================ */
'use strict';

(function (g) {
  const BAL = {
    START_MONEY: 25000,

    // Einwohner/Jobs pro Zonen-Level (Index = Level 0..4)
    R_POP:  [0, 8, 20, 45, 90],
    C_JOBS: [0, 5, 12, 28, 60],
    I_JOBS: [0, 7, 16, 34, 70],

    // RCI-Nachfrage: Rückkopplung > 1, damit Städte bis zur
    // Zonen-Kapazität wachsen können (siehe test/benchmark.js)
    DEMAND: {
      WORKER_SHARE: 0.6,   // Anteil Erwerbstätiger an der Bevölkerung
      R_JOBS_F: 1.6, R_BASE: 60, R_DIV: 140,
      C_WORK_F: 0.8, C_DIV: 100,
      I_WORK_F: 0.9, I_BASE: 20, I_DIV: 100,
      TAX_NEUTRAL: 9,      // Steuersatz ohne Malus
      TAX_F_MAX: 1.25, TAX_F_MIN: 0.2, TAX_F_DIV: 12,
    },

    GROWTH: {
      TRIES_MIN: 4, TRIES_F: 0.10,   // Wachstumsversuche pro Tag
      BASE_P: 0.55,                  // Grundwahrscheinlichkeit × Nachfrage
      POLL_LIMIT: 30, POLL_PENALTY: 0.35,
      LANDV_MIN_F: 0.6, LANDV_SPAN_F: 0.8,
      PARK_BONUS_DIV: 250,
      JAM_LIMIT: 75, JAM_PENALTY: 0.55,
      HIGH_LVL_SLOW: 0.4,            // Stufe 3+ wächst langsamer
      WATER_MIN_COV: 20, WATER_FREE_LVL: 2, // ohne Wasser max. Stufe 2
      // moderat, damit ein zerstörtes Kraftwerk die Stadt nicht in Tagen
      // auslöscht, bevor der Spieler reagieren kann (Benchmark-Befund)
      DECAY_NO_INFRA: 0.10, DECAY_DEMAND: 0.12, DEMAND_DECAY_AT: -0.35,
      SMALL_TOWN_POP: 150,           // darunter: Wachstum ohne Pendler-Verbindung
    },

    HAPPY: {
      BASE: 55,
      TAX_PENALTY: 2.5, TAX_BONUS_MAX: 8,
      COV_POLICE: 0.08, COV_SCHOOL: 0.08, COV_HEALTH: 0.07,
      COV_PARK: 0.10, COV_WATER: 0.04,
      POLL_F: 0.35,
      JAM_FREE: 50, JAM_F: 0.12,
      UNEMPLOYED_F: 30,
      BROWNOUT: 8, TOWNHALL: 3, CASINO: 2,
    },

    MONEY: {
      TAX_POP: 1.0, TAX_JOBS: 0.5,
      LOAN_STEP: 5000, LOAN_RATE: 0.015,
      BRIDGE_FACTOR: 3,
    },

    POLLUTION: {
      IZONE_PER_LVL: 14, COAL: 55, ROAD_BASE: 2, ROAD_TRAFFIC_F: 0.04,
      GREEN: -6, DIFFUSE_GAIN: 1.35, PASSES: 2,
    },

    LANDV: {
      BASE: 35, WATER: 14,
      PARK_F: 0.28, POLICE_F: 0.06,
      POLL_F: 0.5, JAM_F: 0.10,
      LUX_MIN: 62,                   // ab hier Luxus-Sprites (Stufe 4)
    },

    TRAFFIC: {
      FLOW_PER_LVL: 2,               // Pendlerfluss pro Wohn-Level auf dem Weg
      MAX_PATH: 200,                 // Sicherheitslimit Pfadlänge
      JAM_RADIUS: 2,                 // Umkreis für Stau-Wirkung auf Zonen
    },

    DISASTER: {
      MIN_POP: 150,
      FIRE_P: 0.10, TORNADO_P: 0.03, FLOOD_P: 0.03,
      UFO_P: 0.012, UFO_FROM_YEAR: 3,   // Jahre nach Spielstart
      FIRE_BURN: 14, FIRE_SPREAD_BURN: 12,
      FIRE_COV_SAFE: 40, FIRE_COV_STOP: 55, FIRE_COV_FAST: 30,
    },

    // ÖPNV: Linien machen Pendelwege kürzer und nehmen Autos von der Straße.
    // segDiv: je größer, desto "schneller" fühlt sich das Verkehrsmittel an
    // (Segmentkosten = Weglänge/segDiv + 1), board = Einstiegs-/Wartekosten.
    TRANSIT: {
      GATE_RADIUS: 2,          // max. Abstand Stopp → Straße/Schiene
      MAX_DIST: 1024,          // Obergrenze Pendeldistanz (Bucket-Dijkstra)
      FARE: 0.03,              // € je Fahrgast und Monat
      bus:   { board: 2, segDiv: 4, lineUpkeep: 15, stopUpkeep: 2 },
      train: { board: 3, segDiv: 8, lineUpkeep: 40, stopUpkeep: 4 },
      sub:   { board: 3, segDiv: 6, lineUpkeep: 60, stopUpkeep: 6 },
    },

    // Wassernetz: Türme/Pumpwerke speisen Rohre, Straßen und Gebäude
    // (analog zum Stromnetz, mit eigener Kapazität)
    WATER: {
      TOWER_SUPPLY: 100,     // Einheiten je Wasserturm
      PUMP_SUPPLY: 250,      // Einheiten je Pumpwerk (am Wasser)
      SHORT_HAPPY: 6,        // Zufriedenheits-Malus bei Wassermangel
    },

    // Tourismus: Attraktionen locken Besucher, Hotels beherbergen sie.
    // Ein eigener, mit der Stadt skalierender Einnahmestrom — Angebot
    // (Hotelbetten) trifft Nachfrage (Attraktionen × Zufriedenheit).
    TOURISM: {
      HOTEL_BEDS: 50,        // Touristen-Betten je Hotel (mit Strom)
      SPEND: 4,              // € je Tourist und Monat
      HAPPY_MIN: 30,         // darunter kommen kaum Touristen
      HAPPY_DIV: 55,         // Zufriedenheits-Faktor: (Glück − Min) / Div
      ECON_F: 0.4,           // Konjunktureinfluss auf die Nachfrage
      EXT_FULL: 1.0,         // mit Außenanbindung: voller Zustrom
      EXT_LOCAL: 0.3,        // ohne Anbindung: nur lokale Ausflügler
      ATTRACT: {             // Anziehungskraft je Attraktion
        park: 4, stadium: 45, monument: 35, casino: 20, amuse: 70,
      },
    },

    // Wirtschaft: Konjunktur + Außenhandel über Randverbindungen & Häfen
    ECONOMY: {
      CYCLE_MONTHS: 48,        // Länge eines Konjunkturzyklus
      NOISE: 0.25,             // seeded Zufallsanteil am Zyklus
      DEMAND_F_CI: 0.25,       // Nachfrage-Ausschlag Gewerbe/Industrie
      DEMAND_F_R: 0.12,        // Nachfrage-Ausschlag Wohnen
      PHASE_HI: 0.45, PHASE_LO: -0.45, // Boom-/Rezessions-Schwellen
      EXPORT_PER_IJOB: 0.6,    // € je exportierendem Industriejob und Monat
      CAP_ROAD: 80,            // Export-Kapazität je Straßen-Randanschluss
      CAP_RAIL: 250,           // … je Schienen-Randanschluss
      CAP_PORT: 400,           // … je Hafen
      NO_EXPORT_PENALTY: 0.5,  // Industrie-Wachstumsfaktor ohne Außenanbindung
      NO_EXPORT_MIN_POP: 300,  // darunter greift die Strafe nicht
    },

    // Epochen: die Zeit verändert das Spiel (Start 1990)
    ERA: {
      SOLAR_YEAR: 1994,       // Solaranlage wird verfügbar
      SOLAR_POWER: 45,
      SOLAR_UP_YEAR: 2002,    // bessere Module
      SOLAR_POWER2: 65,
      COAL_TAX_YEAR: 1998,    // CO₂-Abgabe: Kohle-Unterhalt steigt
      COAL_UPKEEP_F: 1.5,
      ECAR_YEAR: 2000,        // E-Autos: Straßenverschmutzung sinkt jährlich
      ECAR_POLL_DECAY: 0.06,
      ECAR_POLL_MIN: 0.35,
    },

    // [Einwohner, Bonus, Ereignis-Key]
    MILESTONES: [
      [100, 1000, 'ev.ms0'],
      [500, 2500, 'ev.ms1'],
      [1500, 5000, 'ev.ms2'],
      [2500, 7500, 'ev.ms3'],
      [4000, 10000, 'ev.ms4'],
    ],
  };

  g.BAL = BAL;
  if (typeof module !== 'undefined' && module.exports) module.exports = BAL;
})(typeof globalThis !== 'undefined' ? globalThis : window);
