import type { OrderRow } from '../lib/fields';

/* ============================================================================
   Synthetic orders — the book every widget resolves against.

   ## Invented, labelled, and internally coherent

   From the 8 Sept call, and it is a functional requirement rather than a
   disclaimer: *"she'll tell you that number is not right, and she'll spend 20
   hours on that."* So every organization here is fictional and every widget
   carries the `demo` chip over a persistent banner.

   ⚠️ What that rule does NOT mean is "round numbers". An earlier version of
   this file rounded everything on the theory that obviously-fake figures are
   safer. They are not — they are unusable. A demo book has to behave like a
   real one or nothing built on top of it can be trusted in a walkthrough:
   filters return nothing, month-over-month deltas are noise, and a CEO
   watching a live rearrangement sees a toy. **The requirement is LABELLING;
   the labelling is what carries it.** The data underneath should be as
   realistic as we can make it.

   ## Generated, not hand-written

   From a seeded PRNG, because the numbers have to survive being checked. A
   reader who adds the category breakdown and compares it to the headline
   should get the headline. Same board, same numbers, every reload, for
   everyone in the room.

   ## The book carries real structure, not uniform noise

   Uniform random rows over a flat window make every chart a straight line and
   every delta meaningless. This book has:

   - **24 months of history**, so year-over-year and "last 12 months" work.
   - **A growth trend and a seasonal shape** — spring and summer are the busy
     season for property work, so a month-over-month figure has a reason.
   - **A power-law client book** — a few national banks dominate, a long tail
     of credit unions barely registers. Ranked charts and top-N lists are only
     interesting against a distribution like this.
   - **A deliberate mix shift in the last full month**: commercial appraisal
     volume falls while everything else grows. Commercial is 10.3% of ORDERS
     and 46.2% of FEES, so August posts **+7.0% orders and −4.8% client fee**
     — both true at once. That is the single most useful thing a reporting
     product can explain, and it has to be true of the data before it can be
     explained. (All four figures measured, not intended.)
   - **SLA drift** — commercial appraisal turnaround creeps past its 22-day
     target, crossing in July and staying over since (measured: 20.4 / 21.7 /
     23.6 / 24.8). "It has been over target since July" is a fact about the
     data, not a caption written over it.
   - **Declining accounts** — twelve organizations trail off over the last
     quarter, so "who is slipping away" returns a real answer.
   - **Contract end dates**, so renewals due inside 90 days is a real query.
   - **Two near-identical organization names**, because picking the wrong one
     returns an empty dashboard rather than an error, and that is a finding.

   ## And it carries the DEFECTS the audit found

   A clean dataset would make the prototype's own arguments invisible. So:

   - **~3% of completed orders have no request category.** This is the trust
     lever: named as `Unassigned` rather than dropped, so the money is never
     silently missing, and reported on the coverage line so the gap is a task.
   - The current month is **deliberately partial**, so the partial-period flag
     has something to flag.
   - Some review types have **tiny sample sizes**, so the durations strip has
     a reason to warn.
   - A few orders have a **fee but no turnaround**, so the null-versus-zero
     distinction is exercised rather than asserted.
   ========================================================================== */

/** Mulberry32. Small, fast, and seeded — the point is reproducibility. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * "Today" for the demo, fixed rather than `new Date()`.
 *
 * A prototype whose numbers move overnight cannot be rehearsed, and a demo
 * rehearsed on Tuesday must show the same board on Tuesday next. It is also
 * what makes the partial-period story reproducible: the 9th of a 30-day month
 * is always 9 days into the current cycle.
 */
export const DEMO_TODAY = new Date('2026-09-09T00:00:00Z');

/** The closed billing cycle the audit was taken against: 16 Jul – 15 Aug. */
export const CLOSED_CYCLE = { from: '2026-07-16', to: '2026-08-15' };

/** The first month of history. 24 months back from the current partial one. */
const FIRST_MONTH = { y: 2024, m: 9 }; // October 2024, zero-indexed month
const MONTHS = 24;

/* ============================================================================
   1 · The client book
   ========================================================================== */

