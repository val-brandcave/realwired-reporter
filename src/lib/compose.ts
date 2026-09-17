import { DATE_RANGES, DEFAULT_RANGE, type DateRange } from './context';
import { ORDERS } from '../data/orders';
import { DIMENSIONS, dimensionValues, findDimension } from './fields';
import { getReports } from './library';
import type { Report } from './reports';

/* ============================================================================
   The composer — turning "build me a dashboard" into a set of widget specs.

   ⭐ The claim this file has to earn: a dashboard is a name, a scope and an
   arrangement of report references (`lib/dashboards.ts`), and a report is a
   bound widget spec (`lib/reports.ts`). Both already exist and both already
   work. So "the copilot builds you a dashboard" is not new plumbing — it is a
   function that picks specs, and this is it.

   ## Why this is deterministic, and why that is not a compromise

   `lib/copilot.tsx` routes a QUESTION to one of five written answers by
   keyword score, and says plainly on the surface that the answers are
   scripted. This is the other half: a REQUEST resolved against catalogues the
   app already maintains, with nothing written down in advance.

   There is no model here and no network. That is a demo decision as much as an
   architectural one — `realwired-reporter` is a public repo, so a key cannot
   live in it; a client call on a bank network cannot depend on an outbound
   request; and a flow that answers differently each run cannot be rehearsed,
   which `DEMO-SCRIPT.md` needs it to be.

   ⭐ But the seam is the same seam. `copilot.tsx` already says it:

     "swapping it for a model changes this file and nothing else, because
      everything downstream already speaks specs."

   Everything below produces `Candidate[]`. A model that produced `Candidate[]`
   would drop in here and the proposal card, the packer, the name dialog and
   the board would not change by a line.

   ## What it reads

   Nothing invented. Three catalogues that are already the app's own:

     · `DIMENSIONS` + `dimensionValues()` — the real org names, the real
       request categories, the real segments and statuses, off the real rows.
     · the `tags` on the 18 starter reports — `revenue`, `volume`,
       `operations`, `clients`, `reviews`, `data quality`, crossed with `kpi`,
       `trend`, `mix`, `sla`, `detail`, `distribution`.
     · `DATE_RANGES` — the closed periods the product ships.

   So the composer is reading a taxonomy somebody wrote on purpose, not
   guessing at report titles.
   ========================================================================== */

/* ============================================================================
   1 · Intent — is this a request to MAKE something?
   ========================================================================== */

/**
 * The nouns that mean "a board", and the verbs that mean "make me one".
 *
 * Both halves are required. ⚠️ "Which dashboard shows my fees?" names a
 * dashboard and asks a question; "build me a fee view" asks for one without
 * using the word. Requiring a noun AND a verb costs the second case and saves
 * the first, and getting it wrong in the first direction is much worse: a
 * question answered with a build proposal is a screen the reader did not ask
 * for, in the middle of a conversation they were having.
 */
const BOARD_NOUNS = ['dashboard', 'board', 'view', 'workspace', 'scorecard'];
const MAKE_VERBS = [
  'build',
  'make',
  'create',
  'set up',
  'setup',
  'start',
  'new',
  'put together',
  'i need',
  'i want',
  'give me',
  'can you',
];

export type Intent = 'compose' | 'answer';

/**
 * Whether a typed request is asking for a board or asking a question.
 *
 * Deliberately conservative: anything it is not sure about is a question, and
 * questions are what the copilot already does well.
 */
export function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  const noun = BOARD_NOUNS.some((n) => q.includes(n));
  const verb = MAKE_VERBS.some((v) => q.includes(v));
  return noun && verb ? 'compose' : 'answer';
}

/* ============================================================================
   2 · Parse — what the request is ABOUT
   ========================================================================== */

/**
 * The themes a request can be about.
 *
 * ⚠️ These are not new vocabulary. Every one is a tag already carried by at
 * least one of the 18 starter reports, which is what makes scoring against
 * them honest rather than a second taxonomy that has to be kept in step.
 */
const THEME_WORDS: Record<string, string[]> = {
  revenue: ['fee', 'fees', 'revenue', 'billing', 'billed', 'money', 'income', 'charge'],
  volume: ['volume', 'orders', 'activity', 'throughput', 'how many', 'count'],
  operations: ['turnaround', 'sla', 'speed', 'slow', 'late', 'time', 'days', 'operational'],
  clients: ['client', 'clients', 'customer', 'customers', 'organization', 'org', 'bank', 'account'],
  reviews: ['review', 'reviews', 'appraisal review', 'ai review'],
  'data quality': ['unclassified', 'unassigned', 'missing', 'coverage', 'classification', 'quality'],
};

