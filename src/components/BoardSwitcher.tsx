import { useNavigate } from 'react-router-dom';
import { ActionMenu, Icon } from '@realwired/ui';

import { useDashboards } from '../lib/dashboards';

/* ============================================================================
   Which dashboard you are on, and the way to another.

   ⭐ The app header now names the SECTION — "Dashboards" — so the band below
   it names the OBJECT, and on this screen the object is one of several. A
   static title would have been the only place in the app where the name of a
   thing you can switch between was not also the way to switch.

   It is the same list the rail carries, and that duplication is deliberate
   rather than an oversight: the rail COLLAPSES — on its own, and automatically
   whenever the copilot docks — and a reader who has just given the rail up to
   the copilot must not have to give the copilot up to change board.

   ⚠️ `New dashboard` is in here, under a rule, for the same reason. With the
   rail collapsed its row in the rail is a glyph with no label, so this becomes
   the only legible way to make a board while the copilot is open.
   ========================================================================== */

export interface BoardSwitcherProps {
  /** The board being shown. */
  current: { id: string; name: string };
}

export function BoardSwitcher({ current }: BoardSwitcherProps) {
  const navigate = useNavigate();
  const dashboards = useDashboards();

  return (
    <ActionMenu
      align="start"
      items={[
        ...dashboards.map((d) => ({
          id: d.id,
          label: d.name,
          /* A check on the one you are on, a dashboard glyph on the rest.
             One icon column either way, so the labels stay on one edge —
             marking the current row by omitting its icon would ripple the
             whole list. */
          icon: (d.id === current.id ? 'check' : 'dashboard') as 'check' | 'dashboard',
          onSelect: () => navigate(`/dashboards/${d.id}`),
        })),
        {
          id: 'new',
          label: 'New dashboard',
          icon: 'add' as const,
          separatorBefore: true,
          onSelect: () => navigate('/dashboards/new'),
        },
      ]}
      trigger={
        /*
         * ⚠️ `font: inherit` and no colour of its own, because this button
         * lives INSIDE `PageHeader`'s `<h1>`. The board's name has to read as
         * the page's title, not as a control that happens to be where the
         * title was — the chevron is what says it can be opened, and it is the
         * only thing the control adds.
         */
        <button type="button" className="rw-board-switcher">
          {current.name}
          <Icon name="chevron-down" size={18} aria-hidden />
          <span className="sr-only">Change dashboard</span>
        </button>
      }
    />
  );
}