export interface Organization {
  name: string;
  segment: OrderRow['segment'];
  state: string;
  /** Relative share of order volume. Power-law: a few names dominate. */
  weight: number;
  /** ISO date the current contract ends. Drives "renewals due". */
  contractEnd: string;
  /** Trails off over the final quarter, so "declining" returns real names. */
  declining?: boolean;
}

/*
 * 83 fictional institutions.
 *
 * Built from curated parts rather than typed out, so the distribution is
 * deliberate and the list stays editable. Weights are assigned by tier and
 * then jittered, which produces the long tail a real book has: the top four
 * names carry roughly a third of the volume and the bottom twenty carry
 * almost none.
 */
const ORG_PARTS: Record<OrderRow['segment'], { names: string[]; weight: [number, number] }> = {
  'National bank': {
    names: ['Northgate', 'Meridian', 'Cornerstone', 'Vantage'],
    weight: [58, 92],
  },
  'Regional bank': {
    names: [
      'Kestrel', 'Harbor', 'Fairview', 'Ridgeway', 'Summit', 'Ironwood', 'Winslow',
      'Danforth', 'Ashford', 'Granite', 'Stonegate', 'Merrick', 'Kingsley', 'Hartwell',
      'Norwood', 'Selby', 'Westmark', 'Halstead', 'Beacon', 'Thornbury', 'Ellsworth',
      'Braemar', 'Caldwell', 'Fenwick', 'Rockvale', 'Amberly',
    ],
    weight: [9, 34],
  },
  'Credit union': {
    names: [
      'Cedar', 'Lakeshore', 'Pinecrest', 'Willow Creek', 'Redbud', 'Linden', 'Fox Hollow',
      'Alder', 'Brightwater', 'Copperfield', 'Quarry', 'Sagebrook', 'Talon', 'Bluff',
      'Elmridge', 'Harvest', 'Millbrook', 'Oakhaven', 'Pemberton', 'Quailridge',
      'Riverbend', 'Sandhill', 'Thistledown', 'Umberfield', 'Verdant', 'Wexford',
      'Yellowstone', 'Zephyr', 'Ashgrove', 'Birchwood', 'Clearwater', 'Dunmore',
      'Eastmoor', 'Foxglove',
    ],
    weight: [2, 13],
  },
  'Non-bank lender': {
    names: [
      'Bay Ridge', 'Coastal', 'Apex', 'Bridgepoint', 'Crestline', 'Dominion', 'Everline',
      'Fulcrum', 'Greystone', 'Highmark', 'Ironbridge', 'Keystone', 'Lumen', 'Northpeak',
      'Orchard', 'Pinnacle', 'Sterling', 'Trailhead', 'Waypoint',
    ],
    weight: [3, 19],
  },
};

const SUFFIX: Record<OrderRow['segment'], string[]> = {
  'National bank': ['Bank', 'Bank & Trust'],
  'Regional bank': ['Savings', 'Bancorp', 'Bank', 'Mutual', 'Trust Co.'],
  'Credit union': ['Credit Union', 'Federal Credit Union'],
  'Non-bank lender': ['Financial', 'Capital', 'Lending', 'Funding'],
};

const STATES = [
  'NY', 'OH', 'MA', 'IL', 'TX', 'MI', 'CO', 'CA', 'WA', 'GA', 'FL', 'PA', 'NC', 'AZ',
  'MN', 'OR', 'TN', 'MO', 'WI', 'IN', 'VA', 'NJ', 'MD', 'SC',
];

