import { ORDERS } from '../data/orders';
import { findDimension, dimensionValues, UNASSIGNED } from './fields';
import { getReports } from './library';
import type { Report } from './reports';

/* ============================================================================
   What a question can carry.

   ⭐ The rule that decides what may be attached: **only things the engine can
   actually honour.**

   The copilot is a deterministic router over scripted answers plus a composer
   that reads a sentence into filters. It cannot reason over an arbitrary
   document, so offering to attach one would be a promise the engine cannot
   keep — and this surface has already produced that exact failure once, when
   `route` returned its first scripted answer for any question it had not
   understood and said nothing about having missed. A control that appears to
   add context and does not is the same defect wearing a paperclip.

   So there are two kinds, and each maps onto something the engine already
   does with a sentence:

   | attached | what it really does | where it lands |
   |---|---|---|
   | a report | the answer IS that report, or it is pinned into a proposal | `compose.ts` candidates |
   | a client | the scope, stated rather than guessed | `ParsedRequest.filters.org` |

   ⭐ The client chip is worth more than it looks. `parse()` finds organisation
   names by reading the sentence, which is why "Meridian Bank" once matched
   both *Meridian Bank* and *Meridian Bank & Trust* and summed two banks under
   one bank's name. A chip is chosen from the real values, so that class of
   defect cannot happen through it.

   ## ⏭ Segments — deliberately NOT here yet

   ⚠️ This is the natural home for them and they are not ready, for a reason
   that is worth writing down rather than rediscovering:

   1. **The word is already taken.** `DIMENSIONS` has a `segment` field —
      "Organization segment", an ATTRIBUTE of an org (National bank, Regional
      bank, Credit union, Non-bank lender). The segment the client asked for on
      16 Sept is a different thing: a SAVED COHORT that a user defines and
      names. Shipping a "Segments" group in this picker that listed the four
      attribute values would look like the feature and be something else.
   2. **The interesting cohorts cannot be expressed.** "Customers over 5K" is a
      threshold on a MEASURE, and `applyValues` filters by dimension value. The
      engine would have to grow before the picker could offer it honestly.

   So: define segments in the app first — what they are, where they are made,
   where they are stored — and then add a third group here. The picker is
   built with a `group` field precisely so that is an addition rather than a
   rewrite.
   ========================================================================== */

/** The dimension a client chip filters on. */
export const CLIENT_DIMENSION = 'org';

/**
 * Something the question is carrying.
 *
 * ⚠️ A discriminated union rather than `{ kind: string; value: string }`,
 * because the two resolve through completely different code — a report
 * becomes a spec, a client becomes a filter entry — and a loose shape would
 * leave every consumer deciding for itself what an unrecognised kind meant.
 */
export type Attachment =
  | { kind: 'report'; id: string; label: string }
  | { kind: 'client'; label: string };

/** A row in the picker. `group` is what makes segments an addition later. */
export interface AttachOption {
  kind: Attachment['kind'];
  id: string;
  label: string;
  /** One quiet line under the label — what this is, in the reader's terms. */
  meta?: string;
}

export interface AttachGroup {
  id: string;
  label: string;
  options: AttachOption[];
}

/** Two chips of the same kind and name are one chip. */
export const sameAttachment = (a: Attachment, b: Attachment): boolean =>
  a.kind === b.kind && (a.kind === 'report' ? a.id === (b as { id: string }).id : a.label === b.label);

/**
 * Everything attachable, grouped, filtered by what has been typed.
 *
 * ⚠️ Reports come from `getReports()` — the LIVE library, not the starter
 * constant — so a report the copilot saved two minutes ago can be attached to
 * the next question. That is the loop this prototype exists to show, and
 * reading the constant would have quietly broken it.
 */
export function attachOptions(query: string, already: Attachment[]): AttachGroup[] {
  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const taken = (kind: Attachment['kind'], key: string) =>
    already.some((a) => a.kind === kind && (a.kind === 'report' ? a.id === key : a.label === key));

  const reports: AttachOption[] = getReports()
    .filter((r) => !taken('report', r.id) && (match(r.title) || r.tags.some(match)))
    .map((r) => ({ kind: 'report' as const, id: r.id, label: r.title, meta: reportMeta(r) }));

  const dim = findDimension(CLIENT_DIMENSION);
  const clients: AttachOption[] = !dim
    ? []
    : dimensionValues(dim, ORDERS)
        .filter((v) => v !== UNASSIGNED && !taken('client', v) && match(v))
        .map((v) => ({ kind: 'client' as const, id: v, label: v }));

  return [
    { id: 'reports', label: 'Reports', options: reports },
    { id: 'clients', label: 'Clients', options: clients },
  ].filter((g) => g.options.length > 0);
}

/**
 * The quiet line under a report's name.
 *
 * Where it came from, because that is the thing a reader cannot see from the
 * title and the thing that decides whether they trust it — a starter report is
 * one of the eighteen written down, and one the copilot made is not.
 */
function reportMeta(r: Report): string {
  if (r.origin === 'ai') return 'Made by the copilot';
  if (r.origin === 'user') return 'Yours';
  return 'Starter report';
}

/** The chips, as filters the engine understands. */
export function attachedFilters(list: Attachment[]): Record<string, string[]> {
  const clients = list.filter((a) => a.kind === 'client').map((a) => a.label);
  return clients.length ? { [CLIENT_DIMENSION]: clients } : {};
}

/** The attached report ids, in the order they were added. */
export const attachedReportIds = (list: Attachment[]): string[] =>
  list.flatMap((a) => (a.kind === 'report' ? [a.id] : []));
