#!/usr/bin/env python3
"""Post-edit guard: refuse to leave a CSS file with unbalanced braces.

Why this exists: resolving a merge conflict in src/style.css by keeping both
sides consumed the closing brace of a @media block. That silently disabled
roughly seventy rules — including every responsive fix — and nothing threw,
nothing logged, and the tests still passed. The only symptom was 65px of page
overflow at one viewport size, which took a DOM measurement to notice.

A brace count would have caught it in under a second. So rather than "remember
to check next time", the check runs automatically after every edit to a
stylesheet. See BUGS.md section 4.

Reads the hook payload on stdin; exits non-zero with an explanation if the
edited file is a stylesheet whose braces do not balance.
"""
import json
import re
import sys
from pathlib import Path


def strip_noise(css: str) -> str:
    """Remove comments and string literals so their braces don't count."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r'"(?:[^"\\]|\\.)*"', '""', css)
    css = re.sub(r"'(?:[^'\\]|\\.)*'", "''", css)
    return css


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0  # Not our business to fail the turn over a malformed payload.

    path = (payload.get("tool_input") or {}).get("file_path", "")
    if not path.endswith((".css", ".scss")):
        return 0

    target = Path(path)
    if not target.exists():
        return 0

    code = strip_noise(target.read_text(encoding="utf-8", errors="replace"))
    depth = 0
    line = 1
    first_negative = None
    for char in code:
        if char == "\n":
            line += 1
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth < 0 and first_negative is None:
                first_negative = line

    if depth == 0 and first_negative is None:
        return 0

    print(f"CSS BRACE IMBALANCE in {path}", file=sys.stderr)
    if first_negative is not None:
        print(
            f"  A closing brace at line {first_negative} has no matching opener.",
            file=sys.stderr,
        )
    if depth > 0:
        print(
            f"  {depth} block(s) left unclosed — every rule after the unclosed "
            f"block is silently ignored by the browser.",
            file=sys.stderr,
        )
    elif depth < 0:
        print(f"  {abs(depth)} extra closing brace(s).", file=sys.stderr)
    print("  See BUGS.md section 4 for why this guard exists.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