function buildOrgs(): Organization[] {
  const rand = rng(778901);
  const orgs: Organization[] = [];

  (Object.keys(ORG_PARTS) as OrderRow['segment'][]).forEach((segment) => {
    const { names, weight } = ORG_PARTS[segment];
    const suffixes = SUFFIX[segment];
    names.forEach((prefix, i) => {
      /*
       * Weight decays across the tier as well as jittering, so the tail is a
       * real tail. A flat random weight inside a tier gives every credit union
       * roughly the same volume, which no client book looks like.
       */
      const decay = 1 - (i / names.length) * 0.72;
      const base = weight[0] + rand() * (weight[1] - weight[0]);
      orgs.push({
        name: `${prefix} ${suffixes[Math.floor(rand() * suffixes.length)]}`,
        segment,
        state: STATES[Math.floor(rand() * STATES.length)],
        weight: Math.max(1, Math.round(base * decay * 10) / 10),
        contractEnd: '2027-06-30',
      });
    });
  });

  /*
   * ⭐ Two near-identical pairs, on purpose.
   *
   * Reporter's organization picker is a flat alphabetical list, so two names
   * differing by one word sit adjacent and pick wrong silently — the wrong one
   * returns an EMPTY dashboard rather than an error, which reads as "the data
   * is broken". It is a finding, so the data has to contain it.
   */
  orgs[1] = { ...orgs[1], name: 'Meridian Bank' };
  orgs.push({ ...orgs[1], name: 'Meridian Bank & Trust', weight: 4.2, state: 'PA' });
  orgs.push({ ...orgs[8], name: `${orgs[8].name} of Ohio`, weight: 2.8, state: 'OH' });

  /* Contract ends spread over two years, with six inside the next 90 days so
     "renewals due" is a real query rather than a placeholder. */
  const soon = ['2026-10-14', '2026-10-30', '2026-11-12', '2026-11-27', '2026-12-05', '2026-12-19'];
  orgs.forEach((o, i) => {
    o.contractEnd =
      i < soon.length
        ? soon[i]
        : `${2027 + (i % 2)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`;
  });

  /* Twelve accounts trail off over the final quarter. Spread through the book
     rather than clustered at the bottom, so "declining" is not a synonym for
     "small". */
  [3, 7, 11, 16, 22, 29, 35, 41, 48, 55, 63, 71].forEach((i) => {
    if (orgs[i]) orgs[i].declining = true;
  });

  return orgs;
}

/** The client book. 85 fictional institutions, power-law by volume. */
export const ORGANIZATIONS: Organization[] = buildOrgs();

/* ============================================================================
   2 · The work
   ========================================================================== */

/**
 * Category, its weight in the book, its typical fee and its typical duration.
 *
 * The SLA is NOT here — it is in the field catalogue, because it is part of
 * the vocabulary rather than a property of the generator.
 *
 * ⭐ Note the shape of the money: commercial appraisal is a modest share of
 * ORDERS and a dominant share of FEES. That asymmetry is what makes "volume up,
 * revenue down" possible, and it is the most valuable thing this book can
 * demonstrate.
 */
const CATEGORIES: {
  key: NonNullable<OrderRow['requestCategory']>;
  weight: number;
  fee: [number, number];
  days: [number, number];
  types: string[];
}[] = [
  {
    key: 'Commercial appraisal',
    weight: 11,
    fee: [2400, 9200],
    /* Averages 20.5 days against a 22-day SLA, so the category is comfortably
       INSIDE its target until `slaDrift` pushes it out. An earlier range of
       [16,30] averaged 23 and was chronically over, which quietly turned "it
       started slipping in June" into "it has always been broken". */
    days: [14, 27],
    types: ['Full narrative', 'Restricted', 'Update'],
  },
  {
    key: 'Residential appraisal',
    weight: 38,
    fee: [420, 1100],
    days: [7, 16],
    types: ['1004 Full', '1004 Drive-by', '1073 Condo'],
  },
  {
    key: 'Evaluation',
    weight: 24,
    fee: [180, 520],
    days: [3, 9],
    types: ['Desktop evaluation', 'Exterior evaluation'],
  },
  {
    key: 'Environmental',
    weight: 8,
    fee: [1600, 4800],
    days: [18, 40],
    types: ['Phase I', 'Phase II', 'Transaction screen'],
  },
  {
    key: 'Review',
    weight: 11,
    fee: [220, 640],
    days: [2, 7],
    types: ['Desk review', 'Field review'],
  },
  {
    key: 'Inspection',
    weight: 8,
    fee: [140, 380],
    days: [2, 6],
    types: ['Interior inspection', 'Exterior inspection'],
  },
];

function pick<T extends { weight: number }>(items: T[], r: number): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let acc = r * total;
  for (const it of items) {
    acc -= it.weight;
    if (acc <= 0) return it;
  }
  return items[items.length - 1];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/* ============================================================================
   3 · The monthly shape
   ========================================================================== */

