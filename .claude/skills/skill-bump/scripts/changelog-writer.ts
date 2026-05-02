// Keep-a-Changelog format. Append entry above the most recent version block.

import { findHeaderEnd } from './lib/changelog-helpers';

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  added: string[];
  changed: string[];
  removed: string[];
}

export function renderEntry(entry: ChangelogEntry): string {
  const sections: string[] = [];
  sections.push(`## [${entry.version}] - ${entry.date}`);
  if (entry.added.length) {
    sections.push(`\n### Added\n${entry.added.map(p => `- ${p}`).join('\n')}`);
  }
  if (entry.changed.length) {
    sections.push(`\n### Changed\n${entry.changed.map(p => `- ${p}`).join('\n')}`);
  }
  if (entry.removed.length) {
    sections.push(`\n### Removed\n${entry.removed.map(p => `- ${p}`).join('\n')}`);
  }
  return sections.join('\n') + '\n';
}

const HEADER = `# Changelog

All notable changes to this skill will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

`;

export async function appendEntry(
  changelogPath: string,
  entry: ChangelogEntry,
): Promise<void> {
  const exists = await Bun.file(changelogPath).exists();
  const rendered = renderEntry(entry);
  if (!exists) {
    await Bun.write(changelogPath, HEADER + rendered);
    return;
  }
  const existing = await Bun.file(changelogPath).text();
  const idx = findHeaderEnd(existing);
  const updated = existing.slice(0, idx) + rendered + '\n' + existing.slice(idx);
  await Bun.write(changelogPath, updated);
}
