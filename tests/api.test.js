import { test, expect } from 'bun:test';
import { curriculum, transcript } from '../src/queue/api';
import { buildZip } from '../src/utils/file-generator';
import { unzipSync, strFromU8 } from 'fflate';

test('API integration follows curriculum pagination, fetches English captions and preserves chapter layout', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options.credentials]);
    if (url.includes('page=2')) return Response.json({ results: [{ _class: 'lecture', id: 2, title: 'Second', asset: { asset_type: 'Video' } }], next: null });
    if (url.includes('subscriber-curriculum-items')) return Response.json({ results: [{ _class: 'chapter', id: 10, title: 'Intro' }, { _class: 'lecture', id: 1, title: 'First', asset: { asset_type: 'Video' } }], next: 'https://www.udemy.com/api-2.0/courses/7/subscriber-curriculum-items/?page=2' });
    if (url.includes('/lectures/1/')) return Response.json({ asset: { captions: [{ locale_id: 'fr_FR', url: 'https://a.udemycdn.com/fr.vtt' }, { locale_id: 'en_GB', url: 'https://a.udemycdn.com/en.vtt' }] } });
    if (url.includes('/lectures/2/')) return Response.json({ asset: { captions: [] } });
    if (url === 'https://a.udemycdn.com/en.vtt') return new Response('WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello course\n');
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const signal = new AbortController().signal;
    const items = await curriculum(7, signal);
    expect(items.length).toBe(3);
    items[1].markdownContent = await transcript(7, 1, signal);
    expect(items[1].markdownContent).toBe('Hello course');
    expect(await transcript(7, 2, signal)).toBeNull();
    const files = unzipSync(await buildZip(items, 'Course'));
    expect(strFromU8(files['01_Intro/01_First.md'])).toBe('Hello course');
    expect(strFromU8(files['Course_Full.md'])).toContain('## 1. Intro');
    expect(calls.find(([u]) => u.endsWith('/en.vtt'))[1]).toBe('omit');
    expect(calls[0][1]).toBe('include');
  } finally { globalThis.fetch = original; }
});

test('caption API denies auth failures instead of silently treating them as missing captions', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 403 });
  try { await expect(transcript(7, 1, new AbortController().signal)).rejects.toThrow('HTTP 403'); }
  finally { globalThis.fetch = original; }
});
