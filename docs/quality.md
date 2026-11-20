# Code quality

What the pipeline holds the code to, and how to work with it. One command runs
everything that does not need the test suite:

```bash
npm run quality        # format, lint, duplicates, dead code, versions, semgrep, private terms
npm run test:coverage  # the suite, with the coverage floor
```

`.github/workflows/ci.yml` runs the same on every pull request and on `main`.

## Formatting

Prettier formats the code (`npm run format`), and `npm run format:check` fails
when a file is not as Prettier would write it. The settings are four lines in
`.prettierrc.json`: single quotes, 140 columns, trailing commas, no parentheses
around a single arrow parameter. Left alone on purpose (`.prettierignore`):
the stylesheets, which are written one rule per line and read as text by a
dozen tests; Markdown, which keeps its author's line breaks; the embedded
fonts; and the semgrep fixtures.

Nobody argues about layout in a review, and a diff shows what changed.

The day the code was first formatted, the baseline was taken again: breaking
long lines made 35 functions and files longer than their limit that were under
it before (343 findings instead of 308, all of the difference in the two
length rules). That is the one time the baseline went up, and it went up
without a rule or a limit changing. Since then it only goes down.

## The baseline, and why the numbers only go down

The rules were switched on over an existing codebase. Fixing everything first
would have meant never switching them on, and switching them on as warnings
would have meant nobody reads them. So the findings that were there on that day
are recorded in `eslint-suppressions.json`, per file and rule, as a count:

- a file may have as many findings of a rule as the baseline says, no more;
- a suppression that is no longer needed fails the lint as well, so a fix is
  followed by `npm run lint:prune`, which lowers the count for good;
- new files start at zero.

Nothing in the baseline is approved of. It is a list of debts, and the file
with the longest entry is the one to split next.

## The limits

| What | Limit | Why |
|---|---|---|
| Cyclomatic complexity of a function | 15 | above that, the cases stop fitting in one head and one test |
| Nesting depth | 4 | deeper nesting is where an early return was not taken |
| Parameters | 7 | more is an object that has not been named yet |
| Function length | 80 lines (`.js`), 200 (`.jsx`) | a component carries its markup, a utility does not |
| File length | 800 lines | beyond that a file has more than one job |
| Duplicated code | 1.5 % of lines | measured by jscpd, clones of 8 lines or more |
| Coverage | lines 74 %, statements 69 %, functions 63 %, branches 60 % | a floor under the totals: it catches the suite sliding, not one untested change |

Correctness rules (ESLint's recommended set, `eqeqeq`, `no-unused-vars`,
`react-hooks/rules-of-hooks`, no duplicate imports or dictionary keys) apply to
tests too; the size limits do not, because a `describe` block is one long
function by nature. `src/i18n.jsx` and the embedded fonts are exempt from the
size limits: one is a dictionary, the other is data.

## Before CI: the hooks

`npm install` installs three git hooks (`scripts/install-hooks.mjs`, also
`npm run hooks`):

- **pre-commit** checks that the staged files are formatted, lints them and
  checks them for private terms;
- **commit-msg** checks the message for private terms;
- **pre-push** runs `npm run quality`.

A hook of the same name that was already there and is not ours is left alone
and reported. `git commit --no-verify` skips them; CI does not.

## The other checks

- **Dead code** (`npm run deadcode`, knip): no file that nothing imports, no
  dependency nothing uses. `npm run deadcode:exports` lists exports nothing
  imports; that one is a report, because several are used by tests only.
- **Versions** (`npm run version:check`): `package.json`, `manifest.json` and
  `versions.json` agree.
- **Private terms** (`npm run private`): see
  [contributing.md](contributing.md#nothing-from-a-real-plan). It needs the
  owner's word list and checks nothing without it, so it is not part of CI.
- **Audit**: `npm audit --omit=dev --audit-level=high` on what ships.
- **Security** (`npm run security`, semgrep): the repository's own rules in
  `semgrep/planr.yml`, with no finding allowed. They say what Planr promises:
  nothing from a plan becomes code (`eval`, `new Function`), plan text reaches
  the page as text (no raw HTML), the app loads no code and sends nothing over
  a network, and a workflow pastes no contributor-controlled value into a
  shell and uses no action by a movable tag. The rules live in the repository
  so that the same commit is judged the same way tomorrow. A place that is
  not a violation gets a `nosemgrep: <rule id>` comment with the reason above
  it. Where semgrep is not installed the local check is skipped with a line
  saying so; CI installs a pinned version and fails without it.
  `npm run security:test` runs each rule against a line it must find and one
  it must not (the files beside the rules in `semgrep/`), so a rule cannot go quiet unnoticed.
- **Security, as advice** (`npm run security:advice`): semgrep's registry
  rules. They change upstream, so they run in CI without blocking.
- **Workflows**: every action is pinned to a commit, because a tag can be
  moved; `hooks.test.js` holds them to it and Dependabot keeps the pins fresh,
  a week behind publication. Values a contributor controls (a branch name)
  reach a workflow's shell as environment variables, never as text pasted
  into the script.

## Raising a limit, lowering the baseline

Lowering the baseline is ordinary work: fix, prune, commit. Raising a limit or
adding a suppression by hand needs a reason in the commit that does it. A new
`eslint-disable` comment carries its reason on the line above.
