import { useMemo, useState, type ReactNode } from 'react';
import {
  FilterButton,
  FilterDialog,
  FilterField,
  FilterMultiSelect,
  FilterSummary,
  Select,
} from '@realwired/ui';

import { ORDERS } from '../data/orders';
import {
  DATE_RANGES,
  DEFAULT_RANGE,
  EMPTY_FILTERS,
  countFilters,
  type Filters,
} from '../lib/context';
import { dimensionValues, findDimension } from '../lib/fields';

/* ============================================================================
   The filter surface: a button in the page's own action row, a modal, and the
   applied set as a second row of the same header band.

   ⭐ Val's round-2 corrections, 10 Sept, and there are three of them here:

   1. **The Filter button belongs beside `Edit dashboard`**, not in a card of
      its own floating above the board. Filtering and editing are the two
      things you can do to a dashboard, so they are two buttons in one row.
   2. **The applied set is a SIBLING ROW, not a box.** It reads as another
      header row with a bottom border — which is what `PageHeader`'s `toolbar`
      slot already is — rather than a bordered panel sitting on the canvas.
      A box says "component"; a row says "this page is filtered".
   3. **One tier, not two.** The `Everywhere` / `This dashboard only` headings
      are gone, and so is the modal's tier divider. Every field belongs to the
      dashboard; the sharing happens underneath, in one map keyed by field.
      See `lib/context.ts` for why that is one mechanism and not three rules.

   ## Why this is a hook and not a component

   The parts land in three different places — the button in `PageHeader`'s
   `actions`, the pills in its `toolbar`, the dialog anywhere — and one
   component cannot render into three slots. The alternative was passing `open`
   and `onOpenChange` up into the page, which puts a piece of this surface's
   own state in the page for no reason. So the hook owns the state and hands
   back three nodes, and the page decides where they sit.
   ========================================================================== */

/** Every organization in the book. The one option list not derived per board. */
const ORGS = [...new Set(ORDERS.map((o) => o.org))].sort();

/**
 * The plural noun for a field's count line — "85 organizations".
 *
 * The dimension's own label is singular and title-cased (`Request category`),
 * which reads wrong in a count. Six of these is cheaper than teaching the
 * field catalogue about grammar it has no other use for.
 */
const NOUNS: Record<string, string> = {
  org: 'organizations',
  segment: 'tiers',
  requestCategory: 'categories',
  orderType: 'order types',
  status: 'statuses',
  reviewType: 'review types',
};

export interface DashboardFiltersOptions {
  /** The shared filter state. Lives above the router — see `lib/context.ts`. */
  filters: Filters;
  onChange: (next: Filters) => void;
  /** The fields THIS dashboard offers, from `Dashboard.filters`. */
  fields: readonly string[];
  /** The board's shipped defaults, for `Reset`. */
  shipped: Record<string, string[]>;
  /**
   * The modal's heading and its line of explanation.
   *
   * Defaulted rather than required because every dashboard says the same thing;
   * they are options because Insights is not a dashboard, and a modal titled
   * "Filter this dashboard" on a screen that is not one is the kind of small
   * lie a reader notices and then stops trusting the rest of.
   */
  title?: string;
  description?: string;
}

export interface DashboardFiltersParts {
  /** The trigger. Goes in the page header's action row. */
  button: ReactNode;
  /** The applied set. Goes in the page header's toolbar row. */
  summary: ReactNode;
  /** The modal itself. Renders nothing until opened. */
  dialog: ReactNode;
}

