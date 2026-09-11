import type { ReactNode } from 'react';
import { ChatFigure, formatValue, type IconName } from '@realwired/ui';

import { ORDERS, ORGANIZATIONS, DEMO_TODAY, type Organization } from '../data/orders';
import { EMPTY_BINDING, type ReportBinding } from './binding';
import { applyPeriod, type DateBasis, type DateRange } from './context';
import { CATEGORY_SLA, type OrderRow } from './fields';
import { lookupReport } from './library';
import type { Report } from './reports';

/* ============================================================================
   Insights — step 8. What changed, what you can trust, what to look at.

   ⭐ The whole of this file is DERIVATION. Not one figure below is typed in.

   That is the difference between this screen and the copilot, and it is
   deliberate. `lib/copilot.tsx` carries five WRITTEN answers whose figures were
   measured by hand — which is honest for five scripted answers and carries a
   standing cost its own header states: change the generator and the sentences
   become lies, silently, because prose does not typecheck. Insights cannot
   afford that, because it is filtered. Move the period to last quarter and a
   written sentence about August is simply wrong, on screen, with no error.

   So every finding is computed from the rows in scope, and the only written
   part is the wording around the figures. A period change re-derives the whole
   screen, including WHICH findings there are.

   ## ⚠️ Counted the way the app counts — TRAPS §2

   Every count here comes from rows the caller scoped with
   `applyPeriod(ORDERS, range, 'completedAt')` — every row with a completion
   date in the period, whatever its status. `status === 'Complete'` sounds like
   the definition of a completed order and is not the app's definition of one;
   measuring that way puts a sentence eight orders out of step with the
   coverage line rendered directly beneath it. Verified with
   `npx tsx scripts/insights-probe.mjs`, which goes through these same
   functions rather than reimplementing the filter.

   ## The bands, and why coverage is first

   The approved artboard puts `What you can trust` ahead of any chart, and that
   supersedes the ordering the plan originally proposed. The reasoning is the
   product's whole thesis: a reader who does not believe the numbers has no use
   for an interpretation of them. Coverage converts "the data is wrong" — an
   accusation nobody can act on — into "here is the 3% nobody has classified",
   which is a task with an owner.

   ## Every finding resolves to a REAL spec

   Same rule as the copilot, for the same reason: `report` is a `Report`, so
   `Pin to a dashboard` places the identical tile a board would, and the
   evidence under a sentence is not a picture of a chart, it is one. A finding
   with no spec is allowed — band 3's watch items are counts, not charts — but
   nothing on this screen draws a chart any other way.
   ========================================================================== */

const b = (patch: Partial<ReportBinding>): ReportBinding => ({ ...EMPTY_BINDING, ...patch });

/* ============================================================================
   Types
   ========================================================================== */

export interface Finding {
  id: string;
  /** Drives the glyph tile only — never the border or the words. */
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon: IconName;
  title: ReactNode;
  /** The finding, in a sentence or two. Figures use `ChatFigure`. */
  prose: ReactNode;
  /** The evidence. A real spec, rendered through the same engine as a tile. */
  report?: Report;
  /**
   * The period the EVIDENCE covers, when it is not the page's.
   *
   * A trend that justifies "the second month running" has to show more months
   * than the period contains. The widget's own footer states which period it
   * drew, so the two can never quietly disagree.
   */
  range?: DateRange;
  /** Overrides the basis the binding would derive. See `CopilotAnswer.basis`. */
  basis?: DateBasis;
  /** A question this finding hands to the copilot, verbatim. */
  ask?: string;
  /**
   * How much this matters, for ordering. Derived, never assigned by hand —
   * so the screen leads with the worst thing rather than with whichever
   * generator happens to be written first.
   */
  severity: number;
}

/**
 * A band-3 item: a count, what the count is a count OF, and why it matters.
 *
 * ⚠️ `caption` is a SENTENCE, and that is why these are not `StatCard`s.
 * StatCard's caption slot is for "vs. last month" — MEASURED, it is
 * `white-space: nowrap` with an ellipsis, so the first attempt put 836px of
 * sentence into a 270px box and destroyed all three. A truncated caption is not
 * a shorter caption, it is a missing one, which is the same doctrine as a
 * truncated widget title. These render as `InsightCard`s instead, which is the
 * part built for a finding that needs a *because*.
 */
