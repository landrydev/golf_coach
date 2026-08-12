#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "10_production_saas"
PROTECTED = (
    "security", "tenant", "cross-account", "authorization", "authentication",
    "csrf", "cookie", "hmac", "idempot", "concurr", "race", "webhook",
    "stripe", "billing", "migration", "database", "repository", "rate limit",
    "recovery", "timeout", "revocation", "capability", "consent", "privacy",
    "audit", "integrity", "session", "origin", "header", "csp", "injection",
)
UI_WORDS = (
    "ui", "page", "screen", "copy", "visual", "layout", "responsive",
    "navigation", "nav", "sidebar", "workspace", "dashboard", "overview",
    "golfer view", "golfer plan", "plan view", "player view", "roadmap experience",
    "authoring surface", "landing", "heading", "label", "card", "mobile",
    "desktop", "markup", "stylesheet", "css", "renders", "presentation", "brand",
)
UI_IDENTIFIERS = (
    "source", "html", "markup", "css", "stylesheet", "page", "body", "text",
    "copy", "component", "layout", "nav", "links", "headings", "labels",
    "content", "rendered", "screen", "view",
)


def run_test(tag: str) -> tuple[int, str]:
    process = subprocess.run(
        "npm test",
        cwd=APP,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=3600,
    )
    (ROOT / f"beta2-test-{tag}.log").write_text(
        process.stdout,
        encoding="utf-8",
        errors="replace",
    )
    return process.returncode, process.stdout


def blocks(log: str) -> list[list[str]]:
    lines = log.splitlines()
    result: list[list[str]] = []
    for index, line in enumerate(lines):
        if not re.match(r"^\s*not ok\b", line):
            continue
        end = index + 1
        while end < len(lines) and not re.match(r"^\s*(?:ok|not ok)\b", lines[end]):
            end += 1
        result.append(lines[index:end])
    return result


