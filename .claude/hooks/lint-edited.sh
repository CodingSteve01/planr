#!/usr/bin/env bash
# PostToolUse hook: lint the file an agent just edited and hand the errors
# straight back, so a broken import or an undefined name is fixed in the same
# turn instead of surfacing three steps later in a test run. Warnings stay
# quiet (--quiet); only errors block, via exit 2.
file=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
case "$file" in
  *.js|*.jsx|*.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
out=$(npx --no-install eslint --quiet --no-warn-ignored "$file" 2>&1) && exit 0
echo "$out" | tail -40 >&2
exit 2
