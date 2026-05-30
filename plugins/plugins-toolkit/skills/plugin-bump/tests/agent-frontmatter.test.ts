// Pure-function coverage of the agent/command version reconciler.
// No filesystem — string in, string out. The corrupted-input and idempotency cases are the
// ones that would have caught the original duplicate-field bug.

import { test, expect, describe } from 'bun:test';
import {
  detectAgentVersionLocation,
  reconcileAgentVersion,
  readAgentVersion,
} from '../scripts/lib/agent-frontmatter';

describe('detectAgentVersionLocation', () => {
  test('metadata wins when both fields present', () => {
    expect(detectAgentVersionLocation('---\nmetadata:\n  version: 1.0.0\nversion: 1.2.0\n---\n')).toBe('metadata');
  });
  test('top-level when only top-level', () => {
    expect(detectAgentVersionLocation('---\nname: a\nversion: 1.0.0\n---\n')).toBe('top-level');
  });
  test('metadata when only metadata', () => {
    expect(detectAgentVersionLocation('---\nmetadata:\n  version: 1.0.0\n---\n')).toBe('metadata');
  });
  test('none when neither', () => {
    expect(detectAgentVersionLocation('---\nname: a\n---\n')).toBe('none');
  });
  test('none when no frontmatter', () => {
    expect(detectAgentVersionLocation('# heading\nversion: 1.0.0\n')).toBe('none');
  });
});

describe('readAgentVersion (metadata-first)', () => {
  test('reads metadata.version when both present', () => {
    expect(readAgentVersion('---\nmetadata:\n  version: 1.0.0\nversion: 1.2.0\n---\n')).toBe('1.0.0');
  });
  test('falls back to top-level when no metadata', () => {
    expect(readAgentVersion('---\nname: a\nversion: 1.2.0\n---\n')).toBe('1.2.0');
  });
  test('strips quotes', () => {
    expect(readAgentVersion('---\nmetadata:\n  version: "1.0.0"\n---\n')).toBe('1.0.0');
  });
  test('null when no version anywhere', () => {
    expect(readAgentVersion('---\nname: a\n---\n')).toBeNull();
  });
  test('null when no frontmatter', () => {
    expect(readAgentVersion('# heading\n')).toBeNull();
  });
});

describe('reconcileAgentVersion', () => {
  test('metadata-only → metadata bumped, no top-level added', () => {
    const out = reconcileAgentVersion('---\nname: a\nmetadata:\n  version: 1.0.0\n---\n\nbody\n', '1.1.0');
    expect(out).toContain('  version: 1.1.0');
    expect(out).not.toMatch(/^version:/m); // no top-level line introduced
    expect(out).toContain('body');
  });

  test('top-level-only → bumped in place', () => {
    const out = reconcileAgentVersion('---\nname: a\nversion: 1.0.0\n---\n\nbody\n', '1.2.0');
    expect(out).toContain('version: 1.2.0');
    expect(out).not.toContain('1.0.0');
    expect(out).toContain('body');
  });

  test('corrupted (both) → metadata bumped, top-level line removed', () => {
    const out = reconcileAgentVersion('---\nname: a\nmetadata:\n  version: 1.0.0\nversion: 1.2.0\n---\n\nbody\n', '1.3.0');
    expect(out).toContain('  version: 1.3.0'); // metadata holds the fresh version
    expect(out).not.toMatch(/^version:/m); // the duplicate top-level line is gone
    expect(out).not.toContain('1.2.0'); // stale top-level value gone
    // exactly one `version:` line remains (the nested one)
    expect(out.split('\n').filter(l => /version:/.test(l))).toHaveLength(1);
  });

  test('neither → top-level version inserted before closing ---', () => {
    const out = reconcileAgentVersion('---\nname: a\n---\n\nbody\n', '1.0.0');
    expect(out).toBe('---\nname: a\nversion: 1.0.0\n---\n\nbody\n');
  });

  test('no frontmatter → block prepended', () => {
    const out = reconcileAgentVersion('# My Command\n\nDoes things.\n', '0.3.0');
    expect(out.startsWith('---\nversion: 0.3.0\n---\n\n')).toBe(true);
    expect(out).toContain('# My Command');
  });

  test('quote style preserved on metadata replacement', () => {
    const out = reconcileAgentVersion('---\nmetadata:\n  version: "1.0.0"\n---\n', '1.3.0');
    expect(out).toContain('  version: "1.3.0"');
  });

  test('nested-not-stripped: unrelated lines untouched', () => {
    const input = '---\nname: a\nmetadata:\n  version: 1.0.0\ndescription: handles version foo\n---\n';
    const out = reconcileAgentVersion(input, '1.1.0');
    expect(out).toContain('  version: 1.1.0');
    expect(out).toContain('description: handles version foo'); // not mangled
  });

  test('idempotency: second pass is byte-identical to first', () => {
    const corrupted = '---\nname: a\nmetadata:\n  version: 1.0.0\nversion: 1.2.0\n---\n\nbody\n';
    const first = reconcileAgentVersion(corrupted, '1.3.0');
    const second = reconcileAgentVersion(first, '1.3.0');
    expect(second).toBe(first);
  });
});
