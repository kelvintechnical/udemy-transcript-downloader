// UI integration against the production bundle with synthetic browser storage/API.
// This does not validate extension loading, Udemy authentication, or Edge policies.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('.output/chrome-mv3');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    globalThis.browser = {
      runtime: { id: 'mock-udemy-extension' },
      storage: { local: {
        get: async key => ({ [key]: JSON.parse(localStorage.getItem(key) || 'null') }),
        set: async data => { for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value)); },
      } },
      tabs: { query: async () => [] },
    };
  });
  await context.route('https://www.udemy.com/**', route => {
    const url = route.request().url();
    if (url.includes('subscriber-curriculum-items')) return route.fulfill({ json: { results: [{ _class: 'chapter', id: 10, title: 'Chapter' }, { _class: 'lecture', id: 20, title: 'Lecture', asset: { asset_type: 'Video' } }], next: null } });
    if (url.includes('/lectures/')) return route.fulfill({ json: { asset: { captions: [{ locale_id: 'en_US', url: 'https://a.udemycdn.com/caption.vtt' }] } } });
    const n = url.includes('course-two') ? 2 : 1;
    return route.fulfill({ contentType: 'text/html', body: `<title>Course ${n} | Udemy</title><div data-module-id="course-taking" data-module-args='{"courseId":${n}}'></div>` });
  });
  await context.route('https://a.udemycdn.com/**', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nBrowser transcript' }));
  const page = await context.newPage(); const errors = []; const downloads = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('download', download => downloads.push(download.suggestedFilename()));
  const url = `http://127.0.0.1:${server.address().port}/queue.html`;
  await page.goto(url);
  await page.locator('#urls').fill('https://www.udemy.com/course/course-one/\nhttps://www.udemy.com/course/course-two/');
  await page.locator('#add button').click();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 2 && [...document.querySelectorAll('article')].every(e => e.textContent.includes('completed')), null, { timeout: 15000 });
  await page.waitForTimeout(100);
  assert.equal(downloads.length, 2);
  assert.deepEqual(downloads.sort(), ['Course 1_1_Transcripts.zip', 'Course 2_2_Transcripts.zip']);
  const duplicate = await context.newPage(); await duplicate.goto(url);
  await duplicate.getByText('The download queue is already open', { exact: false }).waitFor();
  await duplicate.close();
  await page.reload(); await page.getByText('Export ZIP again').first().waitFor();
  assert.equal(await page.locator('article').count(), 2);
  assert.deepEqual(errors, []);
  console.log('PASS: production UI, two synthetic courses, two ZIP downloads, duplicate-owner lock, persisted completion; no page errors.');
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
