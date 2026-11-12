# Zeno's learning ledger (0022) — what it is, and what it deliberately is not

Zeno learns in a business: it keeps a small record of mistakes it has made
(graded 1–5 by what they cost) and working habits it has observed, and injects
the active ones into the system prompt of every later turn.

```
validator refuses a draft ──┐
model notices an owner habit ├─→ zeno_lessons (active)  ──→ prompt on every turn
owner repeats a request  ─────┘   (a single mention stays dormant)
```

**The record is deliberately invisible.** There is no "AI Learning" screen, no
count of what was learned, and no Accept button. Adaptation is meant to be felt
in the answers, not administered. The Settings → AI panel says only that Zeno
gets to know how the business works; nothing else about the mechanism is surfaced.

Table: `zeno_lessons` (migration `0022_zeno_lessons`). Code:
`backend/ai/lessons.py`. Endpoints: `GET/POST /ai/lessons`,
`PATCH /ai/lessons/{id}`.

## The two kinds

| kind | created by | status | reaches the prompt |
|---|---|---|---|
| `mistake` | the owner (graded), or the validator refusing a proposal (`source="detected"`) | `active` immediately | yes |
| `preference` | the model noticing a durable habit in what the owner wrote (`source="observed"`), or the owner asking for the same thing twice | `candidate` on the first mention, `active` when the same fingerprint is seen twice | only once active |

`fingerprint` is unique per business, so saying the same thing twice increments
`repeat_count` rather than adding a row. The ledger has to stay small enough to
fit in a prompt — 8 active lessons maximum, worst first, with at most 4 of them
preferences so a busy mistake ledger can never silence the personalisation.

## Why severity is graded by money, not by a thumbs-down

This is the part another app cannot copy by adding a "remember this" button: a
mistake in a business has a *measurable* cost, and Co-op owns the ledger that
measures it. A lesson can therefore carry:

- `severity` 1–5, with words attached (`cosmetic` … `wrong money or stock`) so
  the UI never shows a bare number;
- `cost_amount` + `cost_basis` (`measured` vs `estimated`) — what it cost;
- `blast_radius` — how many rows or customers it touched;
- `evidence_ref` — the order/action it came from.

A repeated mistake keeps the **worst** grading ever seen. Breaking a rule twice
is not less serious than breaking it once.

### The zero-effort half: refused proposals

`validate_actions` checks every proposal against the **live** row — stock,
selling price, ambiguous customer. When it refuses, the reason is ground truth
the model cannot fake, so `record_rejection` stores it as a lesson *before*
the answer is returned. Next turn the model already knows. Grading is derived
from what executing it would have cost:

| refusal | severity | why |
|---|---|---|
| ambiguous customer | 4 | a real order on the wrong party |
| insufficient stock / no price / unknown customer | 3 | would have produced a wrong order |
| capability outside the registry | 2 | attempted something it may not do |

## The safety rule (the reason this is not a back door)

Co-op's contract is that Zeno never executes anything and never writes data.
Learning must not become an exception:

- A lesson is **text in a prompt**. It cannot call a route, mutate a row, or
  change a calculation. The deterministic engine still decides every number.
- **Two mentions, never one.** With no review screen, the gate is repetition:
  a single observation is stored dormant and is ignored by the prompt; only a
  second, independent mention with the same fingerprint activates it. A stray
  sentence — or a line inside business data — cannot become a standing rule.
- **Model-authored text passes a sanitiser.** `sanitize_preference` refuses
  URLs, markup, fenced blocks, "ignore/instructions/system" phrasing and
  anything over 160 characters before it can be stored. A dropped habit costs a
  little polish; a stored instruction costs the trust contract.
- **Dismissal is permanent.** A later repeat still increments `repeat_count`
  (so the owner sees the pattern) but does not resurrect the lesson.
- **Tenant-scoped end to end**, including the API: another business's lesson is
  a 404, not a 403.
- "Never repeat this" outranks style, and outranks general best practice — the
  prompt says so explicitly, because the point of remembering a mistake is that
  the next answer is different.

## What it is not

- **Not fine-tuning.** Nothing is trained. Lessons are prompt context, so they
  are inspectable, editable and deletable at any time.
- **Not cross-tenant learning.** Business A's lessons never reach business B.
  Aggregating them would be a privacy decision, not a bug fix — and a business
  owner would reasonably expect their pricing corrections to stay private.
- **Not self-grading in the general case.** The model is not asked "were you
  wrong, 1–5?"; that rewards confident self-assessment. Severity comes from a
  deterministic refusal reason or from the owner. Where neither exists, no
  lesson is recorded.
- **Not a UI surface, by design.** The endpoints exist for support and tests
  only. There is no screen to review, grade, accept or browse lessons: an owner
  who could watch the mechanism would experience it as training work rather
  than as a product that knows them.

## Verification

`backend/tests/test_zeno_lessons.py` — 19 tests: severity bounds (a 7 is a 422,
never a clamp), one row per repeated mistake with the worst severity kept,
preferences dormant on arrival and active after the second mention, dismissal
not resurrected, the sanitiser refusing instruction-shaped text, preferences
keeping their own share of the prompt budget, tenant isolation on read and
write, the refusal loop, a full chat turn teaching a habit without the mechanism
appearing in the response, and the rendered prompt containing the lesson.
Full suite: **439 passed, 6 skipped**.
