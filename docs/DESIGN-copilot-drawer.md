# Design — the Copilot as a right-docked drawer

**Written 15 Sept 2026, the night before the 16 Sept call. Nothing here is built.**
Val's ask: BrickLayer has a right-docked *"Ask BrickLayer"* summonable from any page; Reporter
does not, and we never discussed it. This says what it would be, what it costs, and the one
measured thing that could make it look broken on a call.

---

## The gap, stated honestly

`Copilot.dc.html` draws a **full-page destination**, and `/chat` is built to it. So the page is
not wrong — it is the approved spec, and it works. What is missing is the *second* surface.

The case for adding one is Cody's own acceptance criterion, verbatim from the EditMode annotation:

> *"if I need to jump into a builder session with her and start rearranging things or pulling in
> new graphs, I can do that with her on the fly."*

Our copilot already answers with a **real widget** — same binding engine, same registry, same
`WidgetFrame` as a dashboard tile — carrying **Save to library** and **Add to a dashboard**. Those
two actions are strongest when the board you would add to is on the screen behind them. A full page
makes the copilot somewhere you *go*, and going there means leaving the thing you were changing.
A drawer makes it something you *use*.

⚠️ This is a **departure from the approved canvas**, which draws one Copilot surface. Per the
artboard rule it gets recorded rather than silently absorbed — that is what this file is.

---

## What it is

**One copilot, two surfaces, one thread.** Not a second chat.

- `/chat` stays exactly as it is: the destination, with `ChatThreadRail` and the conversation list.
  It is the spec and it is built.
- A **non-modal `Sheet`** docks on the right, summonable from the app header on every route. It
  shows the *same* thread — ask in the drawer, open `/chat`, and the turn is there.
- Closing the drawer loses nothing, because the thread was never in the drawer.

The state move is the same one `lib/boards.ts` already made and documents: a thread rendered inside
the route that draws it cannot be read from another route. `lib/copilot.tsx` holds the scripted
answers and the router; the *turns* would move to a small store beside it.

### Why `Sheet` and not something new

`Sheet` already has `modal={false}`, and its own note describes this exact case: the scrim and blur
drop, the page stays interactive, focus is not trapped, so a person can ask three questions and
watch each answer land against the live board. `AddReportRail` is already that pattern on the
dashboard, so the drawer would be the second instance of a behaviour the app has, not a new idea.

### The summon control

In the **app header**, present on every route — the one piece of chrome that is always there. Not a
floating action button: the rail and header carry every other destination, and a circle hovering
over the board would be the only control in the app that belongs to no structure.

⛔ **Not on the builder.** `/reports/*` is chromeless on purpose — the builder needs the width and
escapes the shell deliberately. A drawer there would re-introduce the chrome that route exists to
shed, and take 520px off a three-column workbench that already yields to one column at 1280.

---

## ⚠️ The measured risk, and the number

**A widget in a 420px drawer will truncate.** This is not a guess — it is on record twice:

1. Insights' "what changed" band is one column instead of the artboard's two, because **measured, a
   two-up card is 436px** and that wrapped every category label and left the SLA chart drawing
   three of six categories.
2. Shrinking the dashboard grid for the `AddReportRail` was tried and reverted: at 436px narrower,
   four stat cards truncated to `"Complet…"`, `"Total clie…"`, `"Average …"` and the donut's slice
   labels overlapped its coverage line.

The copilot's answer *is* one of those widgets, through the same path. So:

- **The drawer is 520–560px, not 420.** That clears the 436px floor with room for the chat gutter.
- **Verify by measuring, not looking.** Render the five scripted answers in the drawer and read the
  rendered box: no clipped glyphs, no overlapping labels, the coverage line on one or two lines.
  The three defects fixed on 15 Sept were all found this way and none was visible at a glance.
- There is a **known `StatCard` caption clip** still live (`Total client fee` 29px showing 59px).
  A narrower container makes it worse, so it should be fixed before or with this, not after.

---

## Scope

**In:** the summon control in the header; the non-modal right `Sheet`; the thread store shared with
`/chat`; the answer widget, its narration and its three actions, rendered at drawer width; Escape
and the close button; a link out to `/chat` for the full thread.

**Out:** a second thread list in the drawer (that is what `/chat` is for); resizing; remembering
open/closed across reloads; the drawer on `/reports/*`.

---

## Sequencing, and why this is not built tonight

`DEMO-SCRIPT.md` has **never been run end to end** against the built app, and the app moved three
times on 15 Sept. Rehearsing it is worth more than a second copilot surface. So:

1. Rehearse and time the demo. ⭐
2. Raise the drawer with Cody on the call as a specified gap — a decision, not an oversight.
3. Build it after, with the `StatCard` caption clip fixed first.

Nothing here is pushed. `realwired-reporter` is public; the design system's Chromatic Storybook is
the client's link. Both wait for Val.

---

# Addendum — 18 September 2026: it docks, it does not overlay

**Built. The `Sheet` is gone.** Val's ask, verbatim: the chat drawer should be *"something that is
not an overlay but moves or resizes the center body content"*, following the sibling prototype's
copilot.

