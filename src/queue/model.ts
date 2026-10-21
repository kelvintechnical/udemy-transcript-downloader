import type { UdemyCurriculumItem } from '../utils/types';
export interface CourseJob {
  url: string;
  title: string;
  courseId?: number;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'error';
  curriculum?: UdemyCurriculumItem[];
  error?: string;
}
export interface QueueState { version: 1; paused: boolean; concurrency: number; jobs: CourseJob[] }
export const emptyQueue = (): QueueState => ({ version: 1, paused: false, concurrency: 2, jobs: [] });
export function courseUrl(value: string): string {
  const url = new URL(value);
  const match = url.pathname.match(/^\/course\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (url.protocol !== 'https:' || url.hostname !== 'www.udemy.com' || url.port || url.username || url.password || !match) {
    throw new Error('Use an HTTPS www.udemy.com/course/<course-name>/ URL.');
  }
  return `https://www.udemy.com/course/${match[1]}/`;
}
export const isVideo = (item: UdemyCurriculumItem) => item.type === 'lecture' && item.asset?.asset_type === 'Video';
