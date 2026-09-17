import { useSyncExternalStore } from 'react';

import { compose, readRequest, type Composition } from './compose';
import { THREADS, route, type CopilotAnswer } from './copilot';

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
  board?: { id: string; name: string; widgets: number };
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

export type Turn = AnswerTurn | ProposalTurn | UnmatchedTurn;

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
export function ask(question: string): void {
  const q = question.trim();
  if (!q) return;

  set({ pending: q });
  clear();

  timer = setTimeout(() => {
    seq += 1;
    /* One read of the request: what it means, and what it is about. */
    const { intent, parsed } = readRequest(q);

    const turn: Turn =
      intent === 'compose'
        ? (() => {
            const composition = compose(q, parsed);
            return {
              kind: 'proposal' as const,
              id: `compose-${seq}`,
              question: q,
              composition,
              /* The composer's own recommendation is the opening state. The
                 reader edits a proposal; they do not assemble one from
                 nothing, which is what an all-unticked list would ask for. */
              selected: composition.candidates.filter((c) => c.recommended).map((c) => c.report.id),
              name: composition.parsed.suggestedName,
              status: 'open' as const,
            };
          })()
        : (() => {
            const { thread, matched } = route(q);
            /* ⛔ Nothing matched — say so rather than returning the nearest
               scripted answer. See `UnmatchedTurn`. */
            if (!matched) return { kind: 'unmatched' as const, id: `miss-${seq}`, question: q };
            set({ activeThreadId: thread.id });
            return { kind: 'answer' as const, id: `${thread.id}-${seq}`, question: q, answer: thread.answer };
          })();

    set({ turns: [...state.turns, turn], pending: null });
    timer = null;
  }, THINKING_MS);
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
  board?: { id: string; name: string; widgets: number }
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
