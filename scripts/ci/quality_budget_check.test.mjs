#!/usr/bin/env node
import assert from "node:assert/strict";
import { scanQualityBudget } from "./quality_budget_check.mjs";

function has(pattern, findings) {
  assert.match(findings.join("\n"), pattern);
}

function main() {
  has(/QUALITY-FUNCTION-LINES/, scanQualityBudget(["scripts/ci/fixtures/too_long_function.ts"]));
  has(/QUALITY-COMPLEXITY/, scanQualityBudget(["scripts/ci/fixtures/high_complexity.ts"]));
  has(/QUALITY-FILE-LINES/, scanQualityBudget(["scripts/ci/fixtures/too_large_file.ts"]));
  has(/QUALITY-DISABLE-REASON/, scanQualityBudget(["scripts/ci/fixtures/bad_disable.ts"]));
  has(/QUALITY-DUPLICATION/, scanQualityBudget(["scripts/ci/fixtures/duplicate_a.ts", "scripts/ci/fixtures/duplicate_b.ts"]));
  assert.deepEqual(scanQualityBudget(["scripts/ci/fixtures/good_disable.ts"]), []);
  console.log("[quality-budget-test] passed");
}

main();
