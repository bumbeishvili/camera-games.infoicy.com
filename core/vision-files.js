// What the tracking workers need to load MediaPipe's models.
import { FilesetResolver } from '../vendor/mediapipe/vision_bundle.mjs';
import engine from '../vendor/mediapipe/wasm/vision_wasm_module_internal.js';

const WASM_FOLDER = new URL('../vendor/mediapipe/wasm', import.meta.url).href;

export const visionFiles = () => FilesetResolver.forVisionTasks(WASM_FOLDER, true);

/**
 * Call before creating each model. The library clears its copy of the engine after every load
 * and expects importing the file again to bring it back, but a browser only ever runs a module
 * once. Without this, a second model fails, and so does falling back from the GPU to the CPU.
 */
export function prepareToLoad() {
  self.ModuleFactory = engine;
}
