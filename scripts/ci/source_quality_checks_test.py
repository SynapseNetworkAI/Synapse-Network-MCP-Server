#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from source_quality_checks import scan_python_text, scan_typescript_text  # noqa: E402 quality-disable-reason: test imports local script module after sys.path setup


def assert_codes(findings, codes):
    actual = [finding.code for finding in findings]
    assert actual == codes, actual


def test_typescript_rejects_exported_raw_map_return():
    findings = scan_typescript_text(Path("src/example.ts"), "export async function foo(): Promise<Record<string, unknown>> { return {}; }\n")
    assert_codes(findings, ["SOURCE-RAW-MAP-RETURN-TS"])


def test_typescript_rejects_public_class_method_raw_map_return():
    findings = scan_typescript_text(Path("src/example.ts"), "class GatewayError {\n  toJSON(): Record<string, unknown> { return {}; }\n}\n")
    assert_codes(findings, ["SOURCE-RAW-MAP-RETURN-TS"])


def test_typescript_allows_named_object_contract_and_json_boundaries():
    text = """
interface GatewayErrorPayload { status: number; code: string; message: string; }
export function errorPayload(): GatewayErrorPayload { return { status: 500, code: "X", message: "x" }; }
interface InvokeArgs { payload: Record<string, unknown>; schema?: Record<string, unknown>; }
function buildRequestBody(): Record<string, unknown> { return {}; }
function _normalizeDetails(): Record<string, unknown> { return {}; }
"""
    assert_codes(scan_typescript_text(Path("src/example.ts"), text), [])


def test_python_rejects_public_dict_returns():
    text = """
from typing import Any, Dict

def foo() -> dict:
    return {}

def bar() -> Dict[str, Any]:
    return {}
"""
    assert_codes(scan_python_text(Path("scripts/example.py"), text), ["SOURCE-RAW-MAP-RETURN-PY", "SOURCE-RAW-MAP-RETURN-PY"])


def test_python_allows_helpers_and_boundary_returns():
    text = """
from typing import Any, Dict

class Result:
    pass

def make_result() -> Result:
    return Result()

def _helper() -> dict:
    return {}

def build_payload() -> Dict[str, Any]:
    return {}

def request_body() -> dict:
    return {}
"""
    assert_codes(scan_python_text(Path("scripts/example.py"), text), [])


def main():
    for name, value in sorted(globals().items()):
        if name.startswith("test_"):
            value()
    print("[source-quality-test] passed")


if __name__ == "__main__":
    main()