export interface WatchItem {
  id: string;
  icon: IconName;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  value: string;
  label: string;
  caption: ReactNode;
}

export interface InsightsRead {
  /** How many completed orders the whole screen is about. */
  scope: { rows: number; orgs: number };
  coverage: Finding;
  changed: Finding[];
  watch: WatchItem[];
}

/* ============================================================================
   Small measured helpers
   ========================================================================== */

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);

const MONTH_NAME = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const sum = (rows: OrderRow[], f: (r: OrderRow) => number | undefined) =>
  rows.reduce((a, r) => a + (f(r) ?? 0), 0);

const mean = (values: number[]) =>
  values.length ? values.reduce((a, v) => a + v, 0) / values.length : null;

/**
 * A percentage, in a sentence.
 *
 * A share of a whole — a coverage figure, a mix share — so one decimal, which
 * is what distinguishes 2.9% from 3.4% in a number a reader may act on.
 */
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * A percentage that sits BESIDE a widget drawing the same number.
 *
 * ⚠️ Found by looking at the screen: the coverage sentence read `96.4%` an inch
 * above a dial reading `96%`. Both are the same measurement and neither is
 * wrong — `formatValue` drops the fraction past 10, which is right for a figure
 * the eye scans. Two renderings of one number in one card is the reader's
 * problem to reconcile, and reconciling it is not their job (TRAPS §3).
 *
 * So the prose asks the library how the widget will write it, rather than
 * choosing its own precision and hoping. The exact figure is still in the
 * sentence — as `559 of 580`, which is better than a third decimal place.
 */
const pctAsDrawn = (n: number) => formatValue(n * 100, 'pct');

/**
 * Money, written out in full.
 *
 * ⚠️ For a figure whose whole meaning is the difference between two close
 * values. `money()` compacts past a thousand, so the average fee per order came
 * out "$1.4K to $1.2K" — which rounds away the point of the sentence and
 * disagrees with the copilot's answer about the same months ($1,383 to $1,204).
 * Compact where the eye scans, exact where it stops: the same rule the
 * library's own formatter documents, applied on the reading side.
 */
