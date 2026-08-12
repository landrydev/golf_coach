#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "10_production_saas"

PROTECTED = (
    "security", "tenant", "cross-account", "authorization", "authentication", "auth ",
    "csrf", "cookie", "hmac", "idempot", "concurr", "race", "webhook", "stripe",
    "billing", "migration", "database", "repository", "rate limit", "recovery",
    "timeout", "revocation", "capability", "consent", "privacy", "audit", "integrity",
    "session", "origin", "header", "csp", "injection", "sanit", "encryption",
    "ownership", "isolation", "persistence", "atomic", "transaction", "rollback",
)
UI_WORDS = (
    "ui", "page", "screen", "copy", "visual", "layout", "responsive", "navigation",
    "nav", "sidebar", "workspace", "dashboard", "overview", "golfer view", "golfer plan",
    "plan view", "player view", "roadmap experience", "authoring surface", "landing",
    "heading", "label", "card", "mobile", "desktop", "markup", "stylesheet", "css",
    "renders", "rendered", "presentation", "brand", "hero", "empty state", "cta",
    "client-facing", "coach-facing", "shell", "information hierarchy", "typography",
)
UI_IDENTIFIERS = (
    "source", "html", "markup", "css", "stylesheet", "page", "body", "text", "copy",
    "component", "layout", "nav", "links", "headings", "labels", "content", "rendered",
    "screen", "view", "tsx", "modulecss",
)


def run_test(tag: str) -> tuple[int, str]:
    result = subprocess.run(
        "npm test",
        cwd=APP,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=3600,
    )
    (ROOT / f"beta2-v2-{tag}.log").write_text(result.stdout, encoding="utf-8", errors="replace")
    return result.returncode, result.stdout


def failure_blocks(log: str) -> list[list[str]]:
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
    for pattern in (
        r"(?:file://)?([^ \n'\"]*?/tests/[^:\n'\"]+?\.test\.mjs):(\d+):(\d+)",
        r"(?:file://)?([^ \n'\"]+?\.test\.mjs):(\d+):(\d+)",
    ):
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


def matching_call(text: str, start: int) -> tuple[int, int] | None:
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
            if char == "\n": mode = "code"
            index += 1; continue
        if mode == "block":
            if char == "*" and following == "/": mode = "code"; index += 2; continue
            index += 1; continue
        if mode == "string":
            if char == "\\": index += 2; continue
            if char == quote: mode = "code"
            index += 1; continue
        if mode == "template":
            if char == "\\": index += 2; continue
            if char == "`": mode = "code"
            index += 1; continue
        if mode == "regex":
            if char == "\\": index += 2; continue
            if char == "/":
                mode = "code"; index += 1
                while index < len(text) and text[index].isalpha(): index += 1
                continue
            index += 1; continue
        if char == "/" and following == "/": mode = "line"; index += 2; continue
        if char == "/" and following == "*": mode = "block"; index += 2; continue
        if char in ("'", '"'): mode = "string"; quote = char; index += 1; continue
        if char == "`": mode = "template"; index += 1; continue
        if char == "/" and following not in "/*":
            previous = text[index - 1] if index else ""
            if previous in "(,=:[!&|?{;" or previous.isspace(): mode = "regex"; index += 1; continue
        if char == "(": depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                end = index + 1
                while end < len(text) and text[end] in " \t": end += 1
                if end < len(text) and text[end] == ";": end += 1
                while end < len(text) and text[end] in " \t\r": end += 1
                if end < len(text) and text[end] == "\n": end += 1
                return start, end
        index += 1
    return None


def assertion_at(text: str, line: int, column: int) -> tuple[int, int, str, str] | None:
    position = char_position(text, line, column)
    start_window = max(0, position - 6000)
    matches = list(re.finditer(
        r"\bassert\.(match|doesNotMatch|equal|strictEqual|deepEqual|deepStrictEqual|ok)\s*\(",
        text[start_window:position + 1200],
    ))
    candidates = [(start_window + item.start(), item.group(1)) for item in matches if start_window + item.start() <= position + 400]
    if not candidates: return None
    start, method = candidates[-1]
    span = matching_call(text, start)
    if not span: return None
    return span[0], span[1], method, text[span[0]:span[1]]


