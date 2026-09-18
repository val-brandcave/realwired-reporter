import { useMemo, useState } from 'react';
import { ChatThreadRail, Flank, IconButton, PageBody, PageHeader, Tooltip } from '@realwired/ui';

import { CopilotComposer } from '../components/CopilotComposer';
import { CopilotTranscript } from '../components/CopilotTranscript';
import { THREADS } from '../lib/copilot';
import { openThread, startNew, useThread } from '../lib/thread';

/* ============================================================================
   The reporting copilot — step 7. The DESTINATION surface.

   ⭐ It answers with a WIDGET, not a paragraph, and the widget is a real spec.
   `lib/copilot.tsx` holds the five scripted answers and the router;
   `lib/compose.ts` turns a request for a BOARD into widget specs;
   `components/CopilotTranscript.tsx` draws every turn and owns what its offers
   do. This file is now only what is unique to the page: the conversation rail,
   the reading column, and the composer.

   ## ⚠️ The turns are NOT this page's state any more

   They live in `lib/thread.ts`, above the router. That move is what makes the
   docked drawer a second surface on ONE conversation rather than a second
   chat — ask in the drawer, open this page, and the turn is here. Held in a
   `useState` right here, as they were until 17 Sept, the drawer would have had
   its own empty transcript and the two would have diverged permanently the
   first time anyone used both.

   ## What is real here and what is scripted, stated plainly

   Scripted: which answer a question maps to, and the words. Real: the widget,
   and every widget in a composed board. The specs go through the same binding
   engine, the same registry and the same `WidgetFrame` as a dashboard tile,
   over the same 11,314 rows — so a chart is not a picture of an answer, it IS
   one, and `Save to library`, `Add to a dashboard` and `Create dashboard`
   write the objects they name.
   ========================================================================== */

/*
 * ⚠️ INLINE STYLES, not Tailwind. TRAPS §1: this app has no Tailwind build, so
 * every utility works only because the library's compiled stylesheet already
 * emitted that exact class. It bit here twice — `h-[360px]` computed to 0px,
 * and `max-w-[820px]` DID work, which is worse: it resolves only because a
 * Storybook STORY in the library happens to use that value, so the reading
 * measure of this page was depending on a file in another repo that a designer
 * could retune at any time.
 *
 * A one-off pixel value goes in a style attribute, where it cannot evaporate.
 */

/** The reading measure. ~75 characters at this type size, which is what prose wants. */
const COLUMN = 820;

/**
 * The answer widget's height.
 *
 * Tall enough for the shapes these answers use — a horizontal bar chart of six
 * categories, a twelve-point line — without pushing the follow-ups off screen
 * on a laptop. A dashboard tile takes its height from the grid; an answer has
 * no grid, so it states one.
 */
const ANSWER_H = 360;

