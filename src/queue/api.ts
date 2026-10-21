import { courseUrl } from './model';
import { request, delay } from './http';
import { vttToMarkdown } from '../utils/helpers';
import type { UdemyCurriculumItem } from '../utils/types';
const origin = 'https://www.udemy.com';
export async function resolveCourse(url: string, signal: AbortSignal) {
  const response = await request(`${courseUrl(url)}learn/`, signal);
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const args = doc.querySelector('[data-module-id="course-taking"]')?.getAttribute('data-module-args');
  const id = args ? JSON.parse(args).courseId : undefined;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Cannot read enrolled course. Sign in to Udemy and open its learning page, then retry.');
  return { id, title: doc.title.split('|')[0].trim() || url.split('/')[4] };
}
export async function curriculum(id: number, signal: AbortSignal): Promise<UdemyCurriculumItem[]> {
  let next: string | null = `${origin}/api-2.0/courses/${id}/subscriber-curriculum-items/?curriculum_types=chapter%2Clecture%2Cquiz&page_size=1000&fields%5Blecture%5D=title%2Casset&fields%5Bchapter%5D=title`;
  const items: UdemyCurriculumItem[] = [];
  const seen = new Set<string>();
  while (next) {
    const url: URL = new URL(next, origin);
    if (url.origin !== origin || !url.pathname.startsWith(`/api-2.0/courses/${id}/subscriber-curriculum-items/`) || seen.has(url.href)) throw new Error('Invalid curriculum pagination.');
    seen.add(url.href);
    await delay(500 + Math.random() * 500, signal);
    const data = await (await request(url.href, signal)).json();
    if (!Array.isArray(data.results)) throw new Error('Invalid curriculum response.');
    items.push(...data.results.map((item: any) => ({ ...item, type: ['chapter', 'lecture', 'quiz'].includes(item._class) ? item._class : 'other', isCompleted: false })));
    next = data.next || null;
  }
  return items;
}
export async function transcript(id: number, lecture: number, signal: AbortSignal): Promise<string | null> {
  await delay(500 + Math.random() * 500, signal);
  const data = await (await request(`${origin}/api-2.0/users/me/subscribed-courses/${id}/lectures/${lecture}/?fields%5Blecture%5D=asset&fields%5Basset%5D=captions`, signal)).json();
  const captions = data?.asset?.captions;
  if (captions != null && !Array.isArray(captions)) throw new Error('Invalid captions response.');
  const caption = captions?.find((c: any) => /^en(?:[_-]|$)/i.test(c.locale_id ?? '') || /^en(?:[_-]|$)/i.test(c.language ?? ''));
  if (!caption?.url) return null;
  const url = new URL(caption.url);
  if (url.protocol !== 'https:' || !(url.hostname === 'www.udemy.com' || url.hostname.endsWith('.udemycdn.com'))) throw new Error('Unsupported caption host. No request sent.');
  return vttToMarkdown(await (await request(url.href, signal)).text());
}