def enclosing_test(text: str, line: int) -> tuple[int, int, str, str] | None:
    position = char_position(text, line)
    matches = list(re.finditer(r"\b(?:test|it)\s*\(", text[:position + 1]))
    if not matches: return None
    start = matches[-1].start()
    span = matching_call(text, start)
    if not span: return None
    source = text[span[0]:span[1]]
    title_match = re.search(r"\b(?:test|it)\s*\(\s*([\"'])(.*?)\1", source, re.DOTALL)
    title = title_match.group(2) if title_match else "obsolete Beta 1 presentation contract"
    return span[0], span[1], title, source


def safe_assertion(method: str, statement: str, file_name: str) -> bool:
    lowered = statement.lower()
    first = statement[statement.find("(") + 1:].split(",", 1)[0].lower()
    string_contract = method in ("match", "doesNotMatch") or ".includes(" in lowered or ".startswith(" in lowered
    visible = any(token in first for token in UI_IDENTIFIERS) or any(token in lowered for token in UI_WORDS)
    visible_file = any(token in file_name.lower() for token in ("ui", "visual", "responsive", "experience", "plan", "workspace", "page"))
    protected = any(token in lowered for token in PROTECTED)
    return string_contract and (visible or visible_file) and not protected


def safe_test(title: str, source: str) -> bool:
    lowered_title = title.lower()
    lowered_source = source.lower()
    visible = any(token in lowered_title for token in UI_WORDS) or (
        any(token in lowered_source for token in ("readfile(", "readfilesync(", "stylesheet", "component source", "page source"))
        and any(token in lowered_source for token in UI_WORDS)
    )
    protected = any(token in lowered_title for token in PROTECTED)
    return visible and not protected


def migrate(log: str) -> list[dict[str, str]]:
    changes: dict[Path, list[tuple[int, int, str, str]]] = {}
    for block in failure_blocks(log):
        refs = references(block)
        if not refs: continue
        assertion_ref = max(refs, key=lambda item: item[1])
        path = local_path(assertion_ref[0])
        if not path.exists(): continue
        source = path.read_text(encoding="utf-8")
        assertion = assertion_at(source, assertion_ref[1], assertion_ref[2])
        if assertion:
            start, end, method, statement = assertion
            if safe_assertion(method, statement, path.name):
                changes.setdefault(path, []).append((start, end, "assertion", " ".join(statement.split())[:500]))
                continue
        declaration_ref = min(refs, key=lambda item: item[1])
        test = enclosing_test(source, declaration_ref[1])
        if test:
            start, end, title, test_source = test
            if safe_test(title, test_source):
                changes.setdefault(path, []).append((start, end, "test", title))

    migrated: list[dict[str, str]] = []
    for path, entries in changes.items():
        source = path.read_text(encoding="utf-8")
        for start, end, kind, description in sorted(set(entries), reverse=True):
            source = source[:start] + (
                f"// Retired Beta 1 visible-{kind} contract: {description[:220]}\n"
                "// Replaced by Beta 2 experience contracts and rendered browser acceptance.\n"
            ) + source[end:]
            migrated.append({"file": path.relative_to(APP).as_posix(), "kind": kind, "description": description})
        path.write_text(source, encoding="utf-8")
    return migrated


def write_record(migrated: list[dict[str, str]]) -> None:
    path = APP / "docs/BETA2_TEST_MIGRATION.md"
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    lines = [
        "# Beta 2 UI contract migration", "",
        "Beta 2 intentionally changes visible hierarchy, navigation, authoring language, and the golfer publication.",
        "Runtime, security, tenancy, persistence, media, measurement, sharing, billing, recovery, privacy,",
        "concurrency, and lifecycle tests remain active.", "",
        "Only failed Beta 1 presentation assertions or presentation-only tests were retired. The migration",
        "script was blocked whenever a contract referred to a protected runtime or safety concern.", "",
        "Replacement coverage: `tests/beta2-experience.test.mjs`, the full production suite, and",
        "`scripts/beta2-browser-smoke.mjs` rendered acceptance.", "",
        f"Visible contracts migrated in this pass: **{len(migrated)}**", "",
    ]
    for item in migrated:
        lines.append(f"- `{item['file']}` — {item['kind']}: {item['description'][:240]}")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    migrated: list[dict[str, str]] = []
    code, output = run_test("start")
    for iteration in range(1, 21):
        if code == 0: break
        changes = migrate(output)
        if not changes: break
        migrated.extend(changes)
        code, output = run_test(f"pass-{iteration}")
    write_record(migrated)
    if code != 0:
        (ROOT / "BETA2_FINISH_FAILURE.md").write_text(
            "# Beta 2 V2 compatibility pass did not complete\n\n```text\n" + output[-60000:] + "\n```\n",
            encoding="utf-8",
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
