// Check 1: CHANGELOG.md contains `## [X.Y.Z]` header for expected version.

import { existsSync, readFileSync } from "node:fs";
import type { CheckOpts, CheckResult } from "./types";
import { CHANGELOG_MD } from "./fs-helpers";

export function checkChangelogHeader(opts: CheckOpts): CheckResult {
  const path = CHANGELOG_MD(opts.root);
  const index = 1;
  const name = "CHANGELOG header";

  if (!existsSync(path)) {
    return {
      ok: false, index, name,
      expected: `## [${opts.expectedVersion}] header`,
      actual: "file missing",
      fixHint: `create ${path} or run the agent-plugins-changelog skill`,
      path,
    };
  }

  const content = readFileSync(path, "utf-8");
  const vEsc = opts.expectedVersion.replace(/\./g, "\\.");
  const headerRe = new RegExp(`^##\\s+\\[${vEsc}\\]`, "m");
  if (headerRe.test(content)) {
    return { ok: true, index, name, path };
  }

  return {
    ok: false, index, name,
    expected: `## [${opts.expectedVersion}]`,
    actual: "missing",
    fixHint: `add "## [${opts.expectedVersion}] - YYYY-MM-DD" section to ${path}`,
    path,
  };
}