/**
 * The general set, for a request that names no theme of its own.
 *
 * "A dashboard for Northgate" says who and not what, and the honest reading is
 * the three questions every board answers: how much work, what it earned, how
 * long it took.
 */
const DEFAULT_THEMES = ['volume', 'revenue', 'operations'];

export interface ParsedRequest {
  /** Dimension key → the values named in the request. Feeds `binding.filters`. */
  filters: Record<string, string[]>;
  /** The period the board should open on. Always a CLOSED one — see below. */
  range: DateRange;
  /** Tag themes to score reports against. */
  themes: string[];
  /**
   * Parts of the request that were understood but cannot be expressed.
   *
   * ⚠️ Surfaced to the reader rather than swallowed. A composer that quietly
   * drops half a sentence produces a board that is wrong in a way nobody can
   * see, which is this project's whole failure mode.
   */
  unmet: string[];
  /**
   * Things deliberately left off, and why.
   *
   * ⚠️ Distinct from `unmet`. `unmet` is "I could not"; this is "I chose not
   * to, and here is the reason". Both are said out loud for the same reason —
   * a board whose omissions are invisible is a board nobody can check.
   */
  notes: string[];
  /** The name to suggest, derived from what was actually matched. */
  suggestedName: string;
}

/**
 * Period words, mapped to the CLOSED ranges the product ships.
 *
 * ⚠️ Every one of these resolves to a closed period, and that is a product
 * rule rather than a convenience. Reporter offers seven ranges of which one is
 * closed; the other six end today, which is why the audited product reports an
 * 84.5% fall to anyone who opens it on the 4th of a month, and why it has twice
 * prompted an executive to ask whether the data is right. A composer that read
 * "this quarter" as a to-date window would build that defect into a board on
 * purpose.
 */
const PERIOD_WORDS: { words: string[]; id: string }[] = [
  { words: ['quarter', 'quarterly', 'qbr'], id: 'last-quarter' },
  { words: ['year', 'annual', 'yearly', '12 month', 'twelve month'], id: 'last-12-months' },
  { words: ['month', 'monthly'], id: 'last-month' },
];

/** A measure threshold — "over 5K", "above $10,000". */
const THRESHOLD = /\b(over|above|under|below|more than|less than|at least)\s+\$?[\d,.]+\s*[km]?\b/i;

/**
 * Words that describe the REPORT, not its subject — stripped before anything
 * is matched against the data.
 *
 * ⚠️ MEASURED defect, 17 Sept, found by driving the flow rather than by
 * reading it. "Build me a dashboard for Northgate's quarterly **review**" read
 * back as *"A board for Northgate Bank and Review"* — `review` had matched the
 * `requestCategory` value `Review`, so every widget on the board would have
 * been filtered to review orders only. It also pulled the `reviews` theme in,
 * which put `Average completion time` at the top of the list and pushed the
 * fee breakdown off it entirely.
 *
 * Nothing about that screen looked broken. It rendered, the checkboxes worked,
 * the figures would have been true — they would simply have been the answer to
 * a question nobody asked. That is the exact failure this project keeps
 * finding, and the only reason it was caught is that the flow was driven.
 *
 * ⭐ The general rule: a word naming the KIND of document is never a word
 * naming its subject. `review` is the one that collides today because
 * `requestCategory` has a value called `Review`; `evaluation` and `inspection`
 * are one product decision away from the same trap, so the strip is a list of
 * document words rather than a special case for `review`.
 *
 * Longest first — "quarterly review" must be removed before "review" is.
 */
const DOCUMENT_WORDS = [
  'quarterly business review',
  'quarterly review',
  'quarter review',
  'business review',
  'annual review',
  'yearly review',
  'monthly review',
  'weekly review',
  'qbr',
  'dashboard',
  'scorecard',
  'workspace',
  'board',
  'report',
  'view',
];

/**
 * The string values are matched against.
 *
 * ⚠️ Periods are read from the RAW question, before this runs — "quarterly"
 * only survives inside the phrases above, and the period has to be detected
 * from the word itself.
 */
function subjectOf(q: string): string {
  let s = q;
  for (const w of DOCUMENT_WORDS) s = s.split(w).join(' ');
  return normalise(s);
}

