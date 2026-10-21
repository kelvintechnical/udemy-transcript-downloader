import { browser } from 'wxt/browser';
import { emptyQueue, type QueueState } from './model';
const key = 'udemy_queue_v1';
export async function loadQueue(): Promise<QueueState> {
  const value = (await browser.storage.local.get(key))[key] as QueueState | undefined;
  if (!value) return emptyQueue();
  if (value.version !== 1 || !Array.isArray(value.jobs)) throw new Error('Unsupported queue state. Existing data preserved.');
  return value;
}
export async function saveQueue(state: QueueState) { await browser.storage.local.set({ [key]: state }); }
