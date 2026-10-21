import { courseUrl, isVideo, type CourseJob, type QueueState } from './model';
import type { UdemyCurriculumItem } from '../utils/types';
export interface Dependencies {
  save(state: QueueState): Promise<void>;
  resolve(url: string, signal: AbortSignal): Promise<{ id: number; title: string }>;
  curriculum(id: number, signal: AbortSignal): Promise<UdemyCurriculumItem[]>;
  transcript(id: number, lecture: number, signal: AbortSignal): Promise<string | null>;
  export(job: CourseJob): Promise<void>;
}
/** Single owner. All writes are serialized; each worker mutates only its own job. */
export class Scheduler {
  private active = new Map<string, AbortController>();
  private writes: Promise<void> = Promise.resolve();
  private storageError = false;
  constructor(public state: QueueState, private deps: Dependencies) {
    // Recovery is explicit, never automatically restart interrupted network traffic.
    for (const job of state.jobs) if (job.status === 'running' || job.status === 'queued') job.status = 'paused';
    this.setConcurrency(state.concurrency);
  }
  private async persist() {
    const snapshot = structuredClone(this.state);
    const write = this.writes.then(() => this.deps.save(snapshot));
    this.writes = write.catch(() => {});
    try { await write; } catch (error) {
      this.storageError = true;
      this.state.paused = true;
      for (const controller of this.active.values()) controller.abort();
      throw error;
    }
  }
  setConcurrency(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 2) throw new Error('Only concurrency 1 or 2 is validated for this MVP.');
    this.state.concurrency = value;
  }
  async configure(value: number) { this.setConcurrency(value); await this.persist(); this.pump(); }
  async add(values: string[]) {
    const urls = values.filter(v => v.trim()).map(v => courseUrl(v.trim()));
    for (const url of urls) if (!this.state.jobs.some(j => j.url === url)) {
      this.state.jobs.push({ url, title: url.split('/')[4], status: 'queued' });
    }
    await this.persist(); this.pump();
  }
  async pause(url?: string) {
    if (!url) this.state.paused = true;
    for (const job of this.state.jobs) if ((!url || job.url === url) && ['queued', 'running'].includes(job.status)) {
      job.status = 'paused'; this.active.get(job.url)?.abort();
    }
    await this.persist();
  }
  async resume(url?: string) {
    if (!url) this.state.paused = false;
    this.storageError = false;
    for (const job of this.state.jobs) if ((!url || job.url === url) && ['paused', 'error'].includes(job.status)) {
      job.status = 'queued'; job.error = undefined;
    }
    await this.persist(); this.pump();
  }
  private pump() {
    if (this.state.paused || this.storageError) return;
    for (const job of this.state.jobs) {
      if (this.active.size >= this.state.concurrency) break;
      if (job.status !== 'queued' || this.active.has(job.url)) continue;
      const controller = new AbortController();
      this.active.set(job.url, controller);
      job.status = 'running';
      void this.run(job, controller.signal).finally(() => { this.active.delete(job.url); this.pump(); });
    }
  }
  private async run(job: CourseJob, signal: AbortSignal) {
    try {
      await this.persist(); signal.throwIfAborted();
      if (!job.courseId) {
        const result = await this.deps.resolve(job.url, signal);
        signal.throwIfAborted(); job.courseId = result.id; job.title = result.title;
      }
      if (!job.curriculum) {
        const items = await this.deps.curriculum(job.courseId, signal);
        signal.throwIfAborted(); job.curriculum = items; await this.persist();
      }
      for (const item of job.curriculum) {
        signal.throwIfAborted();
        if (!isVideo(item) || item.isCompleted) continue;
        const text = await this.deps.transcript(job.courseId, item.id, signal);
        signal.throwIfAborted();
        item.markdownContent = text ?? '> [No English Transcript Available]';
        item.isCompleted = true;
        await this.persist();
      }
      signal.throwIfAborted();
      await this.deps.export(structuredClone(job));
      signal.throwIfAborted(); job.status = 'completed'; await this.persist();
    } catch (error) {
      if (!signal.aborted) { job.status = 'error'; job.error = String(error); }
      else if (job.status === 'running' || job.status === 'queued') job.status = 'paused';
      try { await this.persist(); } catch { /* UI exposes storage failure; no more work starts. */ }
    }
  }
}
