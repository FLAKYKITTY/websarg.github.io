/*
  Refactored entrypoint: core logic moved to modules for maintainability.
  Tombstones indicate removed implementations that now live in separate files.
*/

import { initThree, animateOnce } from './three-init.js';
import { setupModelLoader, frameModel } from './model-loader.js';
import { setupGenerator } from './generator.js';
import { setupUI } from './ui.js';

// removed: full original implementations of initThree(), loadModel(), generateLayers(), etc.
// removed function initThree() {}
// removed function loadModel() {}
// removed function generateLayers() {}
// removed other helper functions and large inline implementations...

// initialize Three.js and other modules
initThree();
setupModelLoader();
setupGenerator();
setupUI();

// keep a compact animation tick to preserve interactivity
(function loop(){
  requestAnimationFrame(loop);
  animateOnce();
})();