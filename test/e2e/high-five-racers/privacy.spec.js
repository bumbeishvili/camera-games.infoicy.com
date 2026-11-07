// These are children's camera pictures: nothing may leave the computer.
import {
  expect,
  openGame,
  reachRace,
  show,
  test,
  waitForHand,
  waitUntilMoving,
} from '../helpers.js';

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  await page.waitForTimeout(1500);

  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);
  expect(requests.length).toBeGreaterThan(5);

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'picture' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);

  // A failed fetch alone could just be a network problem. This has to be the page's own
  // policy doing the blocking. These are the only errors this test expects, so they are
  // cleared here rather than failing it.
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'\"");
  pageErrors.length = 0;
});
