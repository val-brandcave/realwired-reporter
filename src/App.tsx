import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  AppShell,
  Button,
  PageBody,
  PageHeader,
  ToastProvider,
  UserMenu,
  type ThemePref,
} from '@realwired/ui';

import { BuilderPage } from './pages/BuilderPage';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { InsightsPage } from './pages/InsightsPage';
import { ReportsPage } from './pages/ReportsPage';
import { EMPTY_FILTERS, type Filters } from './lib/context';
import { useDashboards } from './lib/dashboards';
import { buildNav } from './nav';
import { Brandmark } from './components/Brandmark';
// Val's call, 10 Sept: the demo-data banner is OFF for now. The component is
// still there and this is a two-line restore — uncomment the import and the
// <DemoBanner /> below. It carries a stated client requirement, so it needs to
// be back before this is shown to the client. See components/DemoBanner.tsx.
// import { DemoBanner } from './components/DemoBanner';
import { RouterLink } from './components/RouterLink';
import { CopilotDrawer } from './components/CopilotDrawer';
import { toggleDrawer } from './lib/thread';

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
   * The builder is a FULL-BLEED TAKEOVER, not a page inside the chrome.
   *
   * `Builder.dc.html` draws it at 1440×900 with no rail and no app header —
   * its own 60px band carries the back chevron, the title field, the draft
   * pill and the two save actions. `Main.dc.html` and `Reports.dc.html` both
   * draw the rail, so the omission is a decision on the artboard, not an
   * oversight. BrickLayer shipped the same split: `(builder)` is a route group
   * whose layout deliberately escapes the shell, because "the report builder
   * needs the width, and none of that chrome helps while binding fields".
   *
   * Rendered inside the shell it stacked two headers and paid 262px of rail
   * for a three-column workbench that already yields to one column at 1280.
   *
   * `chromeless` is the shell's own mechanism for this — it keeps the flex
   * and scroll structure identical and drops only the rail, the header and
   * the flanks. So this is a prop, not a second layout tree, and the back
   * chevron in the builder's header is now the only way out by design.
   */
  const chromeless = pathname.startsWith('/reports/');

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

  /*
   * The rail is DERIVED from the dashboards, so a board made on a call appears
   * in it. See `nav.ts` — this one line is the difference between "+ New
   * dashboard" being a feature and being a button that files something
   * nowhere.
   */
  const dashboards = useDashboards();
  const nav = buildNav(dashboards);

  /*
   * The copilot drawer, and where it is NOT offered.
   *
   * ⛔ Not on `/reports/*`. That route is chromeless on purpose — the builder
   * needs the width and escapes the shell deliberately — so there is no header
   * to summon from, and a 560px panel would take more than a third of a
   * three-column workbench that already yields to one column at 1280.
   *
   * ⛔ Not on `/chat`, because that page IS the copilot. A drawer showing the
   * same conversation over the page showing the same conversation is two
   * scrollbars on one thread, and it would also mean two `CopilotTranscript`s
   * mounted at once, racing for the same name dialog.
   */
  const copilotSurface = pathname === '/chat';
  const showCopilot = !chromeless && !copilotSurface;

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
        nav={nav}
        currentPath={pathname}
        chromeless={chromeless}
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
            <>
              {/*
                The summon control, in the one piece of chrome that is always
                there.

                ⭐ Not a floating action button: the rail and the header carry
                every other destination in this app, and a circle hovering over
                the board would be the only control belonging to no structure.
                It sits before the avatar because it is a tool and the avatar
                is an account — the trailing-most slot is where a user menu is
                looked for.
              */}
              {showCopilot && (
                <Button variant="ghost" size="sm" iconLeft="comment" onClick={toggleDrawer}>
                  Copilot
                </Button>
              )}
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
            </>
          ),
        }}
      >
        {/* <DemoBanner /> — off for now, Val 10 Sept. See the note by the import. */}
        <Routes>
          <Route path="/" element={<Navigate to="/dashboards/overview" replace />} />
          <Route path="/dashboards" element={<Navigate to="/dashboards/overview" replace />} />

          <Route
            path="/insights"
            element={<InsightsPage filters={filters} onFiltersChange={setFilters} />}
          />
          {/*
            ⚠️ NO separate `/dashboards/new` route, unlike `/reports/new`.

            The two are different on purpose. `new` in Reports opens a
            DIFFERENT screen — the builder with no report. `new` in Dashboards
            opens the SAME screen: the empty board you are about to make, with
            its name dialog over it. A second route rendering the same element
            would only reach `DashboardPage` with no `:id` at all, which reads
            as Overview.

            So `:id` catches it and the page branches on the literal. The other
            half of the trap is closed in `lib/dashboards.ts`, which refuses to
            mint `new` as a board id.
          */}
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

        {/*
          The drawer is mounted OUTSIDE the routes, beside them.

          ⭐ Deliberate, and it is the other half of hoisting the turns into
          `lib/thread.ts`. Rendered inside a route it would unmount on every
          navigation — so asking a question on Overview and clicking through to
          Transactions to watch the answer land would close the panel mid-
          sentence, which is the exact move a non-modal drawer exists to allow.

          It draws nothing until it is opened; `Sheet` portals its content.
        */}
        {showCopilot && <CopilotDrawer />}
      </AppShell>
    </ToastProvider>
  );
}
