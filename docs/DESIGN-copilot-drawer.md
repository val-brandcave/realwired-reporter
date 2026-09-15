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
