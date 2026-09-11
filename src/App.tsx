import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  AppShell,
  PageBody,
  PageHeader,
  ToastProvider,
  UserMenu,
  type ThemePref,
} from '@realwired/ui';

import { BuilderPage } from './pages/BuilderPage';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportsPage } from './pages/ReportsPage';
import { EMPTY_FILTERS, type Filters } from './lib/context';
import { NAV } from './nav';
import { Brandmark } from './components/Brandmark';
// Val's call, 10 Sept: the demo-data banner is OFF for now. The component is
// still there and this is a two-line restore — uncomment the import and the
// <DemoBanner /> below. It carries a stated client requirement, so it needs to
// be back before this is shown to the client. See components/DemoBanner.tsx.
// import { DemoBanner } from './components/DemoBanner';
import { RouterLink } from './components/RouterLink';

/**
 * A page that does not exist yet. It says what is coming and what it will do,
 * because an empty screen should point somewhere rather than apologise.
 */
function Coming({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <p
          style={{
            maxWidth: '58ch',
            margin: 0,
            color: 'var(--rw-ink-2)',
            fontSize: 14,
            lineHeight: '22px',
          }}
        >
          {note}
        </p>
      </PageBody>
    </>
  );
}

export function App() {
  const { pathname } = useLocation();

  /*
   * The global filter context lives HERE, above the router.
   *
   * That placement is the whole of tier one: organization and date survive a
   * dashboard switch, because "who and when" is one question asked once. Put
   * it inside the dashboard page and it would reset on every navigation, which
   * is exactly the strength the audit found in the live product (F-14) and
   * warned was easy to destroy in a redesign.
   */
  /*
   * The filters live here, above the router, and that is the whole of the
   * "shared across dashboards" behaviour.
   *
   * A value set on one board is still set when you reach another; the board
   * decides whether it OFFERS that field, and applies only its own — so a
   * filter is never silently in force on a screen that does not show it. See
   * `lib/context.ts`.
   */
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  /*
   * The theme, driven from the user menu.
   *
   * It lives here rather than in the menu because the attribute it sets is on
   * `<html>` — outside React's tree entirely. `index.html` ships
   * `data-theme="light"`, so this starts there and stays the one writer.
   *
   * Worth having beyond the demo: every widget has to be checked in both
   * modes, and a switch in the chrome is the difference between doing that and
   * meaning to.
   */
  const [theme, setTheme] = useState<ThemePref>('light');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    /* One provider for the whole app. The copilot's three offers each do
       something invisible — a report written to the library, a tile placed on
       a board you are not looking at — and an action with no acknowledgement
       reads as a dead button. */
    <ToastProvider>
      <AppShell
        nav={NAV}
        currentPath={pathname}
        linkComponent={RouterLink}
        brand={(collapsed) => <Brandmark collapsed={collapsed} />}
        header={{
          texture: false,
          /*
           * The trailing edge is where `AppHeader` documents the user menu
           * belongs, and the approved `Reports` artboard draws an avatar there.
           * The library already had the component; the app simply never passed
           * one, which is why the header looked unfinished.
           *
           * The demo runs as the product's primary user — the whole
           * prototype is arranged around her questions. The organizations in the
           * data are fictional; the operator is not, and pretending otherwise
           * would make the chrome read as a stranger's account.
           */
          end: (
            <UserMenu
              name="Brenda Wilson"
              email="brenda@realwired.com"
              theme={theme}
              onThemeChange={setTheme}
              items={[
                { id: 'profile', label: 'Your profile', icon: 'user' },
                { id: 'settings', label: 'Settings', icon: 'settings' },
                { id: 'signout', label: 'Sign out', icon: 'logout', danger: true },
              ]}
            />
          ),
        }}
      >
        {/* <DemoBanner /> — off for now, Val 10 Sept. See the note by the import. */}
        <Routes>
          <Route path="/" element={<Navigate to="/dashboards/overview" replace />} />
          <Route path="/dashboards" element={<Navigate to="/dashboards/overview" replace />} />

          <Route
            path="/insights"
            element={
              <Coming
                title="Insights"
                note="What changed, what you can trust, and what to look at — with the coverage figure first, because confidence in the data is the thing standing in front of everything else."
              />
            }
          />
          <Route
            path="/dashboards/:id"
            element={<DashboardPage filters={filters} onFiltersChange={setFilters} />}
          />
          <Route path="/reports" element={<ReportsPage />} />
          {/*
            `new` before `:id`, and the order is load-bearing: react-router would
            otherwise match "/reports/new" as a report whose id is "new" and the
            builder would open looking for a report that does not exist.
          */}
          <Route path="/reports/new" element={<BuilderPage filters={filters} />} />
          <Route path="/reports/:id" element={<BuilderPage filters={filters} />} />
          <Route path="/chat" element={<ChatPage />} />

          <Route
            path="*"
            element={
              <Coming
                title="Not found"
                note="That page does not exist. Pick a dashboard from the rail to get back."
              />
            }
          />
        </Routes>
      </AppShell>
    </ToastProvider>
  );
}
