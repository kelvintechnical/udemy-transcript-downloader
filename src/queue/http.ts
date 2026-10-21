export class HttpError extends Error {
  constructor(public status: number) { super(`HTTP ${status}${status === 401 || status === 403 ? ': sign in and verify enrollment/permissions in Udemy.' : ''}`); }
}
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function request(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch, sleep = delay): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try { response = await fetcher(url, { signal, credentials: new URL(url).hostname === 'www.udemy.com' ? 'include' : 'omit' }); }
    catch (error) {
      if (signal.aborted || attempt >= 4) throw error;
      await sleep(Math.min(30000, 1000 * 2 ** attempt) + Math.random() * 250, signal); continue;
    }
    if (response.ok) return response;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= 4) throw new HttpError(response.status);
    const retry = response.headers.get('Retry-After');
    const seconds = retry === null ? NaN : Number(retry);
    const wait = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
    // Never shorten a server-requested cooldown. Long waits require explicit later resume.
    if (wait > 60000) throw new Error('Server requests a cooldown over 60 seconds. Wait before resuming this course.');
    await sleep(Math.min(60000, Math.max(wait || 0, 1000 * 2 ** attempt) + Math.random() * 250), signal);
  }
}
