/* Lädt die DOM-freie Simulation in Node (für Tests & Benchmarks). */
'use strict';
globalThis.BAL = require('../web/js/balance.js');
globalThis.I18N = require('../web/js/i18n.js');
module.exports = require('../web/js/sim.js');