/**
 * One spelling for comparison — lowercase, `&` written out, spaces collapsed.
 *
 * ⭐ The ampersand is here because of DICTATION, and it is not a nicety.
 * Speech recognition transcribes "Cornerstone Bank *and* Trust"; the data
 * holds "Cornerstone Bank *&* Trust". Compared literally the full name never
 * matches, so a dictated request falls back to the first-word shorthand — and
 * where that shorthand is ambiguous (two clients beginning "Meridian") it
 * correctly matches nothing, so the reader silently gets a whole-book board
 * instead of the client they actually named.
 *
 * Normalising both sides is what makes SPEAKING a client's name work as well
 * as typing it, which is the entire point of offering a microphone.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

const rangeById = (id: string): DateRange => DATE_RANGES.find((r) => r.id === id) ?? DEFAULT_RANGE;

/**
 * Read a request against the catalogues.
 *
 * ⚠️ Values are matched by scanning the ACTUAL values in the data, not a
 * written list. `dimensionValues(dim, ORDERS)` is what the filter modal
 * offers, so anything the composer can match is something the reader could
 * have picked by hand — and if the seed changes, this changes with it rather
 * than going quietly stale. (TRAPS §2: re-measure after any change to the
 * generator. A hard-coded list of bank names is exactly that trap.)
 */
export function parse(question: string): ParsedRequest {
  const q = question.toLowerCase();
  /* ⚠️ The period is read from the RAW question — "quarterly" lives inside the
     document phrases that are about to be stripped. Everything that matches
     against the DATA reads `subject` instead. See `DOCUMENT_WORDS`. */
  const subject = subjectOf(q);

  /* ---- who and what: dimension values named outright ---- */
  const filters: Record<string, string[]> = {};
  const matchedLabels: string[] = [];

  /* `state` is excluded for the same reason no board offers it: 51 values, and
     no board's question is "which states". `org` is scanned first so a longer,
     more specific name wins over a category word inside it. */
  for (const dim of DIMENSIONS) {
    if (dim.key === 'state') continue;
    /* Dates are a period, not a filter value — see `Dashboard.filters`. */
    if (dim.key === 'submittedAt' || dim.key === 'completedAt') continue;

    const values = dimensionValues(dim, ORDERS).filter((v) => v !== 'Unassigned');

    /* Named in full. */
    let hits = values.filter((v) => subject.includes(normalise(v)));

    /*
     * A shortened organisation name — "Northgate" for "Northgate Bank".
     *
     * ⚠️ ONLY when the shorthand names exactly ONE organisation, and this
     * guard is a measured defect rather than caution. 17 Sept, driving the
     * flow: "a dashboard for Meridian Bank" read back as *"A board for
     * Meridian Bank AND Meridian Bank & Trust"* — `meridian` is the first word
     * of two different clients, so the board was silently scoped to both. Two
     * banks' figures added together under one bank's name is a worse error
     * than not matching at all, and on a client board it is the kind that gets
     * noticed in the room.
     *
     * So an ambiguous shorthand matches nothing and the reader sees the whole
     * book, which is visibly not what they asked for and therefore correctable.
     * A wrong scope that looks right is not.
     *
     * Only for `org`: "Commercial" must not select "Commercial appraisal",
     * because a request about commercial lending is not a request about that
     * category.
     */
    if (dim.key === 'org' && hits.length === 0) {
      const byFirstWord = new Map<string, string[]>();
      for (const v of values) {
        const first = normalise(v).split(' ')[0];
        if (first.length < 5) continue;
        byFirstWord.set(first, [...(byFirstWord.get(first) ?? []), v]);
      }
      for (const [first, sharing] of byFirstWord) {
        if (sharing.length === 1 && subject.includes(first)) hits.push(sharing[0]);
      }
    }

    /*
     * Keep the most specific name only.
     *
     * Someone who types "Meridian Bank & Trust" full-matches that AND
     * "Meridian Bank", because the shorter name is a substring of the longer
     * one. They named one client; the longer match is the one they named.
     */
    hits = hits.filter(
      (v) => !hits.some((other) => other !== v && normalise(other).includes(normalise(v)))
    );

    if (hits.length) {
      filters[dim.key] = hits;
      matchedLabels.push(...hits);
    }
  }

  /* ---- when ---- */
  const period = PERIOD_WORDS.find((p) => p.words.some((w) => q.includes(w)));
  const range = rangeById(period?.id ?? 'last-quarter');

  /* ---- what about ---- */
  const themes = Object.entries(THEME_WORDS)
    .filter(([, words]) => words.some((w) => subject.includes(w)))
    .map(([theme]) => theme);

  /* ---- what could not be honoured ---- */
  const unmet: string[] = [];
  if (THRESHOLD.test(question)) {
    /*
     * ⭐ Ed's segments ask, 16 Sept: "all customers over 5K". `applyValues`
     * narrows by dimension VALUE — it has no way to express a measure
     * threshold, so this is a different and larger feature that happened to
     * arrive in the same sentence. Saying so is the only honest option: a
     * board silently built without the threshold looks exactly like a board
     * built with one.
     */
    unmet.push(
      'a size threshold — the filters narrow by who and what kind, not by how much a client spends'
    );
  }

  const notes: string[] = [];
  if (filters.org?.length) {
    notes.push(
      "Realwired's own system fee and revenue mix are left off — this board is about a client, and that figure is ours, not theirs"
    );
  }

  return {
    filters,
    range,
    themes: themes.length ? themes : DEFAULT_THEMES,
    unmet,
    notes,
    suggestedName: suggestName(matchedLabels, period?.words[0], themes),
  };
}

