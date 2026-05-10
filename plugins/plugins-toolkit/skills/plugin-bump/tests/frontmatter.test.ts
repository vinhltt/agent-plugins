// TODO(sync): ported from .claude/skills/skill-bump/tests/frontmatter.test.ts
// Port date: 2026-05-09. Adjust import paths only; keep test logic identical.

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  readFrontmatter,
  writeFrontmatterVersion,
  FrontmatterError,
} from '../scripts/lib/frontmatter';

let TMP: string;

beforeEach(async () => {
  const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
  await proc.exited;
  TMP = (await new Response(proc.stdout).text()).trim();
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', TMP]).exited;
});

async function writeSkill(content: string): Promise<string> {
  const path = `${TMP}/SKILL.md`;
  await Bun.write(path, content);
  return path;
}

describe('readFrontmatter', () => {
  test('valid block-style → returns version', async () => {
    const path = await writeSkill(`---
name: test
metadata:
  version: 0.3.0
---

body
`);
    const fm = await readFrontmatter(path);
    expect(fm.version).toBe('0.3.0');
  });

  test('metadata block without version → null', async () => {
    const path = await writeSkill(`---
name: test
metadata:
  scope: per-skill
---
`);
    const fm = await readFrontmatter(path);
    expect(fm.version).toBeNull();
  });

  test('no metadata block → null', async () => {
    const path = await writeSkill(`---
name: test
---
`);
    const fm = await readFrontmatter(path);
    expect(fm.version).toBeNull();
  });

  test('version not first child of metadata still parses', async () => {
    const path = await writeSkill(`---
name: test
metadata:
  authors: VinhLTT
  version: 0.5.0
  scope: per-skill
---
`);
    const fm = await readFrontmatter(path);
    expect(fm.version).toBe('0.5.0');
  });

  test('quoted version parses', async () => {
    const path = await writeSkill(`---
metadata:
  version: '1.2.3'
---
`);
    const fm = await readFrontmatter(path);
    expect(fm.version).toBe('1.2.3');
  });

  test('reject flow-style metadata', async () => {
    const path = await writeSkill(`---
metadata: {version: 0.1.0}
---
`);
    expect(readFrontmatter(path)).rejects.toThrow(/Flow-style/);
  });

  test('reject top-level version', async () => {
    const path = await writeSkill(`---
version: 0.1.0
---
`);
    expect(readFrontmatter(path)).rejects.toThrow(/Top-level/);
  });

  test('reject missing frontmatter delimiter', async () => {
    const path = await writeSkill(`name: test\n`);
    expect(readFrontmatter(path)).rejects.toThrow(/missing frontmatter/);
  });

  test('reject unterminated frontmatter', async () => {
    const path = await writeSkill(`---\nname: test\nbody`);
    expect(readFrontmatter(path)).rejects.toThrow(/Unterminated/);
  });
});

describe('writeFrontmatterVersion', () => {
  test('bumps existing version, preserves quoting', async () => {
    const path = await writeSkill(`---
name: test
metadata:
  version: '0.1.0'
---

body
`);
    await writeFrontmatterVersion(path, '0.2.0');
    const after = await readFrontmatter(path);
    expect(after.version).toBe('0.2.0');
    expect(after.raw).toContain(`version: '0.2.0'`);
  });

  test('bumps unquoted version', async () => {
    const path = await writeSkill(`---
metadata:
  version: 0.1.0
---
`);
    await writeFrontmatterVersion(path, '1.0.0');
    const after = await readFrontmatter(path);
    expect(after.version).toBe('1.0.0');
  });

  test('inserts metadata.version when missing (under existing metadata block)', async () => {
    const path = await writeSkill(`---
name: test
metadata:
  scope: per-skill
---
`);
    await writeFrontmatterVersion(path, '0.1.0');
    const after = await readFrontmatter(path);
    expect(after.version).toBe('0.1.0');
    expect(after.raw).toContain('scope: per-skill');
  });

  test('inserts metadata block when none exists', async () => {
    const path = await writeSkill(`---
name: test
description: a thing
---

body
`);
    await writeFrontmatterVersion(path, '0.1.0');
    const after = await readFrontmatter(path);
    expect(after.version).toBe('0.1.0');
    expect(after.raw).toContain('metadata:');
    expect(after.raw).toContain('description: a thing');
    expect(after.raw).toContain('body');
  });

  test('preserves body unchanged on bump', async () => {
    const original = `---
metadata:
  version: 0.1.0
---

# Title

paragraph
`;
    const path = await writeSkill(original);
    await writeFrontmatterVersion(path, '0.2.0');
    const text = await Bun.file(path).text();
    expect(text).toContain('# Title');
    expect(text).toContain('paragraph');
  });
});
