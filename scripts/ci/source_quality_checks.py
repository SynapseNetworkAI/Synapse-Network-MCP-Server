#!/usr/bin/env python3
"""Source-shape checks for public raw-map return contracts."""

from __future__ import annotations

import ast
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GIT_BIN = shutil.which("git")
SOURCE_ROOTS = (Path("src"), Path("scripts"), Path("test"))
PY_RAW_MAP_RETURNS = {"dict", "Dict"}
TS_RAW_MAP_PATTERNS = (
    re.compile(r"\bPromise\s*<\s*Record\s*<\s*string\s*,\s*unknown\s*>\s*>"),
    re.compile(r"\bRecord\s*<\s*string\s*,\s*unknown\s*>")
)
PY_ALLOWED_PREFIXES = ("_", "parse_", "normalize_", "build_", "as_", "serialize_")
PY_ALLOWED_SUFFIXES = ("_body", "_payload", "_patch", "_schema", "_schemas", "_json")
TS_ALLOWED_PREFIXES = ("_", "parse", "normalize", "build", "as", "serialize")
TS_ALLOWED_SUFFIXES = ("Body", "Payload", "Patch", "Schema", "Schemas", "Json")


@dataclass(frozen=True)
class Finding:
    code: str
    path: Path
    line: int
    symbol: str
    return_type: str
    language: str

    def format(self) -> str:
        rel = self.path.relative_to(REPO_ROOT).as_posix()
        return (
            f"FATAL {self.code}: {rel}:{self.line} {self.symbol} returns {self.return_type}\n"
            "Why dangerous: public raw-map returns hide the object contract from callers and agents.\n"
            "Agent fix: return a named interface/type/dataclass/Pydantic model. Keep raw maps only inside "
            "private helpers, request bodies, patches, payload/schema fields, or external JSON boundaries."
        )


def _git_output(args: list[str]) -> list[str]:
    if GIT_BIN is None:
        return []
    result = subprocess.run([GIT_BIN, *args], cwd=REPO_ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return []
    return [line for line in result.stdout.splitlines() if line.strip()]


def _merge_base() -> str:
    base_ref = os.environ.get("QUALITY_BASE_REF", "origin/main")
    merge_base = _git_output(["merge-base", "HEAD", base_ref])
    return merge_base[0] if merge_base else "HEAD"


def changed_files() -> list[Path]:
    if os.environ.get("SOURCE_QUALITY_SCOPE") == "full":
        return sorted(
            path.relative_to(REPO_ROOT)
            for root in SOURCE_ROOTS
            for suffix in ("*.py", "*.ts", "*.tsx", "*.mjs")
            for path in (REPO_ROOT / root).rglob(suffix)
        )
    base = _merge_base()
    names = [
        *_git_output(["diff", "--name-only", base, "--"]),
        *_git_output(["diff", "--cached", "--name-only", "--"]),
        *_git_output(["ls-files", "--others", "--exclude-standard"])
    ]
    return sorted({Path(name) for name in names})


def is_source_file(path: Path) -> bool:
    text = path.as_posix()
    return path.suffix in {".py", ".ts", ".tsx", ".mjs"} and any(
        text == root.as_posix() or text.startswith(root.as_posix() + "/") for root in SOURCE_ROOTS
    )


def _annotation_name(node: ast.AST | None) -> str:
    if node is None:
        return ""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Subscript):
        return _annotation_name(node.value)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return f"{_annotation_name(node.left)}|{_annotation_name(node.right)}"
    return ""


def _annotation_text(node: ast.AST | None) -> str:
    if node is None:
        return ""
    try:
        return ast.unparse(node)
    except Exception:
        return _annotation_name(node)


def _returns_python_raw_map(node: ast.AST | None) -> bool:
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return _returns_python_raw_map(node.left) or _returns_python_raw_map(node.right)
    if isinstance(node, ast.Subscript):
        return _annotation_name(node.value) in PY_RAW_MAP_RETURNS
    return _annotation_name(node) in PY_RAW_MAP_RETURNS


def _allowed_python_name(name: str) -> bool:
    return name.startswith(PY_ALLOWED_PREFIXES) or name.endswith(PY_ALLOWED_SUFFIXES) or name in {"to_dict", "model_dump"}


def scan_python_text(path: Path, text: str) -> list[Finding]:
    try:
        tree = ast.parse(text, filename=path.as_posix())
    except SyntaxError as exc:
        return [Finding("SOURCE-PY-SYNTAX", REPO_ROOT / path, exc.lineno or 1, "<module>", "syntax-error", "python")]
    parents: dict[ast.AST, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    findings: list[Finding] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not _returns_python_raw_map(node.returns) or _allowed_python_name(node.name):
            continue
        if isinstance(parents.get(node), (ast.Module, ast.ClassDef)):
            findings.append(Finding("SOURCE-RAW-MAP-RETURN-PY", REPO_ROOT / path, node.lineno, node.name, _annotation_text(node.returns), "python"))
    return findings


def _ts_name(line: str) -> str | None:
    patterns = (
        r"\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(",
        r"\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*[:=]",
        r"^\s*(?:public\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*:\s*",
        r"\bconst\s+([A-Za-z_$][\w$]*)\s*:\s*"
    )
    for pattern in patterns:
        match = re.search(pattern, line)
        if match:
            return match.group(1)
    return None


def _ts_return_annotation(line: str) -> str:
    for pattern in (r"\)\s*:\s*([^={;]+?)\s*=>", r"\)\s*:\s*([^\{;]+)", r"=\s*(?:async\s*)?\([^)]*\)\s*:\s*([^=]+?)\s*=>"):
        match = re.search(pattern, line)
        if match:
            return match.group(1).strip()
    return ""


def _allowed_ts_name(name: str) -> bool:
    return name.startswith(TS_ALLOWED_PREFIXES) or name.endswith(TS_ALLOWED_SUFFIXES)


def scan_typescript_text(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        annotation = _ts_return_annotation(line)
        if "Record" not in annotation or not any(pattern.search(annotation) for pattern in TS_RAW_MAP_PATTERNS):
            continue
        name = _ts_name(line)
        if not name or _allowed_ts_name(name):
            continue
        return_type = "Promise<Record<string, unknown>>" if annotation.startswith("Promise") else "Record<string, unknown>"
        findings.append(Finding("SOURCE-RAW-MAP-RETURN-TS", REPO_ROOT / path, line_no, name, return_type, "typescript"))
    return findings


def scan_text(path: Path, text: str) -> list[Finding]:
    if path.suffix == ".py":
        return scan_python_text(path, text)
    if path.suffix in {".ts", ".tsx", ".mjs"}:
        return scan_typescript_text(path, text)
    return []


def scan_files(paths: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        if not is_source_file(path):
            continue
        absolute = REPO_ROOT / path
        if absolute.exists():
            findings.extend(scan_text(path, absolute.read_text(encoding="utf-8")))
    return findings


def main() -> int:
    findings = scan_files(changed_files())
    if findings:
        for finding in findings:
            print(finding.format(), file=sys.stderr)
        return 1
    print("[source-quality] passed public raw-map return check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
