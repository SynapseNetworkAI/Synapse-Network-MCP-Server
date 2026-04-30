#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_ROOTS = ["src", "scripts", "test"];
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".py"]);
const FUNCTION_LIMITS = { production: 80, support: 120 };
const FILE_LIMITS = { production: 500, support: 350 };
const COMPLEXITY_MAX = 12;
const DUPLICATE_WINDOW = 8;
const DUPLICATE_MIN_CHARS = 220;

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function mergeBase() {
  return gitOutput(["merge-base", "HEAD", process.env.QUALITY_BASE_REF || "origin/main"])[0] || "HEAD";
}

function changedFiles() {
  if (process.env.QUALITY_BUDGET_SCOPE === "full") return allFiles();
  const base = mergeBase();
  return [...new Set([...gitOutput(["diff", "--name-only", base, "--"]), ...gitOutput(["diff", "--cached", "--name-only", "--"]), ...gitOutput(["ls-files", "--others", "--exclude-standard"])])].filter(isScannedCodePath).sort();
}

function allFiles() {
  return gitOutput(["ls-files", ...SOURCE_ROOTS]).filter(isScannedCodePath);
}

function isScannedCodePath(path) {
  return isCodePath(path) && !path.includes("scripts/ci/fixtures/");
}

function isCodePath(path) {
  if (!SOURCE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))) return false;
  if (path.includes("node_modules/") || path.includes("dist/")) return false;
  return CODE_EXTENSIONS.has(path.slice(path.lastIndexOf(".")));
}

function effectiveLines(text) {
  return text.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("#") && !trimmed.startsWith("*");
  });
}

function fileKind(path) {
  return path.startsWith("src/") ? "production" : "support";
}

function scanDisableComments(path, lines) {
  const findings = [];
  const pattern = /(eslint-disable|@ts-ignore|@ts-expect-error|type:\s*ignore|noqa|ruff:\s*noqa)/;
  lines.forEach((line, index) => {
    const commentStart = Math.max(line.indexOf("//"), line.indexOf("#"));
    if (commentStart < 0) return;
    const comment = line.slice(commentStart);
    if (pattern.test(comment) && !comment.includes("quality-disable-reason:")) {
      findings.push(`FATAL QUALITY-DISABLE-REASON: ${path}:${index + 1} disable comment must include quality-disable-reason: ...`);
    }
  });
  return findings;
}

function scanFunctionBudgets(path, lines) {
  const findings = [];
  const stack = [];
  lines.forEach((line, index) => {
    if (startsFunction(line)) stack.push({ line: index + 1, braceDepth: 0, body: [], pythonIndent: pythonIndent(line) });
    for (const frame of stack) frame.body.push(line);
    const delta = braceDelta(line);
    for (const frame of stack) frame.braceDepth += delta;
    while (stack.length && shouldCloseFrame(stack[stack.length - 1], line, index, lines)) {
      evaluateFunction(path, stack.pop(), findings);
    }
  });
  while (stack.length) evaluateFunction(path, stack.pop(), findings);
  return findings;
}

function startsFunction(line) {
  const trimmed = line.trim();
  return isJsFunction(trimmed) || isJsArrowFunction(trimmed) || isJsMethod(trimmed) || isPythonFunction(trimmed);
}

function isJsFunction(trimmed) {
  return /^(export\s+)?(async\s+)?function\s+/.test(trimmed);
}

function isJsArrowFunction(trimmed) {
  return /^(export\s+)?const\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>/.test(trimmed);
}

function isJsMethod(trimmed) {
  return /^(public\s+)?(async\s+)?\w+\([^)]*\)\s*[:{]/.test(trimmed);
}

function isPythonFunction(trimmed) {
  return /^def\s+\w+\([^)]*\)\s*(->\s*[^:]+)?\s*:/.test(trimmed);
}

function pythonIndent(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function braceDelta(line) {
  let delta = 0;
  for (const char of stripLiterals(line)) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

function shouldCloseFrame(frame, line, index, lines) {
  if (frame.body.some((bodyLine) => bodyLine.includes("{"))) return frame.braceDepth <= 0;
  const next = lines[index + 1];
  return next === undefined || (next.trim() && pythonIndent(next) <= frame.pythonIndent);
}

function evaluateFunction(path, frame, findings) {
  const kind = fileKind(path);
  const lineCount = effectiveLines(frame.body.join("\n")).length;
  const complexity = cyclomaticComplexity(frame.body.join("\n"));
  if (lineCount > FUNCTION_LIMITS[kind]) findings.push(`FATAL QUALITY-FUNCTION-LINES: ${path}:${frame.line} has ${lineCount} effective lines; budget is ${FUNCTION_LIMITS[kind]}.`);
  if (complexity > COMPLEXITY_MAX) findings.push(`FATAL QUALITY-COMPLEXITY: ${path}:${frame.line} has complexity ${complexity}; budget is ${COMPLEXITY_MAX}.`);
}

function cyclomaticComplexity(text) {
  const clean = stripLiterals(text).replace(/\?\./g, "").replace(/\?\?/g, "");
  const matches = clean.match(/\b(if|else if|for|while|case|catch|switch)\b|&&|\|\||\?/g);
  return 1 + (matches ? matches.length : 0);
}

function stripLiterals(text) {
  return text.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "\"\"").replace(/\/[^/\n]+\/[gimsuy]*/g, "/re/");
}

function scanDuplicateBlocks(files) {
  const seen = new Map();
  const findings = [];
  for (const path of files) {
    const text = readFileSync(resolve(REPO_ROOT, path), "utf8");
    const lines = effectiveLines(text).map(normalizeLine).filter(Boolean);
    for (let index = 0; index <= lines.length - DUPLICATE_WINDOW; index += 1) {
      const block = lines.slice(index, index + DUPLICATE_WINDOW).join("\n");
      if (block.length < DUPLICATE_MIN_CHARS || isFixtureLike(block)) continue;
      const first = seen.get(block);
      if (first && first.path !== path) {
        findings.push(`FATAL QUALITY-DUPLICATION: ${path} duplicates ${first.path}; extract shared logic.`);
        return findings;
      }
      seen.set(block, { path });
    }
  }
  return findings;
}

function normalizeLine(line) {
  return line.trim().replace(/['"][^'"]*['"]/g, '""').replace(/\d+/g, "0");
}

function isFixtureLike(block) {
  return block.includes("expect(") || block.includes("assert") || block.includes("schema.safeParse") || block.includes("describe(");
}

export function scanQualityBudget(files) {
  const findings = [];
  const existingFiles = files.filter((path) => existsSync(resolve(REPO_ROOT, path)) && isCodePath(path));
  for (const path of existingFiles) {
    const text = readFileSync(resolve(REPO_ROOT, path), "utf8");
    const lines = text.split("\n");
    const kind = fileKind(path);
    const lineCount = effectiveLines(text).length;
    if (lineCount > FILE_LIMITS[kind]) findings.push(`FATAL QUALITY-FILE-LINES: ${path} has ${lineCount} effective lines; budget is ${FILE_LIMITS[kind]}.`);
    findings.push(...scanDisableComments(path, lines));
    findings.push(...scanFunctionBudgets(path, lines));
  }
  findings.push(...scanDuplicateBlocks(existingFiles));
  return findings;
}

function main() {
  const files = changedFiles();
  const findings = scanQualityBudget(files);
  if (findings.length) {
    for (const finding of findings) console.error(finding);
    process.exit(1);
  }
  console.log(`[quality-budget] passed ${files.length} changed file(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
