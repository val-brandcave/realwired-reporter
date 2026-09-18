import { useSyncExternalStore } from 'react';
import type { IconName } from '@realwired/ui';

import { attachedFilters, attachedReportIds, type Attachment } from './attach';
import { compose, readRequest, scope, type Composition } from './compose';
import { THREADS, route, type CopilotAnswer } from './copilot';
import { getReports } from './library';

/* ============================================================================
   The conversation, hoisted out of the page that used to draw it.

   ⭐ One copilot, two surfaces, ONE thread. Ask in the docked drawer, open
   `/chat`, and the turn is there — because the thread was never in the drawer.
   Closing the drawer therefore loses nothing, which is the property that makes
   a non-modal panel worth having at all.

   This is the same move `lib/boards.ts` documents and made for the same
   reason: state rendered inside the route that draws it cannot be read from
   another route. The copilot's turns were `useState` in `ChatPage`, so a
   drawer on `/dashboards/overview` would have had its own empty conversation
   and the two would have diverged the moment anyone used both.

   `useSyncExternalStore` over a module value rather than context, for the same
   reason `lib/library.ts` gives: two unrelated trees read it — the chat page
   and a drawer mounted beside the router — and neither is an ancestor of the
   other.

   Session-scoped, like every other edit in this prototype. Reload starts a new
   conversation, which is the honest scope and is also what anyone expects of a
   chat that has never claimed to persist.
   ========================================================================== */

/**
 * A turn the copilot answered with a widget.
 *
 * The original and still the common case: a question goes in, a `Report` spec
 * comes back, and the three offers under it write the objects they name.
 */
export interface AnswerTurn {
  kind: 'answer';
  id: string;
  question: string;
  answer: CopilotAnswer;
}

/**
 * What a turn was carrying when it was asked.
 *
 * ⭐ Recorded ON the turn, not only in the composer, and that is the honest
 * part. The chips change what comes back — a client narrows every figure in
 * it — so a transcript that showed the answer without them would show a
 * number whose scope had been erased. The turn states what it was asked with.
 */
export type TurnAttachments = Attachment[];

/**
 * A turn the copilot answered with a PROPOSAL — widgets to pick from.
 *
 * ⚠️ A discriminated union rather than an optional field on one shape. The two
 * turns render completely differently and resolve completely differently, and
 * an optional `composition?` would mean every consumer deciding for itself
 * what a turn carrying both, or neither, was supposed to mean.
 */
export interface ProposalTurn {
  kind: 'proposal';
  id: string;
  question: string;
  composition: Composition;
  /**
   * Which candidates are ticked, by report id.
   *
   * ⚠️ On the TURN, not in the card, and for the same reason as `status`: the
   * proposal is one offer that two surfaces can draw. Held as component state
   * it would reset the moment a reader ticked three boxes in the drawer and
   * opened `/chat` to see them properly — and the ticks would be gone with no
   * indication that anything had been lost.
   */
  selected: string[];
  /**
   * The name the board will be given.
   *
   * ⭐ On the turn, and seeded from the composer's suggestion, because naming
   * happens INSIDE the card now rather than in a dialog over it. It was a
   * `DashboardNameDialog` until 17 Sept and that was wrong in a way a
   * screenshot makes obvious: a modal dimmed the board while asking about it,
   * over a drawer that is non-modal precisely so the board stays visible — and
   * it put a second `Create dashboard` button on screen beside the card's own.
   * One flow, one button, in the conversation where the flow is happening.
   */
  name: string;
  /**
   * Where the offer got to.
   *
   * It has to live on the turn rather than in the component, because the same
   * turn is drawn on two surfaces at once: accepting a proposal in the drawer
   * has to settle the copy of it on `/chat`, and a `useState` inside the card
   * would leave the other surface still offering a board that now exists.
   */
  status: 'open' | 'building' | 'created' | 'dismissed';
  /** Set once created, so the settled card can link to what it made. */
  board?: { id: string; name: string; widgets: number; icon: IconName };
}

/**
 * A turn the copilot could not answer.
 *
 * ⭐ It did not exist until 17 Sept, and its absence was the most visible
 * defect in the whole surface: `route` seeded its best match with the first
 * scripted answer and returned it unconditionally, so ANY unrecognised
 * question came back with the August fee answer — a real widget, a confident
 * paragraph, and nothing saying it had missed. From the outside the copilot
 * appeared to do the same thing whatever you typed, because it did.
 *
 * A scripted assistant is allowed to know five things. It is not allowed to
 * answer a sixth question as though it were one of the five.
 */
export interface UnmatchedTurn {
  kind: 'unmatched';
  id: string;
  question: string;
}

export type Turn = (AnswerTurn | ProposalTurn | UnmatchedTurn) & { attached?: TurnAttachments };

interface ThreadState {
  turns: Turn[];
  /** The question in flight, shown as the user's bubble plus a thinking line. */
  pending: string | null;
  /** Which saved conversation the rail should mark. */
  activeThreadId?: string;
  /** Whether the docked drawer is showing. */
  drawerOpen: boolean;
}

let state: ThreadState = {
  turns: [],
  pending: null,
  activeThreadId: undefined,
  drawerOpen: false,
};

