export interface FrontmatterDocument {
  attributes: Record<string, string | boolean | string[]>;
  body: string;
  hasFrontmatter: boolean;
  errors: string[];
}

function coerceValue(value: string): string | boolean | string[] {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((part) => part.trim().replace(/^[ '"]+|[ '"]+$/g, '')).filter(Boolean);
  }
  return trimmed.replace(/^[ '"]+|[ '"]+$/g, '');
}

export function parseFrontmatter(markdown: string): FrontmatterDocument {
  const normalized = markdown.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    return { attributes: {}, body: markdown, hasFrontmatter: false, errors: [] };
  }

  const endMatch = normalized.slice(3).match(/\r?\n---(?:\r?\n|$)/);
  if (!endMatch || endMatch.index === undefined) {
    return { attributes: {}, body: markdown, hasFrontmatter: true, errors: ['Missing closing frontmatter delimiter'] };
  }

  const frontmatterStart = normalized.startsWith('---\r\n') ? 5 : 4;
  const frontmatterEnd = 3 + endMatch.index;
  const frontmatter = normalized.slice(frontmatterStart, frontmatterEnd);
  const body = normalized.slice(frontmatterEnd + endMatch[0].length);
  const attributes: Record<string, string | boolean | string[]> = {};
  const errors: string[] = [];

  for (const [index, rawLine] of frontmatter.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      errors.push(`Invalid frontmatter line ${index + 1}: ${rawLine}`);
      continue;
    }
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (!key) {
      errors.push(`Invalid empty key on line ${index + 1}`);
      continue;
    }
    attributes[key] = coerceValue(value);
  }

  return { attributes, body, hasFrontmatter: true, errors };
}
