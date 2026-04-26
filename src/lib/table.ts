import type { SkillItem } from './types';

export type SortKey = 'name' | 'target' | 'kind' | 'scope' | 'issues' | 'path';
export type SortDirection = 'asc' | 'desc';

export interface PaginationState {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  rows: T[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
}

export function clampPage(page: number, pageCount: number): number {
  const safePageCount = Math.max(1, Math.floor(pageCount));
  const safePage = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, safePage), safePageCount);
}

export function paginate<T>(rows: T[], state: PaginationState): PageResult<T> {
  const total = rows.length;
  const pageSize = Math.max(1, Math.floor(state.pageSize));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = clampPage(state.page, pageCount);
  const offset = (page - 1) * pageSize;
  const pagedRows = rows.slice(offset, offset + pageSize);

  return {
    rows: pagedRows,
    page,
    pageSize,
    pageCount,
    total,
    start: total === 0 ? 0 : offset + 1,
    end: total === 0 ? 0 : offset + pagedRows.length
  };
}

function compareText(a: string | undefined, b: string | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base', numeric: true });
}

function compareByKey(a: SkillItem, b: SkillItem, key: SortKey): number {
  if (key === 'issues') {
    return a.issues.length - b.issues.length;
  }

  return compareText(a[key], b[key]);
}

export function sortSkillItems(rows: SkillItem[], key: SortKey, direction: SortDirection): SkillItem[] {
  const directionMultiplier = direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const primary = compareByKey(a, b, key);
    if (primary !== 0) {
      return primary * directionMultiplier;
    }

    const nameTieBreaker = compareText(a.name, b.name);
    if (nameTieBreaker !== 0) {
      return nameTieBreaker;
    }

    return compareText(a.path, b.path);
  });
}