/**
 * The name offered in the dialog.
 *
 * Built from what actually matched, so it is a readback as much as a
 * suggestion: if the composer heard "Northgate Bank" the reader sees it in the
 * field before agreeing to anything. A request that matched nothing gets a
 * plain, true name rather than a clever one.
 */
function suggestName(values: string[], period: string | undefined, themes: string[]): string {
  const who = values[0];
  const when = period === 'quarter' || period === 'quarterly' || period === 'qbr' ? 'QBR' : undefined;

  if (who && when) return `${who} ${when}`;
  if (who) return `${who} review`;
  if (themes.length === 1) {
    const theme = themes[0];
    return `${theme.charAt(0).toUpperCase()}${theme.slice(1)} dashboard`;
  }
  return 'New dashboard';
}

/* ============================================================================
   3 · Propose — which widgets go on it
   ========================================================================== */

export interface Candidate {
  /** The spec itself, already filtered to what parsed. */
  report: Report;
  /** One line on why it is here. Written from the reader's side, never "score: 7". */
  why: string;
  /** Ticked when the card opens. */
  recommended: boolean;
}

/**
 * Reports that show REALWIRED'S OWN take, not the client's.
 *
 * ⛔ Withheld from any board scoped to a named organisation, and this is a
 * hard product rule rather than a preference: the system fee is the vendor's
 * own margin per order, and it must never appear on a surface that could be
 * turned round and shown to a client.
 *
 * ⚠️ Found by driving the flow, 17 Sept. Asked for a board for Northgate Bank,
 * the composer recommended **System fee** — Realwired's cut — as the second
 * tile, because it is tagged `revenue, kpi` like every other money widget and
 * the scorer had no way to know the difference. A board titled with a client's
 * name is the single most likely thing in this prototype to be turned round
 * and shown to that client, and it would have carried the vendor's margin on
 * it by default.
 *
 * The widgets are not removed from the product — `Realwired Ledger` is exactly
 * where they belong, and a board with no org filter can still offer them. They
 * are withheld when the board is ABOUT somebody, and the reader is told so
 * rather than left to notice the gap.
 */
const REALWIRED_MARGIN = [
  'r-system-fee', //          the figure itself
  'r-revenue-by-source', //   where Realwired's revenue comes from
  /* ⚠️ Titled "System fee per order" — it is the SPREAD of Realwired's take,
     which on a client board is the margin broken down per transaction. Missed
     on the first pass because the id says `fee-distribution` and the rule was
     written by reading ids; caught by reading the rendered proposal. Judge
     these by what the widget SHOWS, not by what it is called. */
  'r-fee-distribution',
];

/**
 * How many candidates to offer.
 *
 * Seven, and the number is a judgement rather than a constant with no reason.
 * Fewer than five and the proposal looks like it did not try; more than eight
 * and unticking becomes a reading task, which is the one thing this flow must
 * be faster than — the reader could already have added widgets one at a time
 * from the rail.
 */
const MAX_CANDIDATES = 7;

/** How many arrive ticked. The rest are there to be considered, not ignored. */
const MAX_RECOMMENDED = 5;

/**
 * Why a report is on the list, in the reader's terms.
 *
 * ⚠️ Keyed by report id rather than generated from tags. A generated sentence
 * ("matches revenue, kpi") describes the MECHANISM, and the reader does not
 * care about the mechanism — they are deciding whether the widget earns a slot
 * on a board someone will look at. These are the reasons a person would give.
 *
 * A report with no line here falls back to its own `hint`, which is already
 * written for a human and already says what the figure counts.
 */