const moneyExact = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Money, compact, matching the widgets' own `usd` formatting at scale. */
function money(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

/**
 * The period immediately before this one, of the same length.
 *
 * Same length rather than "the previous calendar month", because the period is
 * the reader's question and it is not always a month. Comparing a 31-day cycle
 * against a calendar month would put a different number of weekends in each
 * side, which is a movement the calendar invented.
 */
function priorPeriod(range: DateRange): DateRange {
  const from = utc(range.from);
  const to = utc(range.to);
  const length = to - from + DAY;
  return {
    id: `${range.id}-prior`,
    label: `the previous ${Math.round(length / DAY)} days`,
    from: iso(from - length),
    to: iso(from - DAY),
  };
}

/** The calendar month a date sits in, as a range. */
function monthOf(when: string, back = 0): DateRange {
  const d = new Date(utc(when));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - back;
  return {
    id: `m${back}`,
    label: `${MONTH_NAME[((m % 12) + 12) % 12]}`,
    from: iso(Date.UTC(y, m, 1)),
    to: iso(Date.UTC(y, m + 1, 0)),
  };
}

/**
 * A report the Insights screen authored.
 *
 * `origin: 'starter'` and not `'ai'`, deliberately. The `ai` chip exists so a
 * generated widget is never mistaken for a curated one — and these ARE curated:
 * the product wrote the binding, the same way it wrote the seventeen in the
 * starter library. Only the filter value varies with what the data says.
 */
const evidence = (
  id: string,
  title: string,
  hint: string,
  type: Report['type'],
  binding: ReportBinding,
  extra: Partial<Report> = {},
): Report => ({
  id,
  title,
  hint,
  type,
  binding,
  noun: 'completed orders',
  origin: 'starter',
  tags: ['insight'],
  ...extra,
});

/* ============================================================================
   Band 2 · What changed — three generators, the best two shown
   ========================================================================== */

/** How far back a streak is counted before it stops being news. */
const STREAK_CAP = 12;

/**
 * Categories whose average turnaround is over their promised SLA.
 *
 * ⭐ The most product-relevant finding the prototype can make: SLA performance
 * is what a bank reports on, and `Turnaround Time by Category` is the only
 * widget in the live product that compares an actual against a stated target.
 * Here it is read rather than drawn.
 *
 * ## ⚠️ The worst breach is not the most interesting one
 *
 * Found by looking at the screen. Ranked purely by how far over target it was,
 * this picked Environmental — 37% over, and over in every month the book holds.
 * Which is true, and it is not a CHANGE: it is a standing condition, printed
 * under a heading that says "what changed", pushing out the category that had
 * genuinely just crossed. A screen that leads with the same permanent fact
 * every month teaches the reader to stop reading it.
 *
 * So the ranking carries how much the breach MOVED against the previous period
 * as well as how big it is, and a streak that reaches the cap is reported as
 * the norm rather than as a number — "in every one of the last 12 months" says
 * something a reader can act on; "for 22 months running" reads as a typo.
 */
function slaFinding(rows: OrderRow[], range: DateRange, book: OrderRow[]): Finding | null {
  const before = applyPeriod(book, priorPeriod(range), 'completedAt');

  /*
   * The turnarounds actually measured for a category — the VALUES, not just
   * their mean.
   *
   * ⚠️ It returns the array because the sentence quotes a count beside the
   * average, and the two have to be the same population. Counting
   * `rows.filter(category)` instead read "29.3 days across **53** completed
   * orders" while the 29.3 was the mean of **52** — one order in the category
   * has no turnaround recorded, so it is in the count and not in the average.
   * A figure and its denominator disagreeing by one is small, and it is the
   * same defect as the copilot's 615-vs-623: a number described by a
   * population it was not drawn from.
   */
  const turnarounds = (source: OrderRow[], category: string) =>
    source
      .filter((r) => r.requestCategory === category)
      .map((r) => r.turnaroundDays)
      .filter((v): v is number => typeof v === 'number');

  const turnaround = (source: OrderRow[], category: string) =>
    mean(turnarounds(source, category));

  const breaches = Object.keys(CATEGORY_SLA)
    .map((category) => {
      const sla = CATEGORY_SLA[category];
      const avg = turnaround(rows, category);
      if (avg === null) return null;
      const was = turnaround(before, category);
      return {
        category,
        sla,
        avg,
        /* The orders the average was computed FROM — see `turnarounds`. */
        n: turnarounds(rows, category).length,
        over: avg / sla - 1,
        /* Days added since the previous period. Negative means recovering. */
        moved: was === null ? 0 : avg - was,
        /* Newly over: inside target last period, outside it now. */
        fresh: was !== null && was <= sla,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.over > 0);

  if (!breaches.length) return null;

  const score = (x: (typeof breaches)[number]) =>
    x.over * 100 + Math.max(0, x.moved) * 12 + (x.fresh ? 40 : 0);

  const ranked = [...breaches].sort((a, b) => score(b) - score(a));
  const worst = ranked[0];
  const measured = Object.keys(CATEGORY_SLA).length;

  /*
   * How long it has been over — counted back through whole months, because
   * "the third month running" is a claim about the trend rather than about the
   * period, and a reader will check it against the figures.
   */
  let streak = 0;
  for (let back = 0; back < STREAK_CAP; back++) {
    const avg = turnaround(
      applyPeriod(book, monthOf(range.to, back), 'completedAt'),
      worst.category,
    );
    if (avg === null || avg <= worst.sla) break;
    streak++;
  }

  const others = ranked.slice(1);

  return {
    id: 'sla',
    /* `danger` past a fifth over, `warning` below it. A threshold rather than
       a fixed tone so the glyph means something a reader can rely on. */
    tone: worst.over > 0.2 ? 'danger' : 'warning',
    icon: 'clock',
    title: worst.fresh
      ? `${worst.category} has just crossed its turnaround target`
      : `${worst.category} is past its turnaround target`,
    prose: (
      <>
        <p>
          Average turnaround reached <ChatFigure>{worst.avg.toFixed(1)} days</ChatFigure> against
          a <ChatFigure>{worst.sla}-day</ChatFigure> target across{' '}
          <ChatFigure>{worst.n}</ChatFigure> completed orders —{' '}
          <ChatFigure>{pct(worst.over)}</ChatFigure> over.{' '}
          {streak >= STREAK_CAP ? (
            <>
              It has been over in every one of the last{' '}
              <ChatFigure>{STREAK_CAP}</ChatFigure> months, so this is the norm rather than a
              movement — the target is the thing to question.
            </>
          ) : streak > 1 ? (
            <>
              It has been over for <ChatFigure>{streak}</ChatFigure> months running, and added{' '}
              <ChatFigure>{Math.abs(worst.moved).toFixed(1)} days</ChatFigure>{' '}
              {worst.moved >= 0 ? 'since' : 'against'} the previous period.
            </>
          ) : (
            <>It was inside target in the previous period.</>
          )}
        </p>
        <p className="mt-2">
          {others.length === 0
            ? `The other ${measured - 1} categories are inside target.`
            : others.length === 1
              ? `${others[0].category} is also over, at ${others[0].avg.toFixed(1)} days against ${others[0].sla}. The remaining ${measured - 2} are inside target.`
              : `${others.length} other categories are also over target; ${measured - ranked.length} ${measured - ranked.length === 1 ? 'is' : 'are'} inside it.`}
        </p>
      </>
    ),
    /*
     * ⭐ The library's own starter report, reused whole — not a per-category
     * trend built for this card, which is what shipped first and was wrong in
     * two ways at once. A binding filtered to one category made the widget's
     * coverage line read `432 of 6,052 (7.1%)`, which is TRUE (the other
     * categories are outside its filters) and reads as a broken figure on the
     * one screen whose subject is trust. And twelve monthly rows in a target
     * chart clipped to the first one inside the card.
     *
     * All six categories against their targets, over the page's own period, is
     * six rows, a coverage line of 100%, and the same tile a board would draw.
     */
    report: lookupReport('r-turnaround-sla'),
    basis: 'completedAt',
    ask: 'Which categories are missing their SLA?',
    severity: 100 + score(worst),
  };
}

/**
 * Volume and money moving in different directions.
 *
 * ⭐ The single most valuable thing this book can demonstrate, and the reading
 * a monthly figure hides: both statements are true and the mix underneath is
 * the explanation. A reader who sees only "revenue down" goes looking for a
 * lost client that does not exist.
 */
function mixFinding(rows: OrderRow[], range: DateRange, book: OrderRow[]): Finding | null {
  const prior = priorPeriod(range);
  const before = applyPeriod(book, prior, 'completedAt');
  if (!before.length || !rows.length) return null;

  const orders = rows.length / before.length - 1;
  const feeNow = sum(rows, (r) => r.clientFee);
  const feeThen = sum(before, (r) => r.clientFee);
  if (feeThen === 0) return null;
  const fee = feeNow / feeThen - 1;

  /* Only worth a card when the two disagree, or when the money moved hard
     enough that the volume figure alone would mislead. A period where both
     rose by the same amount is not a finding, it is a good month. */
  const diverges = Math.sign(orders) !== Math.sign(fee);
  if (!diverges && Math.abs(fee) < 0.1) return null;

  /* The category most responsible, by absolute change in fee. */
  const categories = [...new Set(book.map((r) => r.requestCategory).filter(Boolean))];
  const moved = categories
    .map((category) => {
      const now = rows.filter((r) => r.requestCategory === category);
      const then = before.filter((r) => r.requestCategory === category);
      const delta = sum(now, (r) => r.clientFee) - sum(then, (r) => r.clientFee);
      return {
        category,
        delta,
        nowCount: now.length,
        thenCount: then.length,
        shareOfOrders: now.length / rows.length,
        shareOfFee: sum(now, (r) => r.clientFee) / feeNow,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const driver = moved[0];
  const up = (n: number) => (n >= 0 ? 'rose' : 'fell');

  return {
    id: 'mix',
    tone: fee < 0 ? 'warning' : 'info',
    icon: fee < 0 ? 'arrow-down' : 'arrow-up',
    title:
      diverges && fee < 0
        ? 'Fees fell while volume rose'
        : diverges
          ? 'Volume fell while fees rose'
          : `Client fees ${up(fee)} sharply`,
    prose: (
      <>
        <p>
          Completed orders {up(orders)} <ChatFigure>{pct(Math.abs(orders))}</ChatFigure> against{' '}
          {prior.label}, from <ChatFigure>{before.length}</ChatFigure> to{' '}
          <ChatFigure>{rows.length}</ChatFigure>, while client fees {up(fee)}{' '}
          <ChatFigure>{pct(Math.abs(fee))}</ChatFigure> — {money(feeThen)} to {money(feeNow)}.
          {diverges && ' Both are true, and it is the mix.'}
        </p>
        <p className="mt-2">
          <strong className="font-semibold text-ink">{driver.category}</strong> moved the most:{' '}
          <ChatFigure>{driver.thenCount}</ChatFigure> orders to{' '}
          <ChatFigure>{driver.nowCount}</ChatFigure>, taking{' '}
          <ChatFigure>{money(Math.abs(driver.delta))}</ChatFigure> of fee{' '}
          {driver.delta < 0 ? 'out' : 'in'} with it. It is{' '}
          <ChatFigure>{pct(driver.shareOfOrders)}</ChatFigure> of orders and{' '}
          <ChatFigure>{pct(driver.shareOfFee)}</ChatFigure> of fees, so it moves the money far
          more than it moves the count. Average fee per completed order went{' '}
          <ChatFigure>{moneyExact(feeThen / before.length)}</ChatFigure> to{' '}
          <ChatFigure>{moneyExact(feeNow / rows.length)}</ChatFigure>.
        </p>
      </>
    ),
    report: evidence(
      'insight-fee-by-category',
      'Client fee by request category',
      'Total client fee by request category, for orders completed in the period.',
      'hbar',
      b({ x: 'requestCategory', y: [{ key: 'clientFee', agg: 'sum' }], sort: 'measure-desc' }),
    ),
    basis: 'completedAt',
    ask: 'Why did fees fall in August?',
    severity: 90 + Math.abs(fee) * 100 + (diverges ? 20 : 0),
  };
}

/**
 * How much of the book rests on a handful of names.
 *
 * The fallback finding, and it is not filler: it is computable in every period,
 * and it is the question every book owner asks eventually. It only earns a card
 * when the concentration is actually notable.
 */
function concentrationFinding(rows: OrderRow[]): Finding | null {
  const total = sum(rows, (r) => r.clientFee);
  if (total === 0) return null;

  const byOrg = [...new Set(rows.map((r) => r.org))]
    .map((org) => ({ org, fee: sum(rows.filter((r) => r.org === org), (r) => r.clientFee) }))
    .sort((a, b) => b.fee - a.fee);

  if (byOrg.length < 10) return null;

  const top5 = byOrg.slice(0, 5).reduce((a, o) => a + o.fee, 0) / total;
  const top10 = byOrg.slice(0, 10).reduce((a, o) => a + o.fee, 0) / total;
  const bottomHalf =
    byOrg.slice(Math.ceil(byOrg.length / 2)).reduce((a, o) => a + o.fee, 0) / total;

  if (top5 < 0.25) return null;

  return {
    id: 'concentration',
    tone: 'info',
    icon: 'org',
    title: 'Your fees rest on a handful of names',
    prose: (
      <>
        <p>
          <strong className="font-semibold text-ink">{byOrg[0].org}</strong> alone is{' '}
          <ChatFigure>{money(byOrg[0].fee)}</ChatFigure> of{' '}
          <ChatFigure>{money(total)}</ChatFigure> in client fees this period. The top five
          organizations are <ChatFigure>{pct(top5)}</ChatFigure> of it and the top ten are{' '}
          <ChatFigure>{pct(top10)}</ChatFigure>, out of <ChatFigure>{byOrg.length}</ChatFigure>{' '}
          that placed an order.
        </p>
        <p className="mt-2">
          The smaller half of the book is <ChatFigure>{pct(bottomHalf)}</ChatFigure> of fees
          between them — so losing {byOrg[0].org} would cost more than losing{' '}
          <ChatFigure>{Math.floor(byOrg.length / 2)}</ChatFigure> of the smallest accounts
          together.
        </p>
      </>
    ),
    /*
     * FIVE bars, and the number is the sentence's own.
     *
     * ⚠️ Two earlier versions were measured on screen and both were unreadable:
     * ten bars, then the starter library's `r-top-orgs` at eight. In a card
     * 436px wide the label gutter is about 120px, so a name like "Cornerstone
     * Bank & Trust" wraps to two lines — and at eight rows in a 296px chart
     * there are ~26px per row for a label that needs ~30. The names printed on
     * top of one another. A ranked chart whose ranks cannot be read is a
     * decoration.
     *
     * Five rows is ~40px each, which fits a wrapped name — and five is what the
     * paragraph above actually talks about, so the chart is the sentence rather
     * than a longer list the sentence happens to start with. A limit is not a
     * filter, so the coverage line still reads the whole period.
     */
    report: evidence(
      'insight-top-orgs',
      'Largest organizations by client fee',
      'The five organizations with the highest total client fee in the period.',
      'hbar',
      b({ x: 'org', y: [{ key: 'clientFee', agg: 'sum' }], sort: 'measure-desc', limit: 5 }),
      { options: { showValues: true } },
    ),
    basis: 'completedAt',
    ask: 'Who are my largest clients by fee?',
    severity: 40 + top5 * 50,
  };
}

/* ============================================================================
   Band 3 · What to look at
   ========================================================================== */

/**
 * Organizations whose volume fell in each of the last two whole months.
 *
 * ⚠️ MEASURED against the rule the caption states, not read off the
 * generator's own `declining` flag. Those are two different facts: the flag is
 * how the seed was built, the rule is what the sentence claims, and shipping
 * the first while printing the second is a caption describing behaviour the
 * code does not have. The generator marks twelve accounts; this rule finds six
 * of them in the period, and six is the true answer to the question asked.
 *
 * The floor of five orders in the base month is the honest part: a client that
 * went from two orders to one is down 50% and is down one order.
 */
function decliningOrgs(range: DateRange, book: OrderRow[], orgs: Organization[]): string[] {
  const months = [2, 1, 0].map((back) =>
    applyPeriod(book, monthOf(range.to, back), 'completedAt'),
  );
  const counts = (org: string) => months.map((m) => m.filter((r) => r.org === org).length);

  return orgs.map((o) => o.name).filter((org) => {
    const [first, second, third] = counts(org);
    if (first < 5) return false;
    return second < first * 0.95 && third < second * 0.95;
  });
}

/**
 * Two organization names where one is the other plus a word.
 *
 * A finding, not a data-entry accident: the live product's organization picker
 * is a flat alphabetical list, so two names that differ by a suffix sit
 * adjacent and pick wrong silently — and the wrong one returns an EMPTY
 * dashboard rather than an error, which reads as "the data is broken". Measured
 * from the book rather than counted by hand, so the number cannot go stale.
 */
function confusablePairs(orgs: Organization[]): [string, string][] {
  const names = orgs.map((o) => o.name).sort();
  const pairs: [string, string][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (names[j].startsWith(`${names[i]} `)) pairs.push([names[i], names[j]]);
    }
  }
  return pairs;
}

function watchItems(range: DateRange, book: OrderRow[], orgs: Organization[]): WatchItem[] {
  const items: WatchItem[] = [];

  const declining = decliningOrgs(range, book, orgs);
  if (declining.length) {
    items.push({
      id: 'declining',
      icon: 'arrow-down',
      tone: 'danger',
      value: String(declining.length),
      label: declining.length === 1 ? 'organization declining' : 'organizations declining',
      caption: (
        <>
          Completed volume down in each of the last two whole months, from a base of five orders
          or more. {declining.slice(0, 2).join(' and ')} are the largest.
        </>
      ),
    });
  }

  /* Contracts ending before the end of the calendar year the period sits in.
     A named boundary rather than "within 90 days", because a renewal
     conversation is scheduled against a date somebody can say out loud. */
  const yearEnd = `${new Date(utc(range.to)).getUTCFullYear()}-12-31`;
  const renewals = orgs.filter(
    (o) => o.contractEnd >= iso(DEMO_TODAY.getTime()) && o.contractEnd <= yearEnd,
  ).sort((a, b) => a.contractEnd.localeCompare(b.contractEnd));

  if (renewals.length) {
    /* Recent activity, because a renewal with no orders behind it is the one
       to call first — and if they all have orders, saying so is the useful
       fact rather than a sentence about a case that did not occur. */
    const since = iso(DEMO_TODAY.getTime() - 60 * DAY);
    const recent = renewals.map((o) => ({
      name: o.name,
      n: book.filter((r) => r.org === o.name && (r.completedAt ?? r.submittedAt) >= since).length,
    }));
    const quiet = recent.filter((r) => r.n === 0);
    const smallest = recent.reduce((a, r) => (r.n < a.n ? r : a));

    items.push({
      id: 'renewals',
      icon: 'calendar',
      tone: 'warning',
      value: String(renewals.length),
      label: renewals.length === 1 ? 'renewal due' : 'renewals due',
      caption: (
        <>
          Contracts ending before 31 December, the first on{' '}
          {new Date(utc(renewals[0].contractEnd)).getUTCDate()}{' '}
          {MONTH_NAME[new Date(utc(renewals[0].contractEnd)).getUTCMonth()]}.{' '}
          {quiet.length
            ? `${quiet.length} ${quiet.length === 1 ? 'has' : 'have'} sent no orders in 60 days.`
            : `All are still ordering; ${smallest.name} is the quietest at ${smallest.n} in 60 days.`}
        </>
      ),
    });
  }

  const pairs = confusablePairs(orgs);
  if (pairs.length) {
    items.push({
      id: 'confusable',
      icon: 'warn',
      tone: 'neutral',
      value: String(pairs.length),
      label: pairs.length === 1 ? 'near-identical name' : 'near-identical names',
      caption: (
        <>
          {pairs.map(([a]) => a).join(' and ')} each have a longer twin in the list. Picking the
          wrong one returns an empty board rather than an error.
        </>
      ),
    });
  }

  return items;
}

/* ============================================================================
   Band 1 · What you can trust
   ========================================================================== */

function coverageFinding(rows: OrderRow[]): Finding {
  const classified = rows.filter((r) => r.requestCategory).length;
  const missing = rows.length - classified;
  const share = rows.length ? classified / rows.length : 1;

  const unclassified = rows.filter((r) => !r.requestCategory);
  const fee = sum(unclassified, (r) => r.clientFee);
  const orgs = new Set(unclassified.map((r) => r.org));

  const byOrg = [...orgs]
    .map((org) => unclassified.filter((r) => r.org === org).length)
    .sort((a, b) => b - a);
  const top4 = byOrg.slice(0, 4).reduce((a, n) => a + n, 0);
  const concentrated = missing > 0 && top4 / missing >= 0.5;

  const report = lookupReport('r-classification-coverage');
  if (!report) throw new Error('insights: the classification coverage report is missing');

  if (missing === 0) {
    return {
      id: 'coverage',
      tone: 'success',
      icon: 'check',
      title: 'Every order in this period is classified',
      prose: (
        <p>
          All <ChatFigure>{rows.length}</ChatFigure> completed orders carry a request category, so
          nothing below is sitting outside a breakdown. Every figure on the dashboards covers the
          whole of this period.
        </p>
      ),
      report,
      basis: 'completedAt',
      severity: 0,
    };
  }

  return {
    id: 'coverage',
    /* The tone is about whether the gap undermines the numbers, not about
       whether a gap exists. Below 5% the figures stand and the gap is a task;
       past that the reader is right to hesitate, and the screen should agree
       with them rather than reassure. */
    tone: share >= 0.95 ? 'success' : 'warning',
    icon: share >= 0.95 ? 'check' : 'warn',
    title:
      share >= 0.95
        ? `Your numbers are sound. ${missing.toLocaleString()} ${missing === 1 ? 'order is' : 'orders are'} not in them.`
        : `${pct(1 - share)} of this period has no request category`,
    prose: (
      <>
        <p>
          <ChatFigure>
            {classified.toLocaleString()} of {rows.length.toLocaleString()}
          </ChatFigure>{' '}
          completed orders have a request category — <ChatFigure>{pctAsDrawn(share)}</ChatFigure> — so
          they are in every category breakdown, fee analysis and turnaround average across the
          dashboards. The other <ChatFigure>{missing.toLocaleString()}</ChatFigure> carry{' '}
          <ChatFigure>{money(fee)}</ChatFigure> of client fee and appear as{' '}
          <strong className="font-semibold text-ink">Unassigned</strong> rather than being
          dropped, so the money is never silently missing.
        </p>
        <p className="mt-2">
          {concentrated ? (
            <>
              <ChatFigure>{orgs.size}</ChatFigure> organizations are involved, and the four
              largest account for <ChatFigure>{top4}</ChatFigure> of them — which makes this four
              conversations rather than a process problem.
            </>
          ) : (
            <>
              They are spread across <ChatFigure>{orgs.size}</ChatFigure> organizations, and the
              four largest hold only <ChatFigure>{top4}</ChatFigure> between them. That is the
              shape of the finding: not one client filing badly, but a gap in how orders are
              captured.
            </>
          )}
        </p>
      </>
    ),
    report,
    basis: 'completedAt',
    ask: 'Who owns the unclassified orders?',
    severity: 0,
  };
}

/* ============================================================================
   The read
   ========================================================================== */

/**
 * Everything the Insights screen says, derived from the rows in scope.
 *
 * `rows` are the period's, already narrowed by the screen's value filters.
 * `narrow` is the SAME narrowing without the period, and it is not a
 * convenience — it is what keeps the screen internally consistent.
 *
 * ⚠️ Three of these findings reach outside the period: a prior-period
 * comparison, a twelve-month streak, and the declining-volume rule. Reading
 * `ORDERS` directly for those would answer them across the whole book while
 * the sentences above them describe a filtered one — so a screen narrowed to a
 * single organization would report "6 organizations declining" beside a
 * coverage line counting one. Two true numbers, one screen, contradicting each
 * other: the exact defect TRAPS §3 exists to prevent, arrived at from a new
 * direction. Everything below therefore reads `book`, never `ORDERS`.
 *
 * At most TWO findings are shown in band 2, by derived severity. Not a layout
 * constraint: a screen that lists everything it noticed is a dashboard with
 * sentences, which is what this screen exists instead of. The brief for this
 * screen is that it answers the two or three questions a reader is already
 * asking in their head — not eleven it noticed on their behalf.
 */
export function readInsights(
  rows: OrderRow[],
  range: DateRange,
  narrow: (rows: OrderRow[]) => OrderRow[],
): InsightsRead {
  /* The whole book under the screen's value filters, with no period applied. */
  const book = narrow(ORDERS);
  /* And the organizations that survive them, so band 3 counts the same set. */
  const inScope = new Set(book.map((r) => r.org));
  const orgs = ORGANIZATIONS.filter((o) => inScope.has(o.name));

  const changed = [
    slaFinding(rows, range, book),
    mixFinding(rows, range, book),
    concentrationFinding(rows),
  ]
    .filter((f): f is Finding => f !== null)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 2);

  return {
    scope: { rows: rows.length, orgs: new Set(rows.map((r) => r.org)).size },
    coverage: coverageFinding(rows),
    changed,
    watch: watchItems(range, book, orgs),
  };
}

/** What the screen calls the time of day. The demo runs at all hours. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
