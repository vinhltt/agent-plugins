// Single-check verify: SKILL.md frontmatter metadata.version === CHANGELOG.md top header version.
// Pattern shift: Dual-Ledger → Single Source of Truth (SKILL.md frontmatter).

import { readFrontmatter } from './lib/frontmatter';

export interface VerifyResult {
  ok: boolean;
  detail?: string;
}

export async function verifyTarget(target: string): Promise<VerifyResult> {
  const fm = await readFrontmatter(`${target}/SKILL.md`);
  const top = await readChangelogTopVersion(`${target}/CHANGELOG.md`);
  if (fm.version === top) return { ok: true };
  return {
    ok: false,
    detail: `frontmatter=${fm.version} but changelog top=${top}`,
  };
}

async function readChangelogTopVersion(changelogPath: string): Promise<string | null> {
  const f = Bun.file(changelogPath);
  if (!(await f.exists())) return null;
  const text = await f.text();
  const m = text.match(/^##\s*\[([^\]]+)\]/m);
  return m ? m[1]! : null;
}

export function formatVerifyError(result: VerifyResult, target: string): string {
  if (result.ok) return '';
  return [
    `Verify failed: ${result.detail}`,
    `Run 'git checkout ${target}' to discard partial state.`,
  ].join('\n');
}
