#!/usr/bin/env python3
"""Architecture guardrails for attractap firmware flat src layout."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FW_ROOT = REPO_ROOT / "apps" / "attractap-firmware"
SRC_ROOT = FW_ROOT / "src"
ADAPTERS_ROOT = SRC_ROOT / "adapters"
FLAT_ARCH_SCOPES = (
    SRC_ROOT / "runtime",
    SRC_ROOT / "domain",
    SRC_ROOT / "events",
    SRC_ROOT / "kernel",
    SRC_ROOT / "ports",
    SRC_ROOT / "contracts",
)
FORBIDDEN_IMPL_ROOTS = {
    "api",
    "display",
    "network",
    "settings",
    "state",
    "nfc",
    "serial",
    "websocket",
    "beeper",
    "ioexpander",
}
LEGACY_STATIC_GLOBALS = (
    "Settings::",
    "State::",
    "Network::",
    "Display::",
    "API::",
    "NFC::",
    "SerialCommandHandler::",
)
GLOBAL_GUARDRAIL_SCOPES = (SRC_ROOT / "runtime", SRC_ROOT / "domain", SRC_ROOT / "events")

INCLUDE_RE = re.compile(r'^\s*#include\s*[<"]([^">]+)[">]')


def iter_code_files(root: Path):
    for path in root.rglob("*"):
        if path.suffix in {".hpp", ".cpp", ".h", ".c"} and path.is_file():
            yield path


def is_adapter_path(path: Path) -> bool:
    return ADAPTERS_ROOT in path.parents


def resolve_include_target(source_file: Path, include_path: str) -> Path:
    return (source_file.parent / include_path).resolve()


def check_include_boundaries(violations: list[str]) -> None:
    for scope in FLAT_ARCH_SCOPES:
        if not scope.exists():
            continue
        for path in iter_code_files(scope):
            if is_adapter_path(path):
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for idx, line in enumerate(text.splitlines(), start=1):
                m = INCLUDE_RE.match(line)
                if not m:
                    continue
                include_path = m.group(1)
                first = include_path.split("/", 1)[0]
                if first in FORBIDDEN_IMPL_ROOTS:
                    candidate = SRC_ROOT / include_path
                    if candidate.exists():
                        violations.append(
                            f"{path.relative_to(REPO_ROOT)}:{idx} includes impl header '{include_path}' outside adapters"
                        )
                        continue
                target = resolve_include_target(path, include_path)
                try:
                    rel_to_src = target.relative_to(SRC_ROOT)
                except ValueError:
                    continue
                if rel_to_src.parts and rel_to_src.parts[0] in FORBIDDEN_IMPL_ROOTS:
                    violations.append(
                        f"{path.relative_to(REPO_ROOT)}:{idx} includes impl header '{include_path}' outside adapters"
                    )


def check_static_global_usage(violations: list[str]) -> None:
    token_patterns = {
        token: re.compile(rf"(^|[^A-Za-z0-9_]){re.escape(token)}")
        for token in LEGACY_STATIC_GLOBALS
    }
    for scope in GLOBAL_GUARDRAIL_SCOPES:
        if not scope.exists():
            continue
        for path in iter_code_files(scope):
            text = path.read_text(encoding="utf-8", errors="ignore")
            for idx, line in enumerate(text.splitlines(), start=1):
                for token, pattern in token_patterns.items():
                    if pattern.search(line):
                        violations.append(
                            f"{path.relative_to(REPO_ROOT)}:{idx} uses forbidden global/static '{token}'"
                        )


def check_no_app_prefixed_includes(violations: list[str]) -> None:
    for path in iter_code_files(SRC_ROOT):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for idx, line in enumerate(text.splitlines(), start=1):
            m = INCLUDE_RE.match(line)
            if not m:
                continue
            include_path = m.group(1)
            if include_path.startswith("app/"):
                violations.append(
                    f"{path.relative_to(REPO_ROOT)}:{idx} uses obsolete app-prefixed include '{include_path}'"
                )


def check_flat_layout(violations: list[str]) -> None:
    app_root = SRC_ROOT / "app"
    if app_root.exists():
        app_code = list(iter_code_files(app_root))
        if app_code:
            violations.append(
                "src/app still contains code files; flat src layout expected"
            )


def main() -> int:
    _require_flat_layout = "--require-flat-layout" in sys.argv[1:]
    violations: list[str] = []
    check_include_boundaries(violations)
    check_static_global_usage(violations)
    check_no_app_prefixed_includes(violations)
    check_flat_layout(violations)

    if violations:
        print("Architecture guardrail violations detected:")
        for v in violations:
            print(f"- {v}")
        return 1

    print("Architecture guardrails passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