const WHY: Record<string, string> = {
  'r-completed-orders': 'The volume headline — how much work actually finished.',
  'r-client-fee': 'What was billed over the period.',
  'r-system-fee': "Realwired's own share of it.",
  'r-avg-turnaround': 'The operational promise, and the figure that gets asked about.',
  'r-order-activity': 'Month by month, so a period reads as a shape rather than a number.',
  'r-fee-by-category': 'Where the fee comes from. A mix shift here explains a flat total.',
  'r-category-mix': 'The same split as a share, when the proportion matters more than the amount.',
  'r-top-orgs': 'Concentration — who the book actually depends on.',
  'r-turnaround-sla': 'Which categories are missing their target, against the target itself.',
  'r-status-mix': 'What is finished, what is still moving, what is stuck.',
  'r-volume-by-category': 'Which kinds of work are growing and which are trailing off.',
  'r-fee-distribution': 'The spread per order, not the average — averages hide the tail.',
  'r-revenue-by-source': 'Revenue split by where it came from, over time.',
  'r-classification-coverage': 'How much of the work has been classified at all.',
  'r-utilization': 'Which clients are active and which have gone quiet.',
  'r-review-times': 'How long reviews take, by type.',
  'r-org-breakdown': 'The full table behind the charts — every organization, every figure.',
  'r-category-table': 'The numbers behind the category charts. Long: it takes a full row.',
};

/**
 * Score a report against the parsed request.
 *
 * Tag overlap, plus a deliberate nudge toward the shapes that make a board
 * READ as a board: a headline figure, a movement over time, a split, and the
 * detail underneath. A board of six tables is a correct answer to the tags and
 * a bad answer to the request.
 */
function score(report: Report, themes: string[]): number {
  let n = 0;
  for (const tag of report.tags) if (themes.includes(tag)) n += 10;

  /* Composition weights — small, so they break ties rather than drive the
     result. A `kpi` on a board with no kpi is worth more than a fourth chart. */
  if (report.tags.includes('kpi')) n += 4;
  if (report.tags.includes('trend')) n += 3;
  if (report.tags.includes('mix')) n += 2;
  /* Tables last: they earn their place, but never at the expense of the
     figures somebody scans first. */
  if (report.type === 'table') n -= 2;

  return n;
}

/**
 * Turn a library report into a candidate scoped to the request.
 *
 * ⭐ The clone is the whole point. A candidate is NOT the library's report —
 * it is a copy with `binding.filters` merged, so "Completed orders" on a
 * Northgate board counts Northgate's orders. Listing the library back
 * unfiltered would be a menu; this is a composition.
 *
 * `origin: 'ai'` earns the chip that stops a generated widget being mistaken
 * for a curated one, everywhere it later appears — the same rule
 * `lib/copilot.tsx` follows for its own answers.
 *
 * ⚠️ A NEW id, because the filtered copy is a different report from the
 * starter it came from. Reusing `r-client-fee` would overwrite the starter in
 * the library the moment the board saved, and every other board drawing it
 * would silently become Northgate-only.
 */
function scope(report: Report, parsed: ParsedRequest): Report {
  const hasFilters = Object.keys(parsed.filters).length > 0;
  if (!hasFilters) return { ...report, id: `${report.id}-ai`, origin: 'ai', tags: [...report.tags, 'composed'] };

  const who = Object.entries(parsed.filters)
    .map(([key, values]) =>
      values.length === 1 ? values[0] : `${values.length} ${findDimension(key)?.label.toLowerCase() ?? key}s`
    )
    .join(', ');

  return {
    ...report,
    id: `${report.id}-ai`,
    origin: 'ai',
    tags: [...report.tags, 'composed'],
    /* The hint becomes the widget's definition tooltip, so it has to say what
       this copy counts rather than what the starter counted. */
    hint: `${report.hint.replace(/\.$/, '')} — ${who} only.`,
    options: rescopeOptions(report.options),
    binding: {
      ...report.binding,
      filters: { ...report.binding.filters, ...parsed.filters },
    },
  };
}

