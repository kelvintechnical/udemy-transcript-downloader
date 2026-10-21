import { browser } from 'wxt/browser';
import { Scheduler } from '../../queue/scheduler';
import { loadQueue, saveQueue } from '../../queue/storage';
import { resolveCourse, curriculum, transcript } from '../../queue/api';
import { isVideo } from '../../queue/model';
import { generateZip } from '../../utils/file-generator';
const notice = document.querySelector<HTMLElement>('#notice')!;
const jobs = document.querySelector<HTMLElement>('#jobs')!;
const select = document.querySelector<HTMLSelectElement>('#concurrency')!;
const showError = (error: unknown) => { notice.textContent = String(error); };
const act = (fn: () => Promise<unknown>) => { notice.textContent = ''; void fn().catch(showError); };
// Web Locks prevents a second extension tab from starting duplicate workers.
void navigator.locks.request('udemy-queue-owner', { ifAvailable: true }, async lock => {
  if (!lock) {
    notice.textContent = 'The download queue is already open in another tab. Use that tab, or close it and reload this one.';
    document.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true);
    select.disabled = true;
    return;
  }
  const queue = new Scheduler(await loadQueue(), {
    resolve: resolveCourse, curriculum, transcript,
    save: async state => { await saveQueue(state); render(); },
    export: job => generateZip(job.curriculum!, `${job.title}_${job.courseId}`),
  });
  function render() {
    select.value = String(queue.state.concurrency);
    jobs.replaceChildren();
    for (const job of queue.state.jobs) {
      const card = document.createElement('article');
      const title = document.createElement('h2'); title.textContent = job.title;
      const count = job.curriculum?.filter(isVideo).length ?? 0;
      const done = job.curriculum?.filter(i => isVideo(i) && i.isCompleted).length ?? 0;
      const status = document.createElement('p'); status.textContent = `${job.status} — ${done} / ${count} lectures${queue.state.paused ? ' (queue paused)' : ''}`;
      const progress = document.createElement('progress'); progress.max = count || 1; progress.value = done; progress.setAttribute('aria-label', `${job.title} progress`);
      const error = document.createElement('p'); error.className = 'error'; error.textContent = job.error ?? '';
      card.append(title, status, progress, error);
      const button = document.createElement('button');
      button.textContent = ['running', 'queued'].includes(job.status) ? 'Pause course' : 'Resume / Retry course';
      button.disabled = job.status === 'completed';
      button.onclick = () => act(() => ['running', 'queued'].includes(job.status) ? queue.pause(job.url) : queue.resume(job.url));
      card.append(button);
      if (job.status === 'completed') {
        const exportButton = document.createElement('button'); exportButton.textContent = 'Export ZIP again';
        exportButton.onclick = () => act(() => generateZip(job.curriculum!, `${job.title}_${job.courseId}`));
        card.append(exportButton);
      }
      jobs.append(card);
    }
  }
  await saveQueue(queue.state); render();
  document.querySelector('#add')!.addEventListener('submit', event => {
    event.preventDefault();
    const input = document.querySelector<HTMLTextAreaElement>('#urls')!;
    act(async () => { await queue.add(input.value.split('\n')); input.value = ''; });
  });
  document.querySelector('#current')!.addEventListener('click', () => act(async () => {
    const tabs = await browser.tabs.query({ url: 'https://www.udemy.com/course/*' });
    const tab = tabs.find(t => t.active) ?? tabs[0];
    if (!tab?.url) throw new Error('Open an enrolled Udemy course in a browser tab first.');
    await queue.add([tab.url]);
  }));
  document.querySelector('#pause')!.addEventListener('click', () => act(() => queue.pause()));
  document.querySelector('#resume')!.addEventListener('click', () => act(() => queue.resume()));
  select.onchange = () => act(() => queue.configure(Number(select.value)));
  await new Promise(() => {}); // Retain ownership for the lifetime of this tab.
}).catch(showError);
