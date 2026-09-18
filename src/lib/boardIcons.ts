import type { IconName } from '@realwired/ui';

/* ============================================================================
   A dashboard's icon.

   ⭐ The client's ask, 18 Sept: the boards in the rail are five identical rows
   of text, and a reader scanning for one is reading rather than recognising.
   A glyph per board is what turns that list into something you find by shape.

   ## The set is CURATED, not the whole library

   `@realwired/ui` exports around seventy icons and most of them are chrome —
   `logout`, `trash`, `mic`, `panel-close`. Offering all of them would make the
   grid something you search instead of something you see, and the extra sixty
   per cent are glyphs nobody would ever put on a dashboard.

   ⚠️ So this list is a PRODUCT decision and not a convenience: these are the
   glyphs that mean something in an appraisal-management book. Adding one is
   fine; adding one that does not describe a kind of work is not.

   ## Monochrome, on purpose

   ⛔ No colour. The glyph takes the ink of whatever row it sits in, so the
   rail's active treatment (maroon plus a fill) still reads, and a user-chosen
   hue can never land beside the amber `DEMO` chip or the primary maroon and
   look like it means something it does not. One axis, chosen once.
   ========================================================================== */

/**
 * The offered set, in the order the grid draws them.
 *
 * Ordered by what they are ABOUT rather than alphabetically — the money ones
 * together, then work, then people and time — because a grid you scan is
 * scanned by neighbourhood. It is not labelled as groups: at twenty-four the
 * headings would be more chrome than the set needs.
 */
export const BOARD_ICONS: IconName[] = [
  /* the general one, and the one everything falls back to */
  'dashboard',
  'insight',
  'report',
  'columns',
  /* money */
  'credit-card',
  'quote',
  'book',
  'diamond',
  /* the work itself */
  'order',
  'checklist',
  'document',
  'templates',
  'scan',
  'construction',
  /* judgement and review */
  'reviews',
  'gavel',
  'check-circle',
  'flag',
  /* who */
  'org',
  'user',
  'support',
  /* when */
  'calendar',
  'clock',
  'history',
];

/**
 * What a board gets when nothing suggests anything better.
 *
 * ⚠️ It is the same glyph the rail's `Dashboards` section wears, which is
 * correct HERE and was wrong for `Overview`: a fallback should look generic,
 * because that is what it is saying. A named board with a real subject should
 * not wear it — Overview did, sat directly under its parent, and the row that
 * was one board read as the row that was all of them.
 */
export const DEFAULT_BOARD_ICON: IconName = 'dashboard';

/**
 * A keyword map from a board's NAME to a glyph.
 *
 * ⭐ Val's call, 18 Sept: suggest, then let it be changed. The modal opens with
 * the suggestion already selected, so naming a board is still one decision in
 * the common case — and a board the copilot builds arrives looking chosen
 * rather than stamped, which matters most on the one surface where the board
 * was made for you while you watched.
 *
 * ⚠️ FIRST match wins, so the order here is the priority order. `review` sits
 * above `client` deliberately: "AI review backlog for Northgate" is about
 * reviews, and the client is its scope.
 *
 * ⚠️ These are matched against a lowercased name with word boundaries, not
 * `includes`. `order` inside "Northgate Borders" is not an order, and this is
 * the same class of defect as the composer matching a document word against a
 * data value — see `DOCUMENT_WORDS` in `compose.ts`.
 */
const SUGGESTIONS: Array<{ icon: IconName; words: string[] }> = [
  { icon: 'reviews', words: ['review', 'reviews', 'ai', 'qc', 'quality'] },
  { icon: 'credit-card', words: ['fee', 'fees', 'billing', 'billed', 'revenue', 'invoice', 'margin'] },
  { icon: 'book', words: ['ledger', 'book', 'accounts', 'p&l', 'pnl'] },
  { icon: 'org', words: ['client', 'clients', 'customer', 'customers', 'bank', 'lender', 'portfolio', 'org'] },
  { icon: 'clock', words: ['turnaround', 'sla', 'speed', 'late', 'ageing', 'aging', 'overdue'] },
  { icon: 'order', words: ['order', 'orders', 'volume', 'pipeline', 'throughput', 'intake'] },
  { icon: 'calendar', words: ['quarterly', 'monthly', 'weekly', 'annual', 'qbr', 'quarter', 'month'] },
  { icon: 'gavel', words: ['appraisal', 'appraisals', 'valuation', 'evaluation'] },
  { icon: 'scan', words: ['inspection', 'environmental', 'site'] },
  { icon: 'checklist', words: ['coverage', 'classification', 'unassigned', 'data', 'quality'] },
  { icon: 'insight', words: ['insight', 'insights', 'trend', 'trends', 'analysis'] },
];

/**
 * Guess an icon from a board's name.
 *
 * Returns the fallback rather than nothing, so every caller gets a real glyph
 * and no surface has to decide what to draw when there isn't one.
 */
export function suggestIcon(name: string): IconName {
  const words = new Set(
    name
      .toLowerCase()
      /* Split on anything that is not a letter or digit, so "Q3 fee-review"
         yields q3 / fee / review and an ampersand cannot weld two words. */
      .split(/[^a-z0-9&]+/)
      .filter(Boolean)
  );

  for (const { icon, words: keys } of SUGGESTIONS) {
    if (keys.some((k) => words.has(k))) return icon;
  }
  return DEFAULT_BOARD_ICON;
}
