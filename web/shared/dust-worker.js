/*! Made with care and love by Mina Vian */
// Draws the Never track list's dust (dust-engine.js) off the page's thread.
import { Runner } from './dust-engine.js';

const runner = new Runner(cb => requestAnimationFrame(cb));
self.onmessage = e => runner.message(e.data);
