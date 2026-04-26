import type { SkillItem } from './types';

export function findSkillById(items: SkillItem[], id: string): SkillItem | undefined {
  if (!id) return undefined;
  return items.find((item) => item.id === id);
}