export function ChatPage() {
  const { activeThreadId } = useThread();
  const [query, setQuery] = useState('');
  /*
   * The flank collapses, like everything else on this screen that can be got
   * out of the way.
   *
   * ⭐ To a 56px icon rail rather than to nothing. The two things anyone does
   * from this panel — start a conversation, find one — stay one click away,
   * and the control that brings it back is where it went. Collapsing to zero
   * would put the way back somewhere else, which is the difference between
   * folding a panel and hiding it.
   *
   * Local state: this is a reading preference for one screen, not something
   * another surface needs to know.
   */
  const [railCollapsed, setRailCollapsed] = useState(false);

  /* The saved conversation the band names. `undefined` until one is opened,
     which is exactly when the band should say the conversation is new. */
  const activeThread = useMemo(
    () => THREADS.find((t) => t.id === activeThreadId),
    [activeThreadId]
  );

  const railThreads = useMemo(
    () => THREADS.map(({ id, title, meta, group }) => ({ id, title, meta, group })),
    []
  );

  return (
    /*
      ⚠️ `h-full`, not `flex-1`. MEASURED: AppShell's scroll container is a
      BLOCK element, so a `flex-1` child has no flex parent to grow inside and
      sizes to its content — the page came out 519px tall in a 945px viewport,
      with the composer floating in the middle of dead space.
    */
    <div className="flex h-full min-h-0">
      {/*
        Leading flank: navigation, read before the content.

        ⚠️ The comment that used to sit here said the drawer deliberately does
        NOT carry a thread list. It does now — as a slide-over, not a second
        rail. See `CopilotDrawer`, which records why that reversed.
      */}
      <Flank
        side="start"
        label="Conversations"
        width={railCollapsed ? '56px' : undefined}
        header={
          /*
           * "Conversations", naming what the flank HOLDS.
           *
           * ⛔ Not the assistant's name, which the app header already says
           * twelve pixels above this band — the sibling prototype puts its
           * identity here, and copying that would stack the same two words
           * twice in one corner. The flank was the one thing on this screen
           * with no label at all; now it has the only one it needed.
           */
          railCollapsed ? (
            <Tooltip content="Show conversations" side="right">
              <IconButton
                icon="panel-open"
                label="Show conversations"
                size="sm"
                onClick={() => setRailCollapsed(false)}
              />
            </Tooltip>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">Conversations</span>
              <Tooltip content="Hide" side="bottom">
                <IconButton
                  icon="panel-close"
                  label="Hide conversations"
                  size="sm"
                  onClick={() => setRailCollapsed(true)}
                />
              </Tooltip>
            </>
          )
        }
      >
        {railCollapsed ? (
          /*
           * The folded rail. Two actions, not the list — a list at 56px is a
           * column of truncated first letters, which is worse than no list.
           *
           * ⭐ Search RE-OPENS the flank rather than doing anything at 56px.
           * There is nowhere to type and nowhere to show a result, so the
           * honest behaviour is to unfold the panel that has both.
           */
          <div className="rw-flank-folded">
            <Tooltip content="New chat" side="right">
              <IconButton icon="edit" label="New chat" size="md" onClick={startNew} />
            </Tooltip>
            <Tooltip content="Search chats" side="right">
              <IconButton
                icon="search"
                label="Search chats"
                size="md"
                onClick={() => setRailCollapsed(false)}
              />
            </Tooltip>
          </div>
        ) : (
          <ChatThreadRail
            threads={railThreads}
            activeId={activeThreadId}
            onSelect={openThread}
            onNew={startNew}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </Flank>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          ⛔ No title, and ⛔ no `New chat` either.

          The title moved to the app header on 18 Sept, where every screen now
          names itself. `New chat` was put here in the same pass and taken out
          again immediately: the rail two inches to the left already has one,
          so the screen carried TWO controls with the same words. That is the
          defect Val caught on 17 Sept, when a naming dialog put two `Create
          dashboard` buttons on screen at once — one flow, one button.

          What the band says instead is the same thing the dashboards band
          says: WHICH one you are in. The app header names the section, this
          names the object, and the rail — which collapses — is where you go to
          change it.
        */}
        <PageHeader title={activeThread?.title ?? 'New conversation'} />

        {/* The transcript scrolls, not the page: the composer below is chrome
            and must not scroll away from the reader. */}
        <PageBody className="min-h-0 flex-1 overflow-y-auto">
          {/*
            One column, capped.

            65–75 characters is the measure prose is readable at, and an answer
            here is prose first. The widget sits in the same column rather than
            breaking out of it: a chart wider than the sentence that introduces
            it reads as a different section, and the whole claim of this screen
            is that they are one answer.
          */}
          <div className="mx-auto flex w-full flex-col gap-7" style={{ maxWidth: COLUMN }}>
            <CopilotTranscript widgetHeight={ANSWER_H} />
          </div>
        </PageBody>

        {/*
          ⭐ The composer FLOATS here rather than sitting in a band — Val's ask,
          18 Sept, following the sibling prototype.

          The band was correct while the composer was chrome: a hairline, a
          surface fill, and the field inside it. But on this page the composer
          is the point of the screen, not its furniture, and a rule across the
          full width said the opposite — it drew a floor under the conversation
          and put the field in the basement. Raised, on the canvas, it reads as
          the thing you are about to use.

          ⚠️ It still does not scroll. The transcript above it scrolls; this
          stays put, which is the property the band was there to provide and
          the one thing that had to survive losing it.
        */}
        <div className="px-[var(--rw-page-x)] pb-5 pt-2">
          <div className="mx-auto w-full" style={{ maxWidth: COLUMN }}>
            <CopilotComposer raised placeholder="Ask about your orders, fees or turnaround" />
          </div>
        </div>
      </div>
    </div>
  );
}
