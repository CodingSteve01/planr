import { describe, test, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildMarkdownText } from '../markdown.js';
import { parseMdToProject } from '../markdownParse.js';

// Characterisation of parseMdToProject: the parsed result of four plans is
// held against JSON fixtures taken once from the parser as it was before it was
// split into modules. A plan file is somebody's data, so these must stay green
// and unchanged. `WRITE_SHAPE_FIXTURES=1` rewrites them — only for a change of
// the file format that is meant.

const FIX = name => new URL(`./fixtures/${name}.json`, import.meta.url);
const plain = v => JSON.parse(JSON.stringify(v));
function expectShape(name, parsed) {
  if (process.env.WRITE_SHAPE_FIXTURES) {
    mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
    writeFileSync(FIX(name), JSON.stringify(plain(parsed), null, 1) + '\n');
  }
  expect(plain(parsed)).toEqual(JSON.parse(readFileSync(FIX(name), 'utf8')));
}

const FENCE = '```';
const block = (tag, ...rows) => [FENCE + tag, ...rows, FENCE].join('\n');

// Every section and fenced block the parser knows, in the older spellings as
// well as the current ones.
const HAND_WRITTEN = `# Rechnungen

## Plan

| Field | Value |
|---|---|
| Start | 2026-01-05 |
| End | 2026-12-31 |
| View Start | 2025-12-01 |
| Work Days | 1,2,3,4,5,9 |
| Queue By Default | true |

## Teams

| Name | Color | Meeting Plans |
|---|---|---|
| Frontend | \`#3b82f6\` | Engineering |
| Backend | \`10b981\` | |
| Legacy | \`#ff0000\` |

## Custom Fields

| ID | Name | Type | Template/Options |
|---|---|---|---|
| jira | Ticket | uri | https://example.invalid/browse/{value} |
| area | Area | select | Billing, Portal |
| note | Note | text | |

## Meeting Plans

### Engineering
- Standup 0.25h/d
- Retro 0.5h/2w
- Allhands 1h/mo
- Sync 1.5h/w

## Resources

- **Anna Noor** \`AN\` — Frontend, Backend, Lead (80%), 32h/w, 25d/y, ab 2026-01-05, bis 2026-11-30
*Plans: Engineering*
*Meetings: Standup 0.25h/d, Retro 0.5h/2w, Odd thing*
*Capacity plan: 2026-09-01→50%, 2027-01-01→100%30h/w, broken*
*Meeting plan: 2026-06-01→[plans:Engineering, Standup 0.5h/d, Odd]; 2027-01-01→[Retro 1h/mo]; bad*
- **Ben Ortiz** \`BO\` — Backend, Developer (100%), 40h/w, 28d/y
*Cap-Plan: 2026-05-01→60%*
*Meeting-Plan: 2026-07-01→[Sync 1h/w]*

## Vacations

| Person | From | To | Note |
|---|---|---|---|
| AN | 2026-08-03 | 2026-08-14 | Summer |
| Ben Ortiz | 2026-09-07 | 2026-09-11 | |

## Holidays

| Date | Name | Source |
|---|---|---|
| 2026-05-01 | Labour Day | auto |
| 2026-06-15 | Company day | manual |

## Work Tree

- ✅ **P1** Rechnungen 🎯 (2026-12-01) — Frontend
  *Invoices from the first form to the PDF*
  - ✅ **P1.1** Form (M 5T ×2) 100% {prio:1, seq:2, done:2026-02-10, done-start:2026-02-03, done-end:2026-02-10, conf:committed} [AN] — Frontend
    *Requires: P1.2*
  - 🟡 **P1.2** PDF export (L 8T) 40% {plan-start:2026-03-02, plan-end:2026-03-13, due:2026-03-20, team-lock:true, fixed:3.2, ord:4, cv.jira:INV-1, cv.area:Billing} [BO, AN] — Backend ≡ !decide:2026-02-27 📌2026-03-02
    *Requires: P1.1, ~P1.3 (Review)*
    *Phases: ✅RE, 🟡Development(Frontend), ○Test(Backend)*
    *Handoff: → AN, BO (Frontend); → BO*
    a free note line
    *an italic note*
  - **P1.3** Review {parallel:true, dropped:true, deadline:false, critical} [BO]
  - **P1.4** Legacy marker ⚑
- **P2** Kundenbereich 🔥
  Description for a root
  - Login (S 2T) {high} — Backend
    - Reset mail {medium, ord:1}
- 🏁 Release (2026-12-15)
* Star bullet — Ops

## Task Templates

### Standard
1. Analysis — Frontend
2. Build — Backend
3. Test — Frontend, Backend

## History

<!-- Auto-generated. -->

${block(
  'planr-history',
  'v1',
  '2026-02-10T09:00:00.000Z e1 kind=status status=done progress=100 completedAt=2026-02-10',
  '2026-02-11T09:00:00.000Z e2 kind=note',
  'bad line',
)}

## Roadmap

${block('planr-roadmap', 'v1', 'P1 route=2 color=0', 'P2 route=3 color=1')}

## Work order

${block('planr-queues', 'v2', '@AN | P1.1 P1.2', '#Backend | P1.2 P2.1', '@XX | P1.1 P1.2', '@BO | P1.2')}

## Changes

${block('planr-changes', 'v1', '{"from":"2026-03-02","patch":{"members":{"set":{"@Anna Noor":{"cap":0.5}}}}}')}

## Scenarios

${block(
  'planr-scenarios',
  'v1',
  '{"id":"s1","name":"Faster","note":"fewer days","createdAt":"2026-01-01","patch":{"tree":{"set":{"P1.2":{"best":4}}}}}',
)}

## Log

${block('planr-log', 'v1', '{"day":"2026-02-10","back":{"tree":{"set":{"P1.1":{"best":9}}}}}')}
`;

