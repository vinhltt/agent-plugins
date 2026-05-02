// SKILL.md YAML frontmatter read/write. Block-style only, single metadata.version key.
// Atomic writes via temp+rename (H5). No node:* imports.

export interface FrontmatterReadResult {
  version: string | null;
  raw: string;
  frontmatterRange: [number, number];
}

export class FrontmatterError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'FrontmatterError';
  }
}

export async function readFrontmatter(skillMdPath: string): Promise<FrontmatterReadResult> {
  const raw = await Bun.file(skillMdPath).text();
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new FrontmatterError(`SKILL.md missing frontmatter delimiter at line 1`);
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) throw new FrontmatterError('Unterminated frontmatter');
  const fmText = lines.slice(1, endIdx).join('\n');
  assertSupportedYamlShape(fmText);
  const version = extractMetadataVersion(fmText);
  const startByte = raw.indexOf('---') + 3;
  const endByte = raw.indexOf('---', startByte);
  return { version, raw, frontmatterRange: [startByte, endByte] };
}

function assertSupportedYamlShape(fmText: string): void {
  if (/^metadata:\s*\{/m.test(fmText)) {
    throw new FrontmatterError(
      'Flow-style metadata not supported. Use block-style:\n  metadata:\n    version: 0.1.0',
    );
  }
  if (/^version:/m.test(fmText)) {
    throw new FrontmatterError('Top-level `version:` not supported. Use `metadata.version`.');
  }
  if (/^metadata:[^\n]*version/m.test(fmText)) {
    throw new FrontmatterError('metadata.version must be on its own line under `metadata:`.');
  }
}

function extractMetadataVersion(fmText: string): string | null {
  const lines = fmText.split('\n');
  let inMetadata = false;
  let metadataIndent = -1;
  for (const line of lines) {
    if (/^metadata:\s*$/.test(line)) {
      inMetadata = true;
      metadataIndent = line.length - line.trimStart().length;
      continue;
    }
    if (inMetadata) {
      if (line.trim() === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= metadataIndent) {
        inMetadata = false;
        continue;
      }
      const m = line.match(/^\s+version:\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (m) return m[1]!;
    }
  }
  return null;
}

export async function writeFrontmatterVersion(
  skillMdPath: string,
  newVersion: string,
): Promise<void> {
  const before = await readFrontmatter(skillMdPath);
  const updated = before.version === null
    ? insertMetadataVersion(before.raw, newVersion)
    : replaceMetadataVersion(before.raw, newVersion);
  // H5: atomic rename — write to temp + mv. POSIX rename atomic on same filesystem.
  const tmp = `${skillMdPath}.tmp`;
  await Bun.write(tmp, updated);
  const mv = Bun.spawn(['mv', tmp, skillMdPath], { stderr: 'pipe' });
  if ((await mv.exited) !== 0) {
    const err = await new Response(mv.stderr).text();
    throw new FrontmatterError(`atomic rename failed: ${err.trim()}`);
  }
  const after = await readFrontmatter(skillMdPath);
  if (after.version !== newVersion) {
    throw new FrontmatterError(
      `Write-back verification failed: expected ${newVersion}, got ${after.version}`,
    );
  }
}

function replaceMetadataVersion(raw: string, newVersion: string): string {
  const lines = raw.split('\n');
  let inMetadata = false;
  let metadataIndent = -1;
  let foundAndReplaced = false;
  const out = lines.map(line => {
    if (foundAndReplaced) return line;
    if (/^metadata:\s*$/.test(line)) {
      inMetadata = true;
      metadataIndent = line.length - line.trimStart().length;
      return line;
    }
    if (inMetadata) {
      if (line.trim() === '') return line;
      const indent = line.length - line.trimStart().length;
      if (indent <= metadataIndent) {
        inMetadata = false;
        return line;
      }
      const m = line.match(/^(\s+version:\s*)(['"]?)([^'"\s]+)(['"]?)\s*$/);
      if (m) {
        foundAndReplaced = true;
        return `${m[1]}${m[2]}${newVersion}${m[4]}`;
      }
    }
    return line;
  });
  if (!foundAndReplaced) {
    throw new FrontmatterError('metadata.version line not found for replacement');
  }
  return out.join('\n');
}

// H7 inlined: insert metadata.version when absent. Used during bootstrap.
function insertMetadataVersion(raw: string, version: string): string {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new FrontmatterError('insertMetadataVersion: missing frontmatter');
  }
  let fmEnd = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      fmEnd = i;
      break;
    }
  }
  if (fmEnd === -1) throw new FrontmatterError('insertMetadataVersion: unterminated frontmatter');

  let metadataLine = -1;
  for (let i = 1; i < fmEnd; i++) {
    if (/^metadata:\s*$/.test(lines[i]!)) {
      metadataLine = i;
      break;
    }
  }
  if (metadataLine !== -1) {
    // append `  version: <v>` right after metadata: line
    lines.splice(metadataLine + 1, 0, `  version: ${version}`);
  } else {
    // insert `metadata:\n  version: <v>` before closing --- (preserve existing keys)
    lines.splice(fmEnd, 0, 'metadata:', `  version: ${version}`);
  }
  return lines.join('\n');
}