/**
 * How many orders were submitted in month `i` of the 24.
 *
 * Trend times season times a small deterministic wobble. Property work peaks
 * in late spring and troughs in midwinter, so a month-over-month number has a
 * cause a reader can name — which is the difference between a chart that
 * prompts a question and a chart that prompts a shrug.
 */
function monthVolume(i: number, rand: () => number): number {
  const trend = 1 + i * 0.011;
  /* Peak around May/June, trough in December. Month 0 is October. */
  const monthOfYear = (FIRST_MONTH.m + i) % 12;
  const season = 1 + 0.17 * Math.sin(((monthOfYear - 2) / 12) * Math.PI * 2);
  const wobble = 0.94 + rand() * 0.12;
  return Math.round(430 * trend * season * wobble);
}

/**
 * ⭐ The mix shift, and the reason this book is worth building.
 *
 * In the last full month commercial appraisal volume drops sharply while
 * everything else keeps growing. Commercial is ~11% of orders and ~55% of
 * fees, so the month posts MORE orders and LESS revenue — both true at once.
 *
 * Reporter today shows those two facts on two different tabs and never
 * reconciles them, which is exactly how a CEO arrives at "the data is wrong".
 */
function commercialMultiplier(i: number): number {
  const monthsFromEnd = MONTHS - 1 - i;
  if (monthsFromEnd === 1) return 0.58; // the last full month — the shift
  if (monthsFromEnd === 0) return 0.61; // and it persists into the partial one
  if (monthsFromEnd === 2) return 0.88; // beginning to soften the month before
  return 1;
}

/**
 * SLA drift on commercial appraisal across the final three months.
 *
 * Its target is 22 days and its undrifted average is ~20.4, so the category
 * PASSES until the drift starts.
 *
 * MEASURED, by completion month: May 20.4 · Jun 21.7 · Jul 23.6 · Aug 24.8 ·
 * Sep 25.7 (partial). So it crossed in July and has stayed over since.
 *
 * ⚠️ Do not tune this to hit a rounder story. Orders are bucketed by
 * COMPLETION date, so raising the drift in one month pushes work across the
 * month boundary and moves the neighbouring averages too — the knob is not
 * local. Re-measure with `npx tsx scripts/probe.mjs` after any change and write
 * down what it actually says.
 */
function slaDrift(category: string, i: number): number {
  if (category !== 'Commercial appraisal') return 0;
  const monthsFromEnd = MONTHS - 1 - i;
  if (monthsFromEnd === 0) return 7;
  if (monthsFromEnd === 1) return 6;
  if (monthsFromEnd === 2) return 4;
  if (monthsFromEnd === 3) return 3;
  return 0;
}

/** Declining accounts trail off over the final quarter. */
function orgMultiplier(org: Organization, i: number): number {
  if (!org.declining) return 1;
  const monthsFromEnd = MONTHS - 1 - i;
  if (monthsFromEnd === 0) return 0.42;
  if (monthsFromEnd === 1) return 0.48;
  if (monthsFromEnd === 2) return 0.66;
  if (monthsFromEnd === 3) return 0.84;
  return 1;
}

/* ============================================================================
   4 · The generator
   ========================================================================== */

