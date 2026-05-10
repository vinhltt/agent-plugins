// TODO(sync): ported from .claude/skills/skill-bump/tests/bump-rules.test.ts
// Port date: 2026-05-09. Adjust import paths only; keep test logic identical.

import { test, expect, describe } from 'bun:test';
import { inferBump, applyBump } from '../scripts/bump-rules';

describe('inferBump', () => {
  test('empty → none', () => {
    expect(inferBump([])).toBe('none');
  });

  test('M → patch', () => {
    expect(inferBump(['M'])).toBe('patch');
  });

  test('A,M → minor (max-wins)', () => {
    expect(inferBump(['A', 'M'])).toBe('minor');
  });

  test('M,D → major (max-wins)', () => {
    expect(inferBump(['M', 'D'])).toBe('major');
  });

  test('D alone → major (conservative)', () => {
    expect(inferBump(['D'])).toBe('major');
  });

  test('R → patch', () => {
    expect(inferBump(['R'])).toBe('patch');
  });

  test('C → patch', () => {
    expect(inferBump(['C'])).toBe('patch');
  });

  test('A,A → minor (idempotent)', () => {
    expect(inferBump(['A', 'A'])).toBe('minor');
  });
});

describe('applyBump', () => {
  test('major: 0.1.0 → 1.0.0', () => {
    expect(applyBump('0.1.0', 'major')).toBe('1.0.0');
  });

  test('minor: 1.2.3 → 1.3.0', () => {
    expect(applyBump('1.2.3', 'minor')).toBe('1.3.0');
  });

  test('patch: 1.2.3 → 1.2.4', () => {
    expect(applyBump('1.2.3', 'patch')).toBe('1.2.4');
  });

  test('none: 1.2.3 unchanged', () => {
    expect(applyBump('1.2.3', 'none')).toBe('1.2.3');
  });

  test('invalid semver throws', () => {
    expect(() => applyBump('not-semver', 'patch')).toThrow();
  });

  test('major resets minor + patch', () => {
    expect(applyBump('2.5.7', 'major')).toBe('3.0.0');
  });

  test('minor resets patch', () => {
    expect(applyBump('1.4.9', 'minor')).toBe('1.5.0');
  });
});
