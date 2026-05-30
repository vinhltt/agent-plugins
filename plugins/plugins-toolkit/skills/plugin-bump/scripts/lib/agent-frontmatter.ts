// Block-style version reconciliation for agent/command frontmatter.
// Tolerant of BOTH a top-level `version:` AND a nested `metadata.version` coexisting —
// the corrupted state plugin-bump itself produced by always appending top-level.
//
// Single source of the metadata-first precedence shared by the writer (version-cascade)
// and the verify reader (verify.ts). detect/reconcile/read all run on the SAME line
// scanners below — never add a parallel scan, or precedence drifts between callers.
//
// Pure string transforms only: no Bun.*/node:* imports (IO stays in version-cascade).
// Block-style only; flow-style `metadata: { version }` is out of scope (documented limitation).

export type AgentVersionLocation = 'metadata' | 'top-level' | 'none';

// Capture-group pattern (ported from frontmatter.ts) preserves quote style on replacement.
// `\s+` anchor means it ONLY matches the nested `  version:` under `metadata:`, never top-level.
const METADATA_VERSION_RE = /^(\s+version:\s*)(['"]?)([^'"\s]+)(['"]?)\s*$/;
// `^version:` (no leading whitespace) matches top-level only — the nested line is never caught.
const TOP_LEVEL_VERSION_RE = /^(version:\s*)(['"]?)([^'"\s]+)(['"]?)\s*$/;

interface FrontmatterBounds {
  start: number; // first content line (inclusive)
  end: number; // closing `---` delimiter line (exclusive bound for content)
}

// Locate the frontmatter block. null = no frontmatter (line 1 isn't `---`).
// Throws on an opened-but-unterminated block (matches the prior writer's contract).
function frontmatterBounds(lines: string[]): FrontmatterBounds | null {
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') return { start: 1, end: i };
  }
  throw new Error('Unterminated frontmatter');
}

// Index of the nested `metadata.version` line within [start, end), or -1.
// Tracks the `metadata:` block by indent so unrelated nested keys are ignored.
function findMetadataVersionLine(lines: string[], start: number, end: number): number {
  let inMetadata = false;
  let metadataIndent = -1;
  for (let i = start; i < end; i++) {
    const line = lines[i]!;
    if (/^metadata:\s*$/.test(line)) {
      inMetadata = true;
      metadataIndent = line.length - line.trimStart().length;
      continue;
    }
    if (inMetadata) {
      if (line.trim() === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= metadataIndent) { inMetadata = false; continue; }
      if (METADATA_VERSION_RE.test(line)) return i;
    }
  }
  return -1;
}

// Index of the top-level `version:` line within [start, end), or -1.
function findTopLevelVersionLine(lines: string[], start: number, end: number): number {
  for (let i = start; i < end; i++) {
    if (/^version:\s*/.test(lines[i]!)) return i;
  }
  return -1;
}

// Pure: classify where the version lives. metadata-first.
// `content` is the full file content (the `^---` bound check needs the delimiters).
export function detectAgentVersionLocation(content: string): AgentVersionLocation {
  const lines = content.split('\n');
  let bounds: FrontmatterBounds | null;
  try { bounds = frontmatterBounds(lines); } catch { return 'none'; }
  if (!bounds) return 'none';
  if (findMetadataVersionLine(lines, bounds.start, bounds.end) !== -1) return 'metadata';
  if (findTopLevelVersionLine(lines, bounds.start, bounds.end) !== -1) return 'top-level';
  return 'none';
}

// Pure: read the effective version. metadata-first, top-level fallback. Reused by verify.
// `content` is the full file content.
export function readAgentVersion(content: string): string | null {
  const lines = content.split('\n');
  let bounds: FrontmatterBounds | null;
  try { bounds = frontmatterBounds(lines); } catch { return null; }
  if (!bounds) return null;

  const metaLine = findMetadataVersionLine(lines, bounds.start, bounds.end);
  if (metaLine !== -1) return lines[metaLine]!.match(METADATA_VERSION_RE)![3]!;

  const topLine = findTopLevelVersionLine(lines, bounds.start, bounds.end);
  if (topLine !== -1) {
    const m = lines[topLine]!.match(TOP_LEVEL_VERSION_RE);
    return m ? m[3]! : null;
  }
  return null;
}

// Pure: return new file content with the version reconciled to a SINGLE field.
//  - metadata present  -> replace metadata.version (preserve quotes), strip any top-level line
//  - top-level present -> replace top-level in place (preserve quotes)
//  - neither (with FM) -> insert top-level `version:` before the closing `---`
//  - no frontmatter    -> prepend a `version:` block (commands without frontmatter)
// `rawFileContent` is the full file content.
export function reconcileAgentVersion(rawFileContent: string, newVersion: string): string {
  const lines = rawFileContent.split('\n');
  const bounds = frontmatterBounds(lines);

  if (!bounds) {
    return `---\nversion: ${newVersion}\n---\n\n${rawFileContent}`;
  }
  const { start, end } = bounds;

  const metaLine = findMetadataVersionLine(lines, start, end);
  if (metaLine !== -1) {
    // metadata-first: bump metadata.version, drop any duplicate top-level line in one pass.
    const topLine = findTopLevelVersionLine(lines, start, end);
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === topLine) continue; // remove the bug-injected duplicate
      if (i === metaLine) {
        const m = lines[i]!.match(METADATA_VERSION_RE)!;
        out.push(`${m[1]}${m[2]}${newVersion}${m[4]}`);
      } else {
        out.push(lines[i]!);
      }
    }
    return out.join('\n');
  }

  const topLine = findTopLevelVersionLine(lines, start, end);
  if (topLine !== -1) {
    const m = lines[topLine]!.match(TOP_LEVEL_VERSION_RE);
    lines[topLine] = m ? `${m[1]}${m[2]}${newVersion}${m[4]}` : `version: ${newVersion}`;
    return lines.join('\n');
  }

  // neither field present — preserve the prior fallback (insert before closing `---`).
  lines.splice(end, 0, `version: ${newVersion}`);
  return lines.join('\n');
}