function build(): OrderRow[] {
  const rand = rng(20260909);
  const rows: OrderRow[] = [];
  let n = 0;

  for (let i = 0; i < MONTHS; i++) {
    const monthStart = new Date(Date.UTC(FIRST_MONTH.y, FIRST_MONTH.m + i, 1));
    const daysInMonth = new Date(Date.UTC(FIRST_MONTH.y, FIRST_MONTH.m + i + 1, 0)).getUTCDate();
    const isCurrent = i === MONTHS - 1;

    /* The current month is deliberately partial — orders are only submitted up
       to DEMO_TODAY, so the partial-period flag has something real to flag. */
    const submitWindow = isCurrent ? DEMO_TODAY.getUTCDate() : daysInMonth;
    const volume = Math.round(monthVolume(i, rand) * (isCurrent ? submitWindow / daysInMonth : 1));

    /* Weight the categories for THIS month, so the mix shift is a property of
       the month rather than of the row. */
    const monthCategories = CATEGORIES.map((c) => ({
      ...c,
      weight:
        c.key === 'Commercial appraisal' ? c.weight * commercialMultiplier(i) : c.weight,
    }));

    /* Same for the client book, so a declining account declines. */
    const monthOrgs = ORGANIZATIONS.map((o) => ({ ...o, weight: o.weight * orgMultiplier(o, i) }));

    for (let k = 0; k < volume; k++) {
      const org = pick(monthOrgs, rand());
      const cat = pick(monthCategories, rand());

      const submitted = new Date(
        monthStart.getTime() + Math.floor(rand() * submitWindow) * 86_400_000
      );

      const drift = slaDrift(cat.key, i);
      const turnaround = Math.max(
        1,
        Math.round(cat.days[0] + rand() * (cat.days[1] - cat.days[0]) + drift)
      );
      const completed = new Date(submitted.getTime() + turnaround * 86_400_000);
      const isComplete = completed <= DEMO_TODAY;

      const clientFee = Math.round(cat.fee[0] + rand() * (cat.fee[1] - cat.fee[0]));
      /* The take rate. It averages near Reporter's real 2.34%, which is what
         makes the "short of the 4% goal" card true of this data rather than a
         number pasted onto it. */
      const systemFee = Math.round(clientFee * (0.018 + rand() * 0.012) * 100) / 100;
      const passThrough = Math.round(clientFee * (0.1 + rand() * 0.3));

      /* ⭐ ~3% of completed orders carry no category — the maintenance debt the
         8 Sept call identified as the real cause of "the data is wrong". Named
         as Unassigned rather than dropped, and reported on the coverage line. */
      const unclassified = isComplete && rand() < 0.031;

      /* A few orders are billed and have no turnaround recorded — so null and
         zero are genuinely different in this data and not just in the comment. */
      const missingTurnaround = isComplete && rand() < 0.008;

      const status: OrderRow['status'] = !isComplete
        ? rand() < 0.12
          ? 'Awaiting assignment'
          : rand() < 0.5
            ? 'In appraisal'
            : 'In review'
        : rand() < 0.008
          ? 'Cancelled'
          : 'Complete';

      /* AI reviews sit on a minority of orders, and the split is deliberately
         lopsided — Both dominates, Administrative is single digits over a
         closed cycle. That is what gives the durations strip a thin sample to
         warn about. */
      const hasReview = isComplete && rand() < 0.05;
      const reviewRoll = rand();
      const reviewType: OrderRow['reviewType'] | undefined = !hasReview
        ? undefined
        : reviewRoll < 0.04
          ? 'Administrative'
          : reviewRoll < 0.16
            ? 'Technical'
            : 'Both';
      const reviewSeconds =
        reviewType === 'Administrative'
          ? Math.round(180 + rand() * 90)
          : reviewType === 'Technical'
            ? Math.round(480 + rand() * 200)
            : reviewType === 'Both'
              ? Math.round(900 + rand() * 320)
              : undefined;

      rows.push({
        id: `ORD-${100000 + n++}`,
        org: org.name,
        segment: org.segment,
        state: org.state,
        requestCategory: unclassified
          ? (undefined as unknown as OrderRow['requestCategory'])
          : cat.key,
        orderType: cat.types[Math.floor(rand() * cat.types.length)],
        status,
        submittedAt: iso(submitted),
        completedAt: isComplete ? iso(completed) : undefined,
        clientFee: status === 'Cancelled' ? undefined : clientFee,
        systemFee: status === 'Cancelled' ? undefined : systemFee,
        passThrough: status === 'Cancelled' ? undefined : passThrough,
        turnaroundDays: isComplete && !missingTurnaround ? turnaround : undefined,
        vendorDays:
          isComplete && !missingTurnaround
            ? Math.round(turnaround * (0.6 + rand() * 0.12))
            : undefined,
        reviewType,
        reviewSeconds,
      });
    }
  }

  return rows;
}

/** The whole book. Built once — the seed is fixed, so this never moves. */
export const ORDERS: OrderRow[] = build();

/** Completed orders only. What most of Reporter's own widgets count. */
export const COMPLETED = ORDERS.filter((o) => o.status === 'Complete');

/** How many distinct organizations placed an order. Derived, never hardcoded. */
export const ORG_COUNT = new Set(ORDERS.map((o) => o.org)).size;
