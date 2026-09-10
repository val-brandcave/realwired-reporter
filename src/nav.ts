import type { NavNode } from '@realwired/ui';

/**
 * Reporter's destinations.
 *
 * The shape of this list IS the product decision from 8 Sept: the live
 * Reporter's six tabs become six dashboards in an extensible set, nested under
 * one nav item, and the dashboard a user makes on a call is the same kind of
 * object as the five that ship. A fixed tab bar could not express that.
 */
export const NAV: NavNode[] = [
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
    children: [
      { id: 'overview', label: 'Overview', href: '/dashboards/overview' },
      { id: 'transactions', label: 'Transactions', href: '/dashboards/transactions' },
      { id: 'ledger', label: 'Realwired Ledger', href: '/dashboards/ledger' },
      // Renamed from the live app's "Client Insights": it is named for clients
      // and was built for Realwired, which is the clearest instance of the
      // audience confusion the 2 Sept call turned up.
      { id: 'portfolio', label: 'Client Portfolio', href: '/dashboards/portfolio' },
      { id: 'reviews', label: 'AI Reviews', href: '/dashboards/reviews' },
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