export function useDashboardFilters({
  filters,
  onChange,
  fields,
  shipped,
  title = 'Filter this dashboard',
  description = 'Filters stay with you on any dashboard that offers the same field.',
}: DashboardFiltersOptions): DashboardFiltersParts {
  const [open, setOpen] = useState(false);

  const count = countFilters(filters.values, fields);

  /**
   * What `Reset` in the modal returns to.
   *
   * The board's SHIPPED scope, not nothing — `Reset` in a modal means "put
   * this back", and for a board that ships filtered to complete orders,
   * putting it back is that. `Clear all` on the pill row is the one that means
   * nothing, and the two are different words on purpose.
   */
  const resetTo: Filters = useMemo(
    () => ({ range: DEFAULT_RANGE, values: { ...EMPTY_FILTERS.values, ...shipped } }),
    [shipped]
  );

  /** Drop one field's values, leaving the rest of the shared map alone. */
  const clearField = (key: string) => {
    const values = { ...filters.values };
    delete values[key];
    onChange({ ...filters, values });
  };

  /*
   * The pills: the period, then every field this board has a value for, in the
   * board's own field order.
   *
   * Ordering by `fields` rather than by the map's insertion order matters more
   * than it looks — a row whose pills reshuffle depending on which filter you
   * happened to set first is a row you cannot scan twice.
   */
  const pills = useMemo(
    () => [
      {
        id: 'period',
        label: 'Period',
        value: filters.range.label,
        /* No `onRemove`: a board always covers some period. Clicking it
           reopens the modal, which is the offset for putting it in there. */
        onClick: () => setOpen(true),
      },
      ...fields
        .filter((key) => filters.values[key]?.length)
        .map((key) => {
          const values = filters.values[key]!;
          const dim = findDimension(key);
          return {
            id: key,
            label: dim?.label ?? key,
            /* Two names fit the row and three do not, so past two the count is
               the honest summary. The modal is where the list lives. */
            value: values.length > 2 ? `${values.length} selected` : values.join(', '),
            onRemove: () => clearField(key),
            onClick: () => setOpen(true),
          };
        }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, fields]
  );

  return {
    button: <FilterButton count={count} onClick={() => setOpen(true)} />,

    summary: (
      <FilterSummary
        className="min-w-0 flex-1"
        groups={[{ id: 'applied', pills }]}
        /*
         * Clears what CAN be cleared — the period stays, because it has no
         * cleared state. And it clears only THIS board's fields: a value the
         * reader set on another dashboard is not this row's to drop, and
         * dropping it from here would be a button clearing filters that are
         * not on screen.
         */
        onClearAll={
          count > 0
            ? () => {
                const values = { ...filters.values };
                for (const key of fields) delete values[key];
                onChange({ ...filters, values });
              }
            : undefined
        }
      />
    ),

    dialog: (
      <FilterDialog<Filters>
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        value={filters}
        emptyValue={resetTo}
        onApply={onChange}
      >
        {(draft, set) => (
          <>
            {/* Period FIRST — the most-changed control, so it is the one the
                modal opens on. */}
            <FilterField
              label="Period"
              hint="A closed period compares like for like. Ranges marked “to date” end today, so their comparison against a full previous period is not."
            >
              <Select
                value={draft.range.id}
                onChange={(e) =>
                  set({
                    range: DATE_RANGES.find((r) => r.id === e.target.value) ?? DEFAULT_RANGE,
                  })
                }
              >
                {DATE_RANGES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                    {r.partial ? ' — to date' : ''}
                  </option>
                ))}
              </Select>
            </FilterField>

            {/*
              Every value field is the same control, and that is the point of
              this round: an 85-value list and a 6-value list are the same
              question asked at different scales, so they get one answer.
              `FilterMultiSelect` grows a search box past ten options on its
              own — the modal does not decide that per field.
            */}
            {fields.map((key) => {
              const dim = findDimension(key);
              if (!dim) return null;
              const options = key === 'org' ? ORGS : dimensionValues(dim, ORDERS);
              const noun = NOUNS[key] ?? 'values';

              return (
                <FilterField key={key} label={dim.label}>
                  <FilterMultiSelect
                    label={dim.label}
                    noun={noun}
                    /* The count belongs in the "everything" label for a long
                       list — "All organizations (85)" answers "how many am I
                       not narrowing?" before you open it. For six categories
                       the number is not news. */
                    allLabel={
                      options.length > 10
                        ? `All ${noun} (${options.length})`
                        : `All ${noun}`
                    }
                    options={options}
                    selected={draft.values[key] ?? []}
                    onChange={(next) => {
                      const values = { ...draft.values };
                      /* An empty list means NO filter, so drop the key rather
                         than storing `[]` — a stray key would count towards
                         the badge and print an empty pill. */
                      if (next.length) values[key] = next;
                      else delete values[key];
                      set({ values });
                    }}
                  />
                </FilterField>
              );
            })}
          </>
        )}
      </FilterDialog>
    ),
  };
}
