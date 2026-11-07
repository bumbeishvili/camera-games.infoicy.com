// A computer whose GPU can't run the models has to fall back to its CPU, which is slower but
// works. The library can only load its engine once, so this used to fail on the second try.
// Here the first try fails in the way a real GPU problem would, after the engine has loaded.
import { expect, test } from './helpers.js';

for (const script of ['tracker.worker.js', 'body/pose.worker.js']) {
  test(`${script} falls back to the CPU when the GPU fails`, async ({ page, pageErrors }) => {
    test.setTimeout(120_000);
    await page.goto('/package.json');
    const answer = await page.evaluate((name) => new Promise((resolve) => {
      const origin = location.origin;
      const wrapper = `
        import { HandLandmarker, PoseLandmarker } from '${origin}/vendor/mediapipe/vision_bundle.mjs';
        for (const Model of [HandLandmarker, PoseLandmarker]) {
          const real = Model.createFromOptions.bind(Model);
          Model.createFromOptions = (files, options) => (options.baseOptions.delegate === 'GPU'
            ? real(files, { ...options, baseOptions: { ...options.baseOptions, modelAssetPath: '${origin}/no-such-model.task' } })
            : real(files, options));
        }
        await import('${origin}/core/${name}');
        self.postMessage({ type: 'loaded' });`;
      const worker = new Worker(URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' })), { type: 'module' });
      worker.onerror = (event) => resolve({ type: 'crash', message: event.message });
      const realWorkerReply = (message) => {
        if (message.data.type === 'loaded') worker.postMessage({ type: 'init' });
        else resolve(message.data);
      };
      worker.onmessage = realWorkerReply;
    }), script);
    expect(answer).toEqual({ type: 'ready', delegate: 'CPU' });
    // The first try failing is the point of this test, and it logs why.
    pageErrors.length = 0;
  });
}
