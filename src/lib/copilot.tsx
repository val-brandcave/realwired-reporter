import type { ReactNode } from 'react';
import { ChatFigure } from '@realwired/ui';

import { EMPTY_BINDING, type ReportBinding } from './binding';
import {
  DATE_RANGES,
  DEFAULT_RANGE,
  type DateBasis,
  type DateRange,
} from './context';
import { lookupReport } from './library';
import type { Report } from './reports';

/* ============================================================================
   The copilot's scripted answers.

   ⭐ Step 7. The whole point of this screen, and the reason it is cheap to
   build at all: **the copilot answers with a SPEC, not with a picture.**

   An answer is a `Report` — `{ type, binding, options }`, the same molecule
   the builder writes and a dashboard stores. So the three offers under an
   answer are not mock-ups: `Save to library` writes the same object the
   builder saves, `Add to a dashboard` places the same tile, and `Edit in
   builder` opens the same screen. The chat is a fourth way to author a widget,
   not a fourth way to draw one.

   That is also the seam a real MCP server would arrive through. Today
   `route()` is deterministic keyword scoring over five written answers;
   swapping it for a model changes this file and nothing else, because
   everything downstream already speaks specs.

   ## ⚠️ Every figure in the prose is MEASURED

   Re-measured on 11 Sept, **counting the way the app counts** —
   `applyPeriod(ORDERS, range, 'completedAt')`, every row with a completion
   date in the period. An early pass measured `status === 'Complete'` instead
   and every August figure came out eight orders light: the prose said 615
   where the widget beside it said 623. Measure through the path the screen
   uses, not one that sounds equivalent. The
   artboard's own numbers are illustrative and none of them are ours — Val,
   11 Sept: the canvas is for patterns and layout, not data or wording.

   **If the generator changes, these sentences become lies.** They are prose,
   so nothing will fail: re-run the probe and fix them by hand. That is the
   cost of a written answer, and it is why there are five rather than fifty.

   ## ⚠️ The date basis, which the builder got wrong first

   Each answer names its own period, and the rows are filtered on the date its
   binding GROUPS BY — `bindingDateBasis`, in `ChatPage`. Filtering completion
   while grouping submission spreads the rows over a wider window and invents a
   movement at the edges. This is the fourth surface to resolve a binding and
   the builder failed exactly this check on its first attempt. TRAPS §3.
   ========================================================================== */

const b = (patch: Partial<ReportBinding>): ReportBinding => ({
  ...EMPTY_BINDING,
  ...patch,
});

const range = (id: string): DateRange => DATE_RANGES.find((r) => r.id === id) ?? DEFAULT_RANGE;

/** August 2026 — a closed month, and the one the flagship question asks about. */
const AUGUST = range('last-month');
const YEAR = range('last-12-months');

export interface CopilotAnswer {
  /** The words. Figures inside it use `ChatFigure`, never colour. */
  prose: ReactNode;
  /**
   * The widget the answer resolves to — a real spec, rendered by the same
   * registry the dashboards use.
   */
  report: Report;
  /**
   * The period the ANSWER is about, which is not the dashboard's period.
   *
   * A question names its own scope — "in August" — and an answer that
   * silently used whatever a board was filtered to would answer a different
   * question from the one asked. The widget's own footer states it.
   */
  range: DateRange;
  /**
   * Which date the period tests, when the binding cannot say.
   *
   * ⚠️ `bindingDateBasis` derives the basis from the binding and that rule
   * stands — a binding that GROUPS BY a date must filter on that date, or the
   * chart spreads its rows over the wrong window (TRAPS §3). But a binding
   * grouped by CATEGORY has no date to derive from and falls back to
   * `'either'`, which counts an order by its completion where it has one and
   * its submission otherwise.
   *
   * MEASURED, and it is why this field exists: the August fee answer says
   * "615 completed orders" in its prose while its widget's coverage line read
   * **692 of 692** — `'either'` was admitting orders submitted in August that
   * have not completed. Two different true numbers, one paragraph apart, in a
   * product whose whole pitch is that every figure states what it counted.
   *
   * So an answer whose words count completions says so. Left unset, the
   * binding decides, which is the right default everywhere else.
   */
  basis?: DateBasis;
  /** What the answer cannot see. Rendered as a `Callout`. */
  caveat?: ReactNode;
  followups: string[];
}