const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getState = () => state;

export function useThread(): ThreadState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * Whether the dock is showing, and NOTHING else.
 *
 * ⚠️ Narrow on purpose. `App` has to know this — it gives the rail up to the
 * panel — but `useThread` hands back the whole state, so `App` would then
 * re-render on every keystroke in a proposal's name field and every tick of a
 * checkbox, taking the router and the whole dashboard grid with it.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`, so a snapshot of
 * one boolean re-renders only when that boolean flips.
 */
const getDrawerOpen = () => state.drawerOpen;
export function useDrawerOpen(): boolean {
  return useSyncExternalStore(subscribe, getDrawerOpen, getDrawerOpen);
}

const set = (patch: Partial<ThreadState>) => {
  state = { ...state, ...patch };
  emit();
};

/* ============================================================================
   Asking
   ========================================================================== */

/** Long enough to read as work, short enough that nobody waits. */
const THINKING_MS = 550;

/*
 * ⚠️ ONE timer for the store, not one per surface.
 *
 * Both surfaces call `ask`, and both can be mounted at once. A timer held in a
 * component would survive its own unmount — close the drawer mid-answer and
 * the callback still fires against a store that has moved on, or worse, two
 * timers race and the same question lands twice.
 */
let timer: ReturnType<typeof setTimeout> | null = null;
const clear = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

let seq = 0;

/**
 * Ask the copilot something.
 *
 * ⭐ The fork is here and it is one line: a request to MAKE a board composes,
 * anything else routes to an answer. Both produce a turn; the transcript does
 * not care which kind, and neither does the surface drawing it.
 */
export function ask(question: string, attached: TurnAttachments = []): void {
  const q = question.trim();
  /* ⭐ A chip is a question. Attaching `Total client fee` and pressing send with
     an empty field is a complete request — "show me this" — and refusing it
     would make the chips decoration that only works alongside typing. */
  if (!q && attached.length === 0) return;

  /*
   * ⚠️ What the reader's own bubble says.
   *
   * MEASURED defect, 18 Sept, found by sending a question that was only chips:
   * the turn carried `question: ''` and the transcript drew a 20px EMPTY
   * bubble above the answer. The chips ARE the question in that case, so they
   * are what the bubble says — and it has to be the same string `pending`
   * showed a beat earlier, or the user's words change under them the moment
   * the answer lands.
   *
   * ⚠️ Only for DISPLAY. Everything that reads the request — `readRequest`,
   * `route`, `compose` — still gets the typed text, because a chip label is a
   * chosen value and feeding it back in as free text would put it through the
   * same fuzzy name matching the chip exists to avoid.
   */
  const asked = q || attachedPrompt(attached);

  set({ pending: asked });
  clear();

  timer = setTimeout(() => {
    seq += 1;
    /* One read of the request: what it means, and what it is about. */
    const { intent, parsed } = readRequest(q);

    /*
     * ⭐ The chips are merged into the PARSE, not bolted on after it.
     *
     * That is what makes them behave identically to naming the same thing in
     * the sentence — the same `filters` map feeds the same `scope()`, the same
     * `REALWIRED_MARGIN` rule and the same readback. A separate path would be
     * a second way to say "for Northgate Bank" that could drift from the
     * first, and the vendor-margin rule is one of the two things in this
     * composer that must never be bypassed.
     */
    const chipFilters = attachedFilters(attached);
    const scoped = {
      ...parsed,
      filters: { ...parsed.filters, ...chipFilters },
    };
    const pinned = attachedReportIds(attached);

    const turn: Turn =
      intent === 'compose' || (pinned.length > 0 && wantsBoard(q))
        ? (() => {
            const composition = compose(q, scoped);
            /* A pinned report is ticked whatever the scorer thought of it.
               Asking for it explicitly outranks a ranking. */
            const recommended = composition.candidates
              .filter((c) => c.recommended)
              .map((c) => c.report.id);
            return {
              kind: 'proposal' as const,
              id: `compose-${seq}`,
              question: asked,
              attached,
              composition,
              selected: [...new Set([...recommended, ...pinnedCandidateIds(composition, pinned)])],
              name: composition.parsed.suggestedName,
              status: 'open' as const,
            };
          })()
        : (() => {
            /*
             * ⭐ An attached report IS the answer.
             *
             * Deterministic and it cannot lie: the reader named the report, so
             * the copilot shows that report — narrowed by any client chip,
             * through the same `scope()` the composer uses, which is what drops
             * a caption counting all 85 organizations off a one-bank figure.
             *
             * It also takes the place of "I do not have an answer for that
             * one": with a report attached there is always something true to
             * show, which is the whole point of attaching it.
             */
            const seed = pinned.length > 0 ? getReports().find((r) => r.id === pinned[0]) : undefined;
            if (seed) {
              return {
                kind: 'answer' as const,
                id: `attached-${seq}`,
                question: asked,
                attached,
                answer: {
                  prose: attachedProse(seed.title, attached),
                  report: Object.keys(chipFilters).length ? scope(seed, scoped) : seed,
                  range: scoped.range,
                  followups: [],
                },
              };
            }

            const { thread, matched } = route(q);
            /* ⛔ Nothing matched — say so rather than returning the nearest
               scripted answer. See `UnmatchedTurn`. */
            if (!matched)
              return { kind: 'unmatched' as const, id: `miss-${seq}`, question: asked, attached };
            set({ activeThreadId: thread.id });
            return {
              kind: 'answer' as const,
              id: `${thread.id}-${seq}`,
              question: asked,
              attached,
              /* A client chip narrows a scripted answer's widget too. The
                 words above it were written about the whole book, so they are
                 left alone and the widget states its own scope in its footer —
                 rewriting scripted prose from a filter is the kind of
                 generated sentence that ends up false. */
              answer: Object.keys(chipFilters).length
                ? { ...thread.answer, report: scope(thread.answer.report, scoped) }
                : thread.answer,
            };
          })();

    set({ turns: [...state.turns, turn], pending: null });
    timer = null;
  }, THINKING_MS);
}

/** What the user's bubble says when they attached something and typed nothing. */
const attachedPrompt = (attached: TurnAttachments): string =>
  attached.map((a) => a.label).join(' · ');

/**
 * ⚠️ A board still needs asking for.
 *
 * Attaching a report does not mean "build me a board out of this" — most of
 * the time it means "show me this". So a pinned report only routes to the
 * composer when the sentence around it asks for one, and `readRequest` has
 * already made that call for everything else.
 */
const BOARD_WORDS = ['dashboard', 'board', 'boards'];
const wantsBoard = (q: string): boolean => {
  const lower = q.toLowerCase();
  return BOARD_WORDS.some((w) => lower.includes(w));
};

/** Pinned ids, mapped onto the candidate clones the composer actually made. */
const pinnedCandidateIds = (composition: Composition, pinned: string[]): string[] =>
  composition.candidates
    .filter((c) => pinned.some((id) => c.report.id === id || c.report.id === `${id}-ai`))
    .map((c) => c.report.id);

/** One sentence for an attached-report answer. Says what it is and its scope. */
function attachedProse(title: string, attached: TurnAttachments): string {
  const clients = attached.filter((a) => a.kind === 'client').map((a) => a.label);
  if (clients.length === 0) return `${title}, over the period below.`;
  const who = clients.length === 1 ? clients[0] : `${clients.length} clients`;
  return `${title}, narrowed to ${who}.`;
}

/**
 * Open a saved conversation, REPLACING the transcript.
 *
 * A thread is a conversation, and continuing yesterday's question under
 * today's is how a rail stops meaning anything. Unchanged from the behaviour
 * `ChatPage` shipped — only its home has moved.
 */
export function openThread(id: string): void {
  const thread = THREADS.find((t) => t.id === id);
  if (!thread) return;
  clear();
  seq += 1;
  set({
    pending: null,
    activeThreadId: id,
    turns: [{ kind: 'answer', id: `${thread.id}-${seq}`, question: thread.prompt, answer: thread.answer }],
  });
}

export function startNew(): void {
  clear();
  set({ turns: [], pending: null, activeThreadId: undefined });
}

/* ============================================================================
   Resolving a proposal
   ========================================================================== */

/** Rename the board a proposal will create. */
export function setProposalName(turnId: string, name: string): void {
  set({
    turns: state.turns.map((t) =>
      t.kind === 'proposal' && t.id === turnId ? { ...t, name } : t
    ),
  });
}

/**
 * Start building. The card shows the work while it happens.
 *
 * A separate state from `created` because the two say different things and the
 * reader needs to see the first one happen: a card that went straight from an
 * offer to a finished board would be the "it suddenly updated" complaint that
 * produced this function.
 */
export function beginBuild(turnId: string): void {
  set({
    turns: state.turns.map((t) =>
      t.kind === 'proposal' && t.id === turnId ? { ...t, status: 'building' as const } : t
    ),
  });
}

/** Tick or untick one candidate on an open proposal. */
export function toggleCandidate(turnId: string, reportId: string): void {
  set({
    turns: state.turns.map((t) => {
      if (t.kind !== 'proposal' || t.id !== turnId) return t;
      const on = t.selected.includes(reportId);
      return {
        ...t,
        selected: on ? t.selected.filter((id) => id !== reportId) : [...t.selected, reportId],
      };
    }),
  });
}

/**
 * Settle a proposal turn — the board was made, or the offer was declined.
 *
 * Rewrites the turn in place rather than appending a new one. The proposal IS
 * the record of what was offered, and a transcript that kept an open checklist
 * above the board it already created would be offering a decision that has
 * been taken.
 */
export function settleProposal(
  turnId: string,
  status: 'created' | 'dismissed',
  board?: { id: string; name: string; widgets: number; icon: IconName }
): void {
  set({
    turns: state.turns.map((t) =>
      t.kind === 'proposal' && t.id === turnId ? { ...t, status, board } : t
    ),
  });
}

/* ============================================================================
   The drawer
   ========================================================================== */

export const setDrawerOpen = (open: boolean) => set({ drawerOpen: open });
export const toggleDrawer = () => set({ drawerOpen: !state.drawerOpen });
