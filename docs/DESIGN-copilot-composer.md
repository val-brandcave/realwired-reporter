# The copilot composer — a board, asked for and built

**Built 17 September 2026.** Three changes: the copilot docks beside the board, the Dashboards rail
carries a live count, and asking for a dashboard produces one.

---

## The shape of it

```
lib/compose.ts    request  → ParsedRequest → Candidate[]     (no React, no network)
lib/pack.ts       Report[] → TilePlacement[]                  (pure)
lib/thread.ts     the conversation, above the router          (one thread, two surfaces)

components/CopilotTranscript.tsx   every turn, and what its offers do
components/ProposalCard.tsx        the checklist
components/CopilotDrawer.tsx       the docked surface
pages/ChatPage.tsx                 the destination surface
```

**Nothing downstream of `compose()` is new.** `createDashboard`, `saveReport`, `setPlacements` and
`DashboardNameDialog` all existed and all work. The flow is a function that picks specs, plus a card
that offers them, plus a packer that lays the chosen ones out.

---

## Why deterministic and not a model

This repository is public, so an API key cannot live in it. A demonstration cannot depend on an
outbound request. And a flow that answers differently on each run cannot be rehearsed.

⭐ **The seam is unchanged.** `lib/copilot.tsx` already notes that swapping its router for a model
changes that file and nothing else, because everything downstream speaks specs. The composer sits on
the same seam: it produces `Candidate[]`, and a model that produced `Candidate[]` would drop in
without the proposal card, the packer, the dialog or the board changing by a line.

It is not a mock. It reads the real organisation names off the real rows through `dimensionValues`,
scores against the `tags` the eighteen starter reports already carry, and clones each match with
`binding.filters` set — so a board scoped to one organisation counts that organisation's orders.

---

## Two rules in the composer that are product decisions

Both were found by driving the flow rather than by writing it. Neither is an optimisation; removing
either changes what the product asserts.

1. ⛔ **`REALWIRED_MARGIN` — the vendor's own fee never appears on a board scoped to one client.**
   The composer originally offered `System fee` as the second tile on a board named after a client
   organisation. A board carrying a client's name is the most likely screen in this prototype to be
   turned round and shown to that client, and the system fee is the vendor's margin per order.
   ⚠️ `r-fee-distribution` belongs in that list too and was missed on the first pass, because the
   rule was written by reading **ids** and its id does not say `system-fee` — its title does. Judge
   these by what the widget shows.
2. **Nothing grouped by a dimension narrowed to a single value.** A "top organizations" chart on a
   single-organisation board draws one bar; a utilisation grid draws one row. Correct, and useless.

Both omissions are **stated on the card** rather than left to be noticed.

---

## What is deliberately not here

- **No previews in the checklist.** Seven live widgets in a 560px drawer would be slow, would clip,
  and would turn a quick decision into a reading task. The board is two clicks away and is the real
  preview.
- **No configurator.** No field pickers, no chart-type menus, no date control — those are the
  builder and the board. This only earns its place by being faster than adding widgets one at a
  time. Untick, name, create.
- **The new board does not open in edit mode.** `＋ New dashboard` does, because that board is empty
  and there is nothing else to do. This one arrives populated, and opening it in edit mode would say
  the copilot's work needs correcting before it counts.
- **No drawer on `/reports/*`**, which is chromeless on purpose, **or on `/chat`**, which *is* the
  copilot — two transcripts mounted at once would race for one name dialog.

---

## Measured, on the running app

| | |
|---|---|
| Sheet `size="panel"` | **560px**, 503px of content — clears the measured 436px floor |
| Non-modal | no scrim; survives clicking the board behind it |
| Collapsed rail badge | 6px dot, brand primary, count kept in `.sr-only` |
| Stat tiles, all five boards | no clipped content (`scrollHeight > clientHeight` sweep) |
| One thread, two surfaces | a turn asked in the drawer renders on `/chat` |
| Composed board | 5 widgets — figures two-up, charts two-up, table full width |

Four defects were found this way. All four typechecked, all four rendered a finished-looking screen,
and all four were wrong:

1. A document word matched a data value — *"quarterly **review**"* filtered every widget to the
   `Review` request category. Fixed with `DOCUMENT_WORDS`, stripped before anything is matched
   against the data.
2. An ambiguous shorthand matched two clients at once, adding two organisations' figures together
   under one organisation's name. A shorthand now matches only when it names exactly one.
3. ⭐ A caption computed **before** the filter. A starter report ships
   `caption: "across 85 organizations"`, built once from the whole dataset; cloned onto a filtered
   board it rendered a correct figure above a false caption, one line apart. A scoped clone now
   drops any caption containing a digit — the frame's coverage line states the real population.
4. `stat`'s catalogue default height could not draw a stat's own default content once the
   provenance footer took its space. Fixed in the library; see that repository's history.

---

## Still open

The demo script has never been run end to end, and it does not yet mention the drawer, the badge or
this flow.
