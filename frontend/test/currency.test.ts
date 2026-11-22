/**
 * Naira everywhere — priced in, formatted in, and not creeping back.
 *
 * Two separate mistakes were found by grepping for `$` and `USD`:
 *
 *  1. two offline analytics modules hard-coded `$` while the dashboard next to
 *     them printed ₦ for the same number;
 *  2. the billing catalog was still priced in dollars ($29 / $99) after the
 *     edition became Naira-only — the product would have tried to charge a
 *     currency its own ledger refuses (Business.currency is constrained to NGN).
 *
 * This file pins the fix and, in `no module hand-rolls a dollar amount`, fails
 * if a new `$`-formatted amount appears anywhere in the source.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  currencySymbol,
  formatMoney,
  formatMoneyCompact,
  getCurrency,
} from '../src/services/currency';
import { PLAN_CATALOG, displayPrice } from '../src/billing/plans';

const NAIRA = '\u20a6';

test('the default currency is Naira', () => {
  assert.strictEqual(getCurrency(), 'NGN');
  assert.strictEqual(currencySymbol(), NAIRA);
});

test('money formats with the Naira sign, not a dollar sign', () => {
  assert.strictEqual(formatMoney(1234), `${NAIRA}1,234.00`);
  assert.ok(!formatMoney(1234).includes('$'));
});

test('compact money mirrors backend/money.py::fmt_compact', () => {
  // Whole naira stay whole; kobo appear only when they exist.
  assert.strictEqual(formatMoneyCompact(1234), `${NAIRA}1,234`);
  assert.strictEqual(formatMoneyCompact(1234.5), `${NAIRA}1,234.50`);
  assert.strictEqual(formatMoneyCompact(0), `${NAIRA}0`);
  assert.strictEqual(formatMoneyCompact(-1500), `-${NAIRA}1,500`);
});

test('every paid plan is a Naira amount; free is zero and Enterprise is a quote', () => {
  for (const plan of PLAN_CATALOG) {
    if (plan.id === 'enterprise') {
      assert.strictEqual(plan.priceMonthly, null, 'Enterprise is Contact Sales');
    } else if (plan.id === 'free') {
      assert.strictEqual(plan.priceMonthly, 0);
    } else {
      assert.ok(
        typeof plan.priceMonthly === 'number' && plan.priceMonthly >= 10_000,
        `${plan.id} should be a Naira amount, got ${plan.priceMonthly}`,
      );
    }
  }
});

test('the card shows Naira and states the yearly total when billing annually', () => {
  const starter = PLAN_CATALOG.find((p) => p.id === 'starter');
  assert.ok(starter);

  const monthly = displayPrice(starter, false);
  assert.strictEqual(monthly.amount, `${NAIRA}25,000`);
  assert.ok(!monthly.amount.includes('$'));

  const annual = displayPrice(starter, true);
  assert.strictEqual(annual.amount, `${NAIRA}20,000`); // 20% off
  // The number that leaves the account, not just the percentage saved.
  assert.match(annual.note, /Billed annually/);
  assert.ok(annual.note.includes(`${NAIRA}240,000`), annual.note);
});

test('the yearly total is the monthly price less the discount, in Naira', () => {
  for (const plan of PLAN_CATALOG) {
    if (!plan.priceMonthly || plan.annualDiscountPct === 0) continue;
    const yearly = Math.round(plan.priceMonthly * 12 * (1 - plan.annualDiscountPct / 100));
    assert.ok(
      displayPrice(plan, true).note.includes(yearly.toLocaleString('en-NG')),
      `${plan.id}: ${displayPrice(plan, true).note}`,
    );
  }
});

test('no module hand-rolls a dollar amount', () => {
  // The rule: money strings come from services/currency. `${...}` placeholders
  // and JS identifiers are fine; a `$` glued to a digit inside a string is a
  // dollar-formatted amount, which is what this test exists to stop coming back.
  const root = join(process.cwd(), 'src');
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;

      readFileSync(full, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const code = line.trim();
          // Comments explain the history and are allowed to quote the old shape.
          if (/^(\*|\/\/|\/\*)/.test(code)) return;
          if (/\$[0-9]/.test(code) && !code.includes('${')) {
            offenders.push(`${full.replace(root, 'src')}:${index + 1}  ${code}`);
          }
        });
    }
  };

  walk(root);
  assert.deepStrictEqual(offenders, [], `dollar-formatted amounts:\n${offenders.join('\n')}`);
});