## What was wrong with what shipped on 17 Sept

`modal={false}` fixed the wrong half. It drops the scrim and the focus trap, so the board stays
visible *and clickable* — but a 560px `position: fixed` panel still lands **on top of** the
right-hand third of the board. On Overview that third is two tiles, and they are exactly the tiles
you want to watch while asking the copilot to change them.

The library had already said so. `Flank`'s own note: *"The dock pushing instead of overlaying is the
decision worth protecting… Any product tempted to switch this to an overlay should have to argue
with this paragraph first."* This app was arguing with it, and there was no record of the argument.

## What it is now

`AppShell`'s **`dock` slot**, holding a `Flank side="end"` inside a zero-width clip that opens to
480px. Everything else — one thread, two surfaces, the composer as a footer, dictation, the
transcript component — is unchanged.

| | before (17 Sept) | now |
|---|---|---|
| mechanism | `Sheet modal={false}`, `position: fixed` | `AppShell dock` → `Flank side="end"`, in flow |
| width | 560 | **480** |
| board at 1920 | unchanged, 1617 of grid, **two tiles covered** | 1289 of grid, **nothing covered** |
| header | eyebrow + title, two lines | one 60px band, the shell's own grammar |
| rail | unchanged | **collapses while the dock is open**, restores after |
| summon | ghost button | same button, `outline` + `aria-pressed` while open |

## Measured, at a 1920 viewport

Sweeps are box measurements (`scrollHeight` vs `clientHeight` on every clipped descendant, plus
`scrollWidth` vs `clientWidth` on every tile title), not looking at the screen.

| | closed | open |
|---|---|---|
| rail | 224 | 72 (auto) |
| dock | 0 | 480 |
| content column | 1681 | 1353 |
| board grid | 1617 | 1289 |
| figure tile | 392 | 310 |
| `documentElement.scrollWidth` | 1920 | 1920 |
| horizontal scrollbar | none | none |
| truncated tile titles | none | **none** |
| clipped boxes | none | **one — see below** |

Insights and Reports both sweep clean with the dock open. `/chat` and `/reports/*` do not render it
at all, and the rail stays as the reader left it there.

### Why 480 and not 560, or 520

Because a docked panel's width is a question about the **board** as well as the panel, and an
overlay's was not.

- **The panel's side.** An answer widget renders at 416 inside a 480px dock, and the scripted
  answers sweep clean there. The recorded 436 floor comes from a two-up Insights card carrying the
  SLA target chart — a harder shape, and the right number to *start* from rather than to inherit.
- **The board's side.** At 520 the figure tiles come out at 300, and a tile header cannot hold
  `Average turnaround` (143px of title) beside the demo chip and the overflow menu — it renders
  `Average tur…`. At 480 the tiles are 310 and every title on the board fits. With the rail *open*
  the tiles are 262 and **three of the four** titles truncate, which is what the rail collapse is
  for: it returns 152px, and while you are talking to the copilot the thing you need on screen is
  the board, not the list of other boards.

The collapse is a suggestion, not a lock — re-opening the rail with the copilot docked works and
sticks, and closing the copilot then leaves it open.

## ⛔ One defect this exposed and did not fix

**Overview's donut tile, `Fee by request category`, is clipped with the dock open: 433px of content
in 294px of body.** It is whole with the dock shut. Below some board width the donut moves its value
list under the ring and then needs a taller tile than `widgetSize('donut').def` declares.

Same class as the `table` def (15 Sept) and the `stat` def (17 Sept): **a default is a declaration,
and this one is wrong at a width the board had never been asked for.** The fix is either a library
`def` change or a relayout of a reviewed board, so it is written down rather than taken
unilaterally. ⚠️ It is visible on the demo board whenever the copilot is open.

The related library change worth considering with it: `WidgetFrame` already makes the toolbar step
aside rather than truncate a title, on the stated ground that *"a truncated metric label is
recoverable from nowhere"*. The demo chip does not step aside, and at narrow tile widths it is what
pushes the title out. Same argument, one rule further.

## Notes for whoever touches this next

- **The panel is positioned, not flowed.** In flow inside a zero-width clip it still reached the
  document: `documentElement.scrollWidth` 1933 against 1920, a real 13px of horizontal page scroll
  and a 15px scrollbar on every screen **while the copilot was shut**. Neither `overflow: hidden`
  nor `overflow: clip` prevented it; `position: absolute` on the panel did.
- **The clip carries the width, the panel holds 480 throughout.** Animating the panel's own width
  re-lays its contents out on every frame.
- **⚠️ Two bad tests cost real time here**, both the same mistake. The automation tab was
  `document.visibilityState === "hidden"`, so `requestAnimationFrame` never fired — which meant CSS
  transitions never completed and `react-grid-layout`'s ResizeObserver callback (rAF-debounced)
  never applied. The panel therefore measured 0px wide with `data-open="true"`, and a script that
  toggled it and polled timed out after 45 seconds. Both were read as code defects; neither was.
  **If layout looks frozen, check `visibilityState` before changing anything.** A mounted grid
  measures synchronously, so an in-app navigation away and back is a usable way to re-measure a
  board in a throttled tab.
