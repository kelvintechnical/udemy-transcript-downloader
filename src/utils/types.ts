export interface UdemyCurriculumItem {
  _class: string;
  id: number;
  title: string;
  sort_order: number;
  asset?: {
    id: number;
    title: string;
    asset_type: string;
  };
  type: 'chapter' | 'lecture' | 'quiz' | 'other';
  // Internal state
  isCompleted?: boolean;
  markdownContent?: string;
}
