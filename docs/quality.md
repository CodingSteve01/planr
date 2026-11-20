# Code quality

What the pipeline holds the code to, and how to work with it. One command runs
everything that does not need the test suite:

```bash
npm run quality        # lint, duplicates, dead code, versions, semgrep, private terms
npm run test:coverage  # the suite, with the coverage floor
```

`.github/workflows/ci.yml` runs the same on every pull request and on `main`.

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

- **pre-commit** lints the staged files and checks them for private terms;
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
- **Security** (`npm run security`, semgrep's default rules): over the code
  that ships, the scripts and the workflows, with no finding allowed. Tests
  are left out (`.semgrepignore` says why). A finding that is not one gets a
  `nosemgrep` comment with the rule id and the reason on the line above.
- **Workflows**: every action is pinned to a commit, because a tag can be
  moved; `hooks.test.js` holds them to it and Dependabot keeps the pins fresh,
  a week behind publication. Values a contributor controls (a branch name)
  reach a workflow's shell as environment variables, never as text pasted
  into the script.

## Raising a limit, lowering the baseline

Lowering the baseline is ordinary work: fix, prune, commit. Raising a limit or
adding a suppression by hand needs a reason in the commit that does it. A new
`eslint-disable` comment carries its reason on the line above.
