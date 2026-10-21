import { describe, test, expect } from 'bun:test';
import { Scheduler } from '../src/queue/scheduler';
import { emptyQueue, courseUrl } from '../src/queue/model';
import { request, HttpError } from '../src/queue/http';
import { buildZip } from '../src/utils/file-generator';
import { unzipSync, strFromU8 } from 'fflate';
const url = n => `https://www.udemy.com/course/course-${n}/`;
const lecture = id => ({ _class: 'lecture', type: 'lecture', id, title: `Lecture ${id}`, asset: { asset_type: 'Video' } });
const tick = () => new Promise(resolve => setTimeout(resolve, 1));
async function until(check) { for (let n = 0; n < 1000; n++) { if (check()) return; await tick(); } throw new Error('Timed out waiting for scheduler'); }
const defaults = () => ({ save: async () => {}, resolve: async u => ({ id: Number(u.match(/course-(\d+)/)[1]), title: u }), curriculum: async () => [lecture(1), lecture(2)], transcript: async id => `Course ${id}`, export: async () => {} });

describe('course scheduler', () => {
  test('normalizes learning URLs and rejects credentials, lookalike hosts, and unsupported concurrency', () => {
    expect(courseUrl(url(1) + 'learn/lecture/2?x=1')).toBe(url(1));
    for (const value of ['http://www.udemy.com/course/a', 'https://www.udemy.com.evil.com/course/a', 'https://user:pass@www.udemy.com/course/a']) expect(() => courseUrl(value)).toThrow();
    const scheduler = new Scheduler(emptyQueue(), defaults());
    expect(() => scheduler.setConcurrency(5)).toThrow();
    expect(() => scheduler.setConcurrency(10)).toThrow();
  });
  test('two-course integration: limits workers, isolates checkpoints and produces valid ZIPs', async () => {
    let active = 0, maximum = 0;
    const archives = new Map(); const snapshots = [];
    const scheduler = new Scheduler(emptyQueue(), { ...defaults(),
      save: async state => { snapshots.push(structuredClone(state)); },
      transcript: async id => { active++; maximum = Math.max(active, maximum); await new Promise(r => setTimeout(r, 5)); active--; return `Transcript for ${id}`; },
      export: async job => { archives.set(job.courseId, unzipSync(await buildZip(job.curriculum, job.title))); },
    });
    await scheduler.add([url(1), url(2), url(3), url(1)]);
    await until(() => scheduler.state.jobs.every(j => j.status === 'completed'));
    expect(maximum).toBe(2); expect(scheduler.state.jobs.length).toBe(3);
    for (const [id, files] of archives) {
      expect(Object.keys(files).length).toBe(3);
      expect(strFromU8(files['00_Intro/01_Lecture 1.md'])).toBe(`Transcript for ${id}`);
      const merged = strFromU8(Object.entries(files).find(([key]) => key.endsWith('_Full.md'))[1]);
      expect(merged).toContain(`Transcript for ${id}`);
      expect(merged).not.toContain(`Transcript for ${id === 1 ? 2 : 1}`);
    }
    expect(snapshots.some(s => s.jobs.some(j => j.curriculum?.filter(i => i.isCompleted).length === 1))).toBe(true);
  });
  test('individual pause aborts in-flight work; rapid resume never duplicates a worker', async () => {
    let started = 0, active = 0, max = 0;
    const scheduler = new Scheduler(emptyQueue(), { ...defaults(), transcript: async (_id, _lecture, signal) => {
      started++; active++; max = Math.max(max, active);
      try { await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 15);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      }); return 'text'; } finally { active--; }
    } });
    await scheduler.add([url(1)]); await until(() => started === 1);
    await scheduler.pause(url(1)); await scheduler.resume(url(1));
    await until(() => scheduler.state.jobs[0].status === 'completed');
    expect(max).toBe(1); expect(started).toBe(3);
  });
  test('global pause blocks queued work and resume finishes both courses', async () => {
    const state = emptyQueue(); state.concurrency = 1;
    let release; let entered = false;
    const scheduler = new Scheduler(state, { ...defaults(), transcript: async (_id, _lecture, signal) => {
      entered = true; await new Promise(r => { release = r; signal.addEventListener('abort', r, { once: true }); }); return 'text';
    } });
    await scheduler.add([url(1), url(2)]); await until(() => entered);
    await scheduler.pause(); await tick();
    expect(state.jobs.every(j => j.status === 'paused')).toBe(true);
    scheduler.deps.transcript = async () => 'resumed';
    release(); await scheduler.resume();
    await until(() => state.jobs.every(j => j.status === 'completed'));
  });
  test('recovers paused and skips saved lectures; one course failure does not stop another', async () => {
    const state = emptyQueue(); state.jobs = [{ url: url(1), title: 'Recovered', courseId: 1, status: 'running', curriculum: [{ ...lecture(1), isCompleted: true, markdownContent: 'saved' }, lecture(2)] }];
    const fetched = [];
    const scheduler = new Scheduler(state, { ...defaults(), transcript: async (id, lecture) => { fetched.push([id, lecture]); if (id === 2) throw new Error('HTTP 403'); return 'new'; } });
    expect(state.jobs[0].status).toBe('paused');
    await scheduler.add([url(2)]); await scheduler.resume(url(1));
    await until(() => state.jobs[0].status === 'completed' && state.jobs[1].status === 'error');
    expect(fetched).not.toContainEqual([1, 1]); expect(state.jobs[0].curriculum[0].markdownContent).toBe('saved');
  });
  test('storage failure stops network processing and exposes error', async () => {
    let requests = 0;
    const scheduler = new Scheduler(emptyQueue(), { ...defaults(), save: async () => { throw new Error('quota'); }, resolve: async () => { requests++; return { id: 1, title: 'x' }; } });
    await expect(scheduler.add([url(1)])).rejects.toThrow('quota');
    expect(requests).toBe(0); expect(scheduler.state.paused).toBe(true);
  });
});

describe('bounded retries', () => {
  test('429 Retry-After and 503 backoff then success', async () => {
    const waits = []; let calls = 0;
    const response = await request(url(1), new AbortController().signal, async () => {
      calls++; return calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '2' } }) : calls === 2 ? new Response('', { status: 503 }) : new Response('ok');
    }, async ms => { waits.push(ms); });
    expect(await response.text()).toBe('ok'); expect(calls).toBe(3); expect(waits[0]).toBeGreaterThanOrEqual(2000); expect(waits[1]).toBeGreaterThanOrEqual(2000);
  });
  test('retries are bounded and auth errors are never retried', async () => {
    for (const status of [401, 403, 429, 503]) {
      let calls = 0;
      await expect(request(url(1), new AbortController().signal, async () => { calls++; return new Response('', { status }); }, async () => {})).rejects.toBeInstanceOf(HttpError);
      expect(calls).toBe(status < 429 ? 1 : 5);
    }
  });
  test('honors long server cooldown by failing without an early retry', async () => {
    let calls = 0;
    await expect(request(url(1), new AbortController().signal, async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '120' } }); }, async () => {})).rejects.toThrow('cooldown');
    expect(calls).toBe(1);
  });
  test('abort prevents requests', async () => {
    const controller = new AbortController(); controller.abort(); let calls = 0;
    await expect(request(url(1), controller.signal, async () => { calls++; return new Response(''); })).rejects.toThrow(); expect(calls).toBe(0);
  });
});
