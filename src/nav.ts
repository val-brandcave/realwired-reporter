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
        ...dashboards.map((d) => ({
          id: d.id,
          label: d.name,
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
      label: 'Chat',
      icon: 'comment',
      href: '/chat',
    },
  ];
}
