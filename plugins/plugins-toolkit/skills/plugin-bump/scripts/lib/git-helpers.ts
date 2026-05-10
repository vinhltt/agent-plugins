// TODO(sync): origin = .claude/skills/skill-bump/scripts/lib/git-helpers.ts
// Port date: 2026-05-09. Source SHA: 3d6e868. Keep API parity unless port-specific divergence is documented here.
// Divergence: assertTargetSafe checks SKILL.md (skill-specific). plugin-bump uses assertPluginTargetSafe in run.ts instead.

// Bun-native git helpers. Read-only ops use --no-optional-locks (H3) to avoid
// .git/index.lock contention with concurrent runs.

import { isExcluded } from './default-excludes';

export interface DiffEntry {
  status: 'A' | 'M' | 'R' | 'C' | 'D';
  path: string; // post-rename, relative to targetDir
  oldPath?: string; // for R/C, relative to targetDir
}

export class GitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'GitError';
  }
}

async function spawnGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(['git', '--no-optional-locks', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, code };
}

export async function gitDiffNameStatus(
  since: string,
  targetDir: string,
  cwd: string,
): Promise<DiffEntry[]> {
  // H1: single SHA → normalize to `<sha>..HEAD` so we don't hash uncommitted state.
  const range = since.includes('..') ? since : `${since}..HEAD`;
  const { stdout, stderr, code } = await spawnGit(
    ['diff', '--name-status', '--end-of-options', range, '--', targetDir],
    cwd,
  );
  if (code !== 0) throw new GitError(`git diff failed: ${stderr.trim()}`);
  // git outputs paths relative to repo root; strip via repo-relative target form.
  const targetRel = toRepoRelative(targetDir, cwd);
  return parseDiffOutput(stdout, targetRel);
}

export function toRepoRelative(target: string, repoRoot: string): string {
  const rr = repoRoot.replace(/\/$/, '');
  if (target.startsWith(rr + '/')) return target.slice(rr.length + 1);
  if (target === rr) return '';
  return target;
}

export function parseDiffOutput(out: string, targetDir: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const cols = line.split('\t');
    const statusRaw = cols[0]!;
    // R100, C90 → take first letter
    const statusChar = statusRaw[0] as DiffEntry['status'];
    if (!'AMRCD'.includes(statusChar)) continue;
    if (statusChar === 'R' || statusChar === 'C') {
      if (cols.length < 3) continue;
      const oldPath = stripTargetPrefix(cols[1]!, targetDir);
      const newPath = stripTargetPrefix(cols[2]!, targetDir);
      if (isExcluded(newPath)) continue;
      entries.push({ status: statusChar, oldPath, path: newPath });
    } else {
      if (cols.length < 2) continue;
      const path = stripTargetPrefix(cols[1]!, targetDir);
      if (isExcluded(path)) continue;
      entries.push({ status: statusChar, path });
    }
  }
  return entries;
}

// M2: robust prefix removal handling trailing slash + sub-paths.
export function stripTargetPrefix(absPath: string, targetDir: string): string {
  const td = targetDir.replace(/\/$/, '');
  if (absPath.startsWith(td + '/')) return absPath.slice(td.length + 1);
  if (absPath === td) return '';
  if (absPath.startsWith(td)) return absPath.slice(td.length).replace(/^\//, '');
  return absPath;
}

export async function gitLsFiles(target: string, cwd: string): Promise<string[]> {
  const { stdout, stderr, code } = await spawnGit(['ls-files', '--', target], cwd);
  if (code !== 0) throw new GitError(`git ls-files failed: ${stderr.trim()}`);
  return stdout.split('\n').filter(Boolean);
}

export async function repoCwdOf(target: string): Promise<string> {
  // Run from target's parent dir so rev-parse resolves even if target lacks inner .git.
  const parent = target.replace(/\/[^\/]+\/?$/, '') || '/';
  const { stdout, stderr, code } = await spawnGit(['rev-parse', '--show-toplevel'], parent);
  if (code !== 0) throw new GitError(`repoCwdOf(${target}): ${stderr.trim()}`);
  return stdout.trim();
}

export async function resolveSinceAnchor(targetDir: string, cwd: string): Promise<string> {
  // (a) last commit touching <target>/CHANGELOG.md
  const { stdout } = await spawnGit(
    ['log', '-1', '--pretty=%H', '--', `${targetDir}/CHANGELOG.md`],
    cwd,
  );
  const sha = stdout.trim();
  if (sha) return `${sha}..HEAD`;
  // (b) fallback: pre-bootstrap state
  return 'HEAD~1..HEAD';
}

export async function assertInGitRepo(cwd: string): Promise<void> {
  const { code } = await spawnGit(['rev-parse', '--is-inside-work-tree'], cwd);
  if (code !== 0) throw new GitError(`Not inside git repo: ${cwd}`);
}

export async function assertRefExists(ref: string, cwd: string): Promise<void> {
  const single = ref.includes('..') ? ref.split('..')[1]! : ref;
  const { code } = await spawnGit(['rev-parse', '--verify', single], cwd);
  if (code !== 0) {
    throw new GitError(
      `Invalid --since ref: ${ref}. Run 'git log --oneline' to find valid commits.`,
    );
  }
}

export async function isWorkingTreeDirty(targetDir: string, cwd: string): Promise<boolean> {
  const { stdout } = await spawnGit(['status', '--porcelain', '--', targetDir], cwd);
  return stdout.trim().length > 0;
}

// C3: target safety — canonicalize via realpath, reject `..` segments,
// assert in-git-repo, confirm SKILL.md exists. Throws GitError on failure.
// NOTE(plugin-bump): not used by plugin-bump — use assertPluginTargetSafe in run.ts instead.
export async function assertTargetSafe(target: string): Promise<string> {
  const proc = Bun.spawn(['realpath', target], { stdout: 'pipe', stderr: 'pipe' });
  const code = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  if (code !== 0) {
    throw new GitError(`assertTargetSafe: realpath failed for ${target}: ${stderr.trim()}`);
  }
  const canonical = (await new Response(proc.stdout).text()).trim();
  if (canonical.split('/').includes('..')) {
    throw new GitError(`assertTargetSafe: path traversal detected: ${canonical}`);
  }
  await assertInGitRepo(canonical);
  if (!(await Bun.file(`${canonical}/SKILL.md`).exists())) {
    throw new GitError(`assertTargetSafe: SKILL.md missing at ${canonical}`);
  }
  return canonical;
}

export async function gitShowHead(pluginRelPath: string, cwd: string): Promise<string | null> {
  const { stdout, code } = await spawnGit(['show', `HEAD:${pluginRelPath}`], cwd);
  if (code !== 0) return null;
  return stdout;
}