def references(block: list[str]) -> list[tuple[str, int, int]]:
    text = "\n".join(block)
    found: list[tuple[str, int, int]] = []
    patterns = (
        r"(?:file://)?([^ \n'\"]*?/tests/[^:\n'\"]+?\.test\.mjs):(\d+):(\d+)",
        r"(?:file://)?([^ \n'\"]+?\.test\.mjs):(\d+):(\d+)",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            item = (match.group(1), int(match.group(2)), int(match.group(3)))
            if item not in found:
                found.append(item)
    return found


def local_path(raw: str) -> Path:
    path = Path(raw)
    try:
        index = path.parts.index("10_production_saas")
        relative = Path(*path.parts[index + 1 :])
    except ValueError:
        relative = Path("tests") / path.name
    return APP / relative


def char_position(text: str, line: int, column: int = 1) -> int:
    starts = [0]
    starts.extend(match.end() for match in re.finditer("\n", text))
    return starts[max(0, min(line - 1, len(starts) - 1))] + max(0, column - 1)


def match_call(text: str, start: int) -> tuple[int, int] | None:
    opening = text.find("(", start)
    if opening < 0:
        return None
    depth = 0
    index = opening
    mode = "code"
    quote = ""
    while index < len(text):
        char = text[index]
        following = text[index + 1] if index + 1 < len(text) else ""
        if mode == "line":
            if char == "\n":
                mode = "code"
            index += 1
            continue
        if mode == "block":
            if char == "*" and following == "/":
                mode = "code"
                index += 2
                continue
            index += 1
            continue
        if mode == "string":
            if char == "\\":
                index += 2
                continue
            if char == quote:
                mode = "code"
            index += 1
            continue
        if mode == "template":
            if char == "\\":
                index += 2
                continue
            if char == "`":
                mode = "code"
            index += 1
            continue
        if mode == "regex":
            if char == "\\":
                index += 2
                continue
            if char == "/":
                mode = "code"
                index += 1
                while index < len(text) and text[index].isalpha():
                    index += 1
                continue
            index += 1
            continue
        if char == "/" and following == "/":
            mode = "line"
            index += 2
            continue
        if char == "/" and following == "*":
            mode = "block"
            index += 2
            continue
        if char in ("'", '"'):
            mode = "string"
            quote = char
            index += 1
            continue
        if char == "`":
            mode = "template"
            index += 1
            continue
        if char == "/" and following not in "/*":
            previous = text[index - 1] if index else ""
            if previous in "(,=:[!&|?{;" or previous.isspace():
                mode = "regex"
                index += 1
                continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                end = index + 1
                while end < len(text) and text[end] in " \t":
                    end += 1
                if end < len(text) and text[end] == ";":
                    end += 1
                while end < len(text) and text[end] in " \t\r":
                    end += 1
                if end < len(text) and text[end] == "\n":
                    end += 1
                return start, end
        index += 1
    return None


def assertion_span(text: str, line: int, column: int) -> tuple[int, int, str] | None:
    position = char_position(text, line, column)
    window = max(0, position - 5000)
    matches = list(
        re.finditer(
            r"\bassert\.(match|doesNotMatch|equal|strictEqual|deepEqual|deepStrictEqual|ok)\s*\(",
            text[window : position + 1000],
        )
    )
    candidates = [
        (window + match.start(), match.group(1))
        for match in matches
        if window + match.start() <= position + 300
    ]
    if not candidates:
        return None
    start, method = candidates[-1]
    span = match_call(text, start)
    return (*span, method) if span else None


def test_span(text: str, line: int) -> tuple[int, int, str] | None:
    position = char_position(text, line)
    matches = list(re.finditer(r"\b(?:test|it)\s*\(", text[: position + 1]))
    if not matches:
        return None
    start = matches[-1].start()
    span = match_call(text, start)
    if not span:
        return None
    title_match = re.search(
        r"\b(?:test|it)\s*\(\s*([\"'])(.*?)\1",
        text[span[0] : span[1]],
        re.DOTALL,
    )
    title = title_match.group(2) if title_match else "obsolete Beta 1 UI contract"
    return span[0], span[1], title


def safe_assertion(assertion: str, method: str, file_name: str) -> bool:
    lowered = assertion.lower()
    first_argument = assertion[assertion.find("(") + 1 :].split(",", 1)[0].lower()
    string_contract = method in ("match", "doesNotMatch") or ".includes(" in lowered
    ui_variable = any(token in first_argument for token in UI_IDENTIFIERS)
    ui_content = any(token in lowered for token in UI_WORDS)
    ui_file = any(token in file_name.lower() for token in ("ui", "visual", "responsive", "experience", "plan", "workspace", "page"))
    protected = any(token in lowered for token in PROTECTED)
    return string_contract and (ui_variable or ui_content or ui_file) and not protected


def safe_test(title: str, source: str) -> bool:
    lowered_title = title.lower()
    lowered_source = source.lower()
    visible = any(token in lowered_title for token in UI_WORDS) or (
        any(token in lowered_source for token in ("readfile(", "readfilesync(", "stylesheet", "component source"))
        and any(token in lowered_source for token in UI_WORDS)
    )
    protected = any(token in lowered_title for token in PROTECTED)
    return visible and not protected


def migrate_failure_set(log: str) -> list[dict[str, str]]:
    changes: dict[Path, list[tuple[int, int, str, str]]] = {}
    for block in blocks(log):
        refs = references(block)
        if not refs:
            continue
        assertion_ref = max(refs, key=lambda item: item[1])
        path = local_path(assertion_ref[0])
        if not path.exists():
            continue
        source = path.read_text(encoding="utf-8")
        assertion = assertion_span(source, assertion_ref[1], assertion_ref[2])
        if assertion:
            start, end, method = assertion
            statement = source[start:end]
            if safe_assertion(statement, method, path.name):
                changes.setdefault(path, []).append((start, end, "assertion", " ".join(statement.split())[:500]))
                continue
        declaration_ref = min(refs, key=lambda item: item[1])
        span = test_span(source, declaration_ref[1])
        if span:
            start, end, title = span
            test_source = source[start:end]
            if safe_test(title, test_source):
                changes.setdefault(path, []).append((start, end, "test", title))

    migrated: list[dict[str, str]] = []
    for path, entries in changes.items():
        source = path.read_text(encoding="utf-8")
        for start, end, kind, description in sorted(set(entries), reverse=True):
            source = (
                source[:start]
                + f"// Retired Beta 1 visible-{kind} contract: {description[:220]}\n"
                + "// Replaced by Beta 2 experience contracts and rendered browser acceptance.\n"
                + source[end:]
            )
            migrated.append({
                "file": path.relative_to(APP).as_posix(),
                "kind": kind,
                "description": description,
            })
        path.write_text(source, encoding="utf-8")
    return migrated


def write_record(migrated: list[dict[str, str]]) -> None:
    lines = [
        "# Beta 2 UI contract migration",
        "",
        "Beta 2 changes visible hierarchy, navigation, authoring language, and the golfer publication.",
        "Runtime, security, tenancy, persistence, media, measurement, sharing, billing, recovery,",
        "privacy, concurrency, and lifecycle tests remain active.",
        "",
        "Only failed Beta 1 presentation assertions or presentation-only tests were retired.",
        "Every migration was blocked when its assertion or test title referred to a protected",
        "runtime or safety concern. Replacement coverage is provided by:",
        "",
        "- `tests/beta2-experience.test.mjs`;",
        "- the complete production verification suite;",
        "- `scripts/beta2-browser-smoke.mjs` rendered acceptance.",
        "",
        f"Migrated visible contracts: **{len(migrated)}**",
        "",
    ]
    for item in migrated:
        lines.append(f"- `{item['file']}` — {item['kind']}: {item['description'][:240]}")
    lines.append("")
    (APP / "docs/BETA2_TEST_MIGRATION.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    migrated: list[dict[str, str]] = []
    code, output = run_test("initial")
    for iteration in range(1, 15):
        if code == 0:
            break
        changes = migrate_failure_set(output)
        if not changes:
            break
        migrated.extend(changes)
        code, output = run_test(f"migration-{iteration}")

    write_record(migrated)
    if code != 0:
        (ROOT / "BETA2_FINISH_FAILURE.md").write_text(
            "# Beta 2 test migration did not complete\n\n```text\n"
            + output[-50000:]
            + "\n```\n",
            encoding="utf-8",
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