// The older queue spelling: ids as they were in memory, a team by vote.
const LEGACY_QUEUES = `# Kundenbereich

## Teams

| Name | Color |
|---|---|
| Frontend | \`#3b82f6\` |
| Backend | \`#10b981\` |

## Resources

- **Anna Noor** — Frontend, Lead (100%), 40h/w, 25d/y

## Work Tree

- **A** Root — Frontend
  - **A.1** One — Frontend
  - **A.2** Two — Frontend
  - **A.3** Three — Backend

## Work order

${block('planr-queues', 'v1', 'team:T1 A.1 A.2 A.3', 'team:T2 A.3 A.1', 'm1 A.1 A.2', 'v1')}

## Something else

- ignored heading, its bullets still land in the tree
`;

const write = p => buildMarkdownText({ tree: p.tree, members: p.members, teams: p.teams, vacations: p.vacations, data: p, meta: p.meta });

describe('markdownParse: shape of the parsed result', () => {
  beforeAll(() => {
    // Ids carry Date.now() and Math.random(); the demo plan is relative to today.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
  });
  beforeEach(() => {
    let n = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => ((++n * 7919) % 10007) / 10007);
  });
  afterAll(() => vi.useRealTimers());

  test('a hand-written plan with every block type', () => {
    expectShape('markdownParseShape.hand', parseMdToProject(HAND_WRITTEN));
  });

  test('the same plan, written back by the serializer and read again', () => {
    expectShape('markdownParseShape.roundtrip', parseMdToProject(write(parseMdToProject(HAND_WRITTEN))));
  });

  test('older work-order lines and an unknown heading', () => {
    expectShape('markdownParseShape.legacy', parseMdToProject(LEGACY_QUEUES));
  });

  test('the demo project, serialised and parsed', async () => {
    const { buildDemoProject } = await import('../demoProject.js');
    expectShape('markdownParseShape.demo', parseMdToProject(write(buildDemoProject())));
  });
});