export interface CopilotThread {
  id: string;
  /** The rail's label. */
  title: string;
  meta: string;
  group: string;
  /** The question as the user asked it. */
  prompt: string;
  /** What pulls a typed question to this answer. Lowercase. */
  keywords: string[];
  answer: CopilotAnswer;
}

/**
 * A report the copilot authored, rather than one it found.
 *
 * `origin: 'ai'` is load-bearing: it earns the chip that stops a generated
 * widget being mistaken for a curated one, everywhere it later appears.
 */
const generated = (
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
  origin: 'ai',
  tags: ['chat'],
  ...extra,
});

/** A starter report, reused whole. The copilot does not rebuild what exists. */
const fromLibrary = (id: string): Report => {
  const found = lookupReport(id);
  if (!found) throw new Error(`copilot: no report "${id}" in the starter library`);
  /* A copy, marked as the copilot's answer — the library's own card must not
     acquire an `ai` chip because the chat happened to cite it. */
  return { ...found, id: `${id}-chat`, origin: 'ai' };
};

export const THREADS: CopilotThread[] = [
  /* ------------------------------------------------------------------ 1 --
     The flagship. Two true statements that look contradictory, and a mix
     shift underneath — which is exactly the reading a monthly figure hides. */
  {
    id: 'fees-august',
    title: 'Why did fees fall in August?',
    meta: 'Today',
    group: 'Recent',
    prompt: 'Orders went up in August but my fees went down. Why?',
    keywords: ['fee', 'fees', 'fell', 'fall', 'down', 'august', 'revenue', 'why', 'mix'],
    answer: {
      prose: (
        <>
          <p>
            Both are true, and it is the mix. Completed orders rose{' '}
            <ChatFigure>6.1%</ChatFigure> — <ChatFigure>587</ChatFigure> to{' '}
            <ChatFigure>623</ChatFigure> — while client fees fell <ChatFigure>7.7%</ChatFigure>,
            from <ChatFigure>$812.1K</ChatFigure> to <ChatFigure>$749.9K</ChatFigure>.
          </p>
          <p className="mt-3">
            Commercial appraisal is the reason. It is <ChatFigure>10.3%</ChatFigure> of your
            completed orders and <ChatFigure>45.9%</ChatFigure> of your client fees, and it fell
            from <ChatFigure>70</ChatFigure> orders to <ChatFigure>46</ChatFigure> — taking{' '}
            <ChatFigure>$126.9K</ChatFigure> of fee with it. The growth landed in the cheaper
            categories: evaluation, inspection and environmental all rose by a fifth or more,
            and they earn a fraction per order. Your average fee per completed order went{' '}
            <ChatFigure>$1,383</ChatFigure> to <ChatFigure>$1,204</ChatFigure>.
          </p>
        </>
      ),
      report: generated(
        'chat-fee-by-category-aug',
        'Client fee by request category',
        'Total client fee by request category, for orders completed in August 2026.',
        'hbar',
        b({
          x: 'requestCategory',
          y: [{ key: 'clientFee', agg: 'sum' }],
          sort: 'measure-desc',
        }),
      ),
      basis: 'completedAt',
      range: AUGUST,
      caveat: (
        <>
          <ChatFigure>18</ChatFigure> orders completed in August have no request category, so
          they are in no bar above — they are shown as <strong>Unassigned</strong> rather than
          dropped, carrying <ChatFigure>$33.5K</ChatFigure> of client fee. Classifying them
          would move these numbers.
        </>
      ),
      followups: [
        'Is commercial appraisal falling, or was August one bad month?',
        'Who owns the unclassified orders?',
        'Which categories are missing their SLA?',
      ],
    },
  },

  /* ------------------------------------------------------------------ 2 --
     The answer that corrects the reading the previous one invites. */
  {
    id: 'commercial-trend',
    title: 'Is commercial appraisal falling?',
    meta: 'Today',
    group: 'Recent',
    prompt: 'Is commercial appraisal falling, or was August one bad month?',
    keywords: ['commercial', 'trend', 'trending', 'falling', 'declining', 'over time', 'year'],
    answer: {
      prose: (
        <>
          <p>
            One bad month, on a rising year. Commercial appraisal completions over the last
            twelve months run <ChatFigure>58</ChatFigure> down to a low of{' '}
            <ChatFigure>29</ChatFigure> in February, then up to <ChatFigure>70</ChatFigure> in
            July before August&rsquo;s <ChatFigure>46</ChatFigure>.
          </p>
          <p className="mt-3">
            Split the year in half and the second six months carry <ChatFigure>355</ChatFigure>{' '}
            completions against <ChatFigure>266</ChatFigure> in the first —{' '}
            <ChatFigure>33%</ChatFigure> more. August is below the recent run rate, not below
            the trend. One month is not a direction, and this chart is the reason to wait for
            September before calling it one.
          </p>
        </>
      ),
      report: generated(
        'chat-commercial-trend',
        'Commercial appraisal completions',
        'Orders completed per month where the request category is commercial appraisal.',
        'line',
        b({
          x: 'completedAt',
          y: [{ key: 'orders', agg: 'count' }],
          filters: { requestCategory: ['Commercial appraisal'] },
        }),
      ),
      basis: 'completedAt',
      range: YEAR,
      caveat: (
        <>
          The first and last bands of any trend cover part of a month, so they sit below a full
          one. This range starts and ends on month boundaries, so nothing here is clipped — but
          the same chart over an arbitrary window would be.
        </>
      ),
      followups: [
        'Which banks sent fewer commercial orders?',
        'Which categories are missing their SLA?',
      ],
    },
  },

  /* ------------------------------------------------------------------ 3 --
     Reuses a starter report whole, which is the point being made. */
  {
    id: 'sla',
    title: 'Which categories miss their SLA?',
    meta: 'Yesterday',
    group: 'Recent',
    prompt: 'Which categories are missing their SLA?',
    keywords: ['sla', 'turnaround', 'late', 'slow', 'target', 'missing', 'breach', 'days'],
    answer: {
      prose: (
        <>
          <p>
            Two of six, in August. <strong>Environmental</strong> averaged{' '}
            <ChatFigure>29.3</ChatFigure> days against a <ChatFigure>21</ChatFigure>-day target,
            and <strong>commercial appraisal</strong> <ChatFigure>24.8</ChatFigure> against{' '}
            <ChatFigure>22</ChatFigure>. The other four are inside target.
          </p>
          <p className="mt-3">
            Commercial is the one that has been moving: <ChatFigure>20.4</ChatFigure> days in
            May, <ChatFigure>21.5</ChatFigure> in June, <ChatFigure>23.6</ChatFigure> in July,{' '}
            <ChatFigure>24.8</ChatFigure> in August. It crossed the target in July and has not
            come back — and it is the category carrying <ChatFigure>45.9%</ChatFigure> of your
            fees.
          </p>
        </>
      ),
      report: fromLibrary('r-turnaround-sla'),
      basis: 'completedAt',
      range: AUGUST,
      followups: ['Why did fees fall in August?', 'Who are my largest clients by fee?'],
    },
  },

  /* ------------------------------------------------------------------ 4 --
     The classification gap, asked as a question about ownership. */
  {
    id: 'unclassified',
    title: 'Who owns the unclassified orders?',
    meta: '9 September',
    group: 'Earlier',
    prompt: 'Who owns the unclassified orders?',
    keywords: [
      'unclassified',
      'unassigned',
      'no category',
      'missing category',
      'classify',
      'owns',
    ],
    answer: {
      prose: (
        <>
          <p>
            Nobody in particular, which is the finding. Over the last twelve months{' '}
            <ChatFigure>213</ChatFigure> completed orders — <ChatFigure>3.5%</ChatFigure>,
            carrying <ChatFigure>$274.7K</ChatFigure> of client fee — have no request category,
            and they are spread across <ChatFigure>63</ChatFigure> of your{' '}
            <ChatFigure>85</ChatFigure>
            organizations.
          </p>
          <p className="mt-3">
            The three largest account for only <ChatFigure>20%</ChatFigure> of them, so this is
            not one client filing badly — it is a gap in how orders are captured. Chasing the
            top of this chart fixes a fifth of it.
          </p>
        </>
      ),
      report: generated(
        'chat-unclassified-by-org',
        'Unclassified orders by organization',
        'Completed orders with no request category, counted by organization, over the last 12 months.',
        'hbar',
        b({
          x: 'org',
          y: [{ key: 'orders', agg: 'count' }],
          filters: { requestCategory: ['Unassigned'] },
          sort: 'measure-desc',
          limit: 10,
        }),
        { noun: 'unclassified orders' },
      ),
      basis: 'completedAt',
      range: YEAR,
      caveat: (
        <>
          Ten of <ChatFigure>63</ChatFigure> organizations are shown. The rest have one or two
          each, which is the shape of the problem rather than a rounding of it.
        </>
      ),
      followups: ['Why did fees fall in August?', 'Who are my largest clients by fee?'],
    },
  },

  /* ------------------------------------------------------------------ 5 --
     Concentration — a question every book owner asks eventually. */
  {
    id: 'largest-clients',
    title: 'Largest clients by fee',
    meta: '4 September',
    group: 'Earlier',
    prompt: 'Who are my largest clients by fee?',
    keywords: [
      'largest',
      'biggest',
      'top',
      'clients',
      'organizations',
      'concentration',
      'banks',
    ],
    answer: {
      prose: (
        <>
          <p>
            <strong>Northgate Bank</strong> at <ChatFigure>$843.7K</ChatFigure> over the last
            twelve months, then Meridian Bank at <ChatFigure>$478.1K</ChatFigure> and
            Cornerstone Bank &amp; Trust at <ChatFigure>$409.6K</ChatFigure>.
          </p>
          <p className="mt-3">
            The concentration is the part worth knowing: your top five organizations are{' '}
            <ChatFigure>29.1%</ChatFigure> of <ChatFigure>$7.81M</ChatFigure> in client fees,
            and the top ten are <ChatFigure>40.8%</ChatFigure> — out of{' '}
            <ChatFigure>85</ChatFigure>. Losing Northgate would cost more than the bottom fifty
            combined.
          </p>
        </>
      ),
      report: fromLibrary('r-top-orgs'),
      basis: 'completedAt',
      range: YEAR,
      followups: [
        'Who owns the unclassified orders?',
        'Is commercial appraisal falling, or was August one bad month?',
      ],
    },
  },
];

/** The questions a new conversation offers. The first is the demo's opener. */
export const OPENING_QUESTIONS = [THREADS[0].prompt, THREADS[2].prompt, THREADS[4].prompt];

/**
 * Pick the answer a typed question is asking for.
 *
 * ⭐ Deterministic keyword overlap, NOT a model, and it is honest about that:
 * the surface says the answers are scripted. What is real is the seam — a
 * question goes in and a widget spec comes out, so replacing this function
 * with an MCP call changes nothing downstream.
 *
 * Scoring is longest-keyword-first so a specific phrase ("no category") beats
 * an incidental word ("category") that half the answers mention.
 */
export function route(question: string): CopilotThread {
  const q = question.toLowerCase();

  let best = THREADS[0];
  let bestScore = 0;

  for (const thread of THREADS) {
    let score = 0;
    for (const kw of thread.keywords) if (q.includes(kw)) score += kw.length;
    /* An exact match on the written prompt always wins — the rail and the
       suggestion chips send those verbatim, and a chip that answered
       something adjacent would be the one bug nobody forgives in a demo. */
    if (q.trim() === thread.prompt.toLowerCase()) score += 1000;
    if (score > bestScore) {
      bestScore = score;
      best = thread;
    }
  }

  return best;
}