/**
 * Drop any display option that counts the WHOLE book.
 *
 * ⚠️ MEASURED defect, 17 Sept, and the sharpest one this flow has produced.
 * `r-client-fee` ships `caption: "across 85 organizations"` — a string built
 * once from `ORG_COUNT` over every row. Cloned onto a board filtered to
 * Meridian Bank, the tile rendered **$41.75K** above *"across 85
 * organizations"*. The figure was right, the caption was a lie, and the two
 * sat one line apart on a board named after a single client.
 *
 * Nothing about it looked wrong. It is the same failure as the coverage line
 * that contradicted the slice beside it (TRAPS §3): two facts that look like
 * one, and are not.
 *
 * ⭐ The rule is narrow on purpose — a caption containing a DIGIT is stating a
 * count, and a count computed before the filter cannot survive it. A caption
 * with no digit describes what the figure MEANS rather than how much of it
 * there is ("of orders carry a request category") and is still true after
 * narrowing, so it is kept.
 *
 * Nothing is lost by dropping it: `WidgetFrame`'s own coverage line states the
 * population it actually counted — "Covers 49 of 587 completed orders (8.3%).
 * 538 are outside this widget's filters" — which is both true and more useful
 * than the caption was.
 */
function rescopeOptions(options: Report['options']): Report['options'] {
  if (!options) return options;
  const caption = options.caption;
  if (typeof caption !== 'string' || !/\d/.test(caption)) return options;
  const { caption: _dropped, ...rest } = options;
  return rest;
}

/**
 * The widgets to offer for a parsed request.
 *
 * ⚠️ Reads `getReports()`, not `REPORTS` — the live library, so a report built
 * in the builder ten minutes ago can be composed onto a board. Reading the
 * const array would mean the copilot could only ever offer the eighteen we
 * shipped, which is the same trap `lookupReport` exists to close.
 */
export function propose(parsed: ParsedRequest): Candidate[] {
  const clientBoard = Boolean(parsed.filters.org?.length);

  /*
   * Dimensions the request narrowed to exactly ONE value.
   *
   * ⚠️ MEASURED defect, 17 Sept. A board for Northgate Bank was offered — and
   * built with — `Top organizations by fee`, which grouped by `org` on a board
   * filtered to one org and drew **a single bar**. `Client utilization` drew a
   * one-row heatmap beside it. Both were correct, both were useless: a chart
   * that compares organisations cannot compare anything when there is one.
   *
   * ⭐ The rule is general rather than a list of report ids: a chart GROUPED BY
   * a dimension the reader has narrowed to a single value has one category on
   * its axis, whatever the dimension is. Filter to one request category and
   * `Client fee by category` has the same problem.
   *
   * Two or more values is fine — that is a comparison, and comparing the three
   * banks you named is a reasonable board.
   */
  const collapsed = Object.entries(parsed.filters)
    .filter(([, values]) => values.length === 1)
    .map(([key]) => key);

  const scored = getReports()
    /* Not the copilot's own past answers: a proposal built out of previously
       generated widgets compounds one composition on another, and the reader
       has no way to see how far from the starters they have drifted. */
    .filter((r) => r.origin !== 'ai')
    /* ⛔ Never the vendor's own margin on a board about a client. See
       `REALWIRED_MARGIN` — a stated product rule, enforced here. */
    .filter((r) => !(clientBoard && REALWIRED_MARGIN.includes(r.id)))
    /* ⛔ Nothing grouped by a dimension narrowed to one value — it would draw
       one bar. See `collapsed`. */
    .filter((r) => !(r.binding.x !== null && collapsed.includes(r.binding.x)))
    .map((report) => ({ report, n: score(report, parsed.themes) }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_CANDIDATES);

  return scored.map(({ report }, i) => ({
    report: scope(report, parsed),
    why: WHY[report.id] ?? report.hint,
    recommended: i < MAX_RECOMMENDED,
  }));
}

/* ============================================================================
   4 · The whole read, in one call
   ========================================================================== */

export interface Composition {
  parsed: ParsedRequest;
  candidates: Candidate[];
}

export function compose(question: string): Composition {
  const parsed = parse(question);
  return { parsed, candidates: propose(parsed) };
}

/**
 * The sentence above the checklist.
 *
 * Written here rather than in the component because it is a statement about
 * what was understood, and what was understood is this file's business. It
 * reads back the scope so the reader can correct it before anything is made —
 * the cheapest possible place to catch a misread request.
 */
export function readback(parsed: ParsedRequest): string {
  const who = Object.values(parsed.filters).flat();
  const subject = who.length === 0 ? 'your whole book' : who.join(' and ');
  return `A board for ${subject}, over ${parsed.range.label.toLowerCase()}.`;
}
