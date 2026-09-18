import type { NavNode } from '@realwired/ui';

import type { Dashboard } from './lib/dashboards';

/**
 * Reporter's destinations.
 *
 * The shape of this list IS the product decision from 8 Sept: the live
 * Reporter's six tabs become six dashboards in an extensible set, nested under
 * one nav item, and the dashboard a user makes on a call is the same kind of
 * object as the five that ship. A fixed tab bar could not express that.
 *
 * ⭐ So the list is BUILT, not written. It used to be a const carrying the five
 * boards by hand, which made the claim above untrue in the one place a user
 * would check: a board created on a call appeared nowhere in the rail. The
 * dashboard children are now whatever `lib/dashboards.ts` holds.
 */
export function buildNav(dashboards: Dashboard[]): NavNode[] {
  return [
    {
      id: 'insights',
      label: 'Insights',
      icon: 'insight',
      href: '/insights',
    },
    {
      id: 'dashboards',
      label: 'Dashboards',
      icon: 'dashboard',
      href: '/dashboards',
      /*
       * How many boards there are — EVERY board, shipped and made.
       *
       * ⭐ It counts the total rather than only the ones the user made, and
       * that is the whole reason it earns a place: a count of user boards
       * starts at zero, and a zero in a nav row reads as something broken
       * rather than as a fact. The total is always true, and on a call it
       * MOVES — five becomes six the moment a board is created in front of the
       * client, in the same rail row they were just looking at. A number that
       * never changes is decoration; this one is the receipt for the thing
       * that just happened.
       *
       * ⚠️ It counts `dashboards`, not `children` — the children array also
       * carries the "New dashboard" row, which is a control and not a board.
       * Counting the rail's own rows would report six boards on a fresh load.
       */
      badge: dashboards.length,
      children: [
        /* ⭐ Each board's own glyph, 18 Sept — the client's ask. Five rows of
           text are read; five glyphs are recognised. `SidebarNav` drops the
           child indent for a row that has an icon, so these land on the same
           column as the section above them rather than opening a second one. */
        ...dashboards.map((d) => ({
          id: d.id,
          label: d.name,
          icon: d.icon,
          href: `/dashboards/${d.id}`,
        })),
        /*
         * The row that makes a board rather than going to one.
         *
         * `Main.dc.html` and `Transactions.dc.html` both draw it here — last
         * child of Dashboards, plus glyph, primary maroon — so the position
         * and the colour are the approved spec, not a choice made here. It is
         * a link rather than a button because the rail is a list of links and
         * one button among them would break the keyboard model for the sake of
         * a modal that the route opens anyway.
         */
        { id: 'new', label: 'New dashboard', icon: 'add', accent: true, href: '/dashboards/new' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: 'report',
      href: '/reports',
    },
    {
      id: 'chat',
      /*
       * ⭐ "AI Chat" — Val, 18 Sept, replacing "Copilot".
       *
       * ⚠️ And it deliberately does NOT match the section title above it, which
       * reads "AI Assistant". That is not the inconsistency the one-word rule
       * was aimed at: this row is a DESTINATION — a place with a conversation
       * list in it — and the assistant is the THING you talk to there. The
       * header's button summons the thing ("Ask AI Assistant"); the rail
       * navigates to the place. Two names because there are two objects.
       *
       * The ROUTE stays `/chat`, the way the code still says `board` where the
       * screen says dashboard.
       */
      label: 'AI Chat',
      icon: 'comment',
      href: '/chat',
    },
  ];
}

/**
 * What the app header calls the screen you are on.
 *
 * ⭐ The SECTION, never the object. "Dashboards" while you are on Overview,
 * because the band underneath names the board and a top bar that repeated it
 * would spend the app's most permanent line on a fact already on screen.
 *
 * ⚠️ Derived from `buildNav` rather than written out beside it. A second list
 * of the same four names is a second list to forget: the rail was renamed from
 * Chat to Copilot on 18 Sept, and a hand-written map here would have gone on
 * saying Chat in the header with nothing to catch it.
 */
export function sectionTitle(pathname: string): string {
  const override = TITLE_OVERRIDES.find(([href]) => pathname.startsWith(href));
  if (override) return override[1];

  const nodes = buildNav([]);
  const match = nodes.find((n) => n.href && n.href !== '/' && pathname.startsWith(n.href));
  return match?.label ?? 'Reporter';
}

/**
 * Where the header's name is not the rail's.
 *
 * ⚠️ One entry, and it earns an exception rather than breaking the rule. Every
 * other screen's header name IS its rail label, derived so the two cannot
 * drift. `/chat` is the one place where the rail names a destination ("AI
 * Chat") and the header names what is on it ("AI Assistant") — see the note on
 * that node. A list kept here rather than a second label field on `NavNode`,
 * because this is an app decision about two screens and not a shape the
 * library's nav model should grow for one product.
 */
const TITLE_OVERRIDES: Array<[href: string, title: string]> = [['/chat', 'AI Assistant']];
