import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Icon, Input, type IconName } from '@realwired/ui';

import { BOARD_ICONS, suggestIcon } from '../lib/boardIcons';

export interface DashboardNameDialogProps {
  open: boolean;
  /** "New dashboard" · "Duplicate dashboard" · "Rename dashboard". */
  title: string;
  /** The primary button. Says what happens — see the note below. */
  confirmLabel: string;
  /** The name the field starts with: empty for new, the copy's name, the current name. */
  initialName?: string;
  /**
   * The icon the grid opens on.
   *
   * Omitted for a NEW board, where the suggestion follows what is typed. Passed
   * for a duplicate or a rename, where the board already has one and the
   * dialog's job is to show it, not to guess again.
   */
  initialIcon?: IconName;
  onConfirm: (name: string, icon: IconName) => void;
  onCancel: () => void;
}

/**
 * Name a dashboard.
 *
 * ## One dialog, three jobs
 *
 * Creating, duplicating and renaming ask the same question and it is the only
 * question any of them asks, so they are one component with different words.
 * Three near-identical dialogs would be three places for the field, the
 * Enter-to-submit and the empty-name guard to drift apart.
 *
 * ## The words
 *
 * ⭐ The primary button names the action it performs — `Create dashboard`,
 * `Duplicate`, `Save name` — rather than `OK` or `Submit`. An action keeps the
 * same name through the whole flow: the row in the rail says *New dashboard*,
 * this button says *Create dashboard*, and the board you land on is the one
 * you just named. Nothing in that sequence makes you guess what the next
 * screen will be.
 *
 * The placeholder is a real thing someone would type. `Northgate QBR` is the
 * fictional organisation the approved `Transactions` artboard already uses, so
 * the hint is an example from this product's world rather than "Enter a
 * name…" — which tells the reader only what a text field is.
 *
 * ## Why no description line
 *
 * A dialog whose whole content is one labelled field does not need a sentence
 * above it explaining that a dashboard has a name. It would be a line the eye
 * learns to skip, which is exactly the argument that removed the board blurb
 * from the page header on 10 Sept.
 */
export function DashboardNameDialog({
  open,
  title,
  confirmLabel,
  initialName = '',
  initialIcon,
  onConfirm,
  onCancel,
}: DashboardNameDialogProps) {
  const [name, setName] = useState(initialName);
  /*
   * ⭐ `null` means "nobody has chosen", which is NOT the same as "the default
   * glyph", and the difference is the whole behaviour.
   *
   * While it is null the grid follows what is being typed — type "Q3 fee
   * review" and the money glyph lights up as you go. The moment a glyph is
   * clicked this holds it, and typing stops moving it. A single `icon` state
   * seeded with the suggestion could not tell those apart: it would either
   * overwrite a deliberate choice on the next keystroke, or freeze on whatever
   * the first letter happened to suggest.
   */
  const [picked, setPicked] = useState<IconName | null>(initialIcon ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * Reseed and select on open.
   *
   * The dialog is not unmounted between uses, so without this a Rename opened
   * after a Create would show the last thing typed. `select()` rather than
   * `focus()` because duplicating and renaming both arrive with text already
   * in the field, and the first thing anyone does is replace it.
   */
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setPicked(initialIcon ?? null);
    const t = window.setTimeout(() => inputRef.current?.select(), 0);
    return () => window.clearTimeout(t);
  }, [open, initialName, initialIcon]);

  const trimmed = name.trim();
  /* What the grid shows as selected: the deliberate choice, or the live guess. */
  const icon: IconName = picked ?? suggestIcon(name);

  const submit = () => {
    if (trimmed) onConfirm(trimmed, icon);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {/* Disabled rather than validated on submit: an unnamed board is the
              only way this form can be wrong, and a button that will not work
              says so before it is pressed. */}
          <Button onClick={submit} disabled={!trimmed}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {/*
        A form, so Enter submits — the keyboard path a one-field dialog should
        have. `preventDefault` because there is nothing to navigate to.
      */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="rw-dash-name" className="mb-2 block text-base font-medium text-ink">
          Name
        </label>
        {/*
          The name and the chosen glyph, on one line.

          ⭐ The icon sits INSIDE the field's row rather than above the grid,
          because it is the same object the name is — this is the board, being
          named. A preview floating somewhere else in the dialog would be a
          third thing to look at, and the reader would have to work out which
          of the twenty-four glyphs below it corresponded to.
        */}
        <div className="flex items-center gap-2.5">
          <span className="rw-icon-preview" aria-hidden>
            <Icon name={icon} size={20} strokeWidth={2} />
          </span>
          <Input
            id="rw-dash-name"
            ref={inputRef}
            value={name}
            placeholder="Northgate QBR"
            autoComplete="off"
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
        </div>

        {/*
          The grid.

          ⚠️ A `radiogroup`, not a row of buttons. Picking an icon is choosing
          ONE of a set, which is what a radio group is, and it is what gives
          the arrow keys their meaning for free — a grid of twenty-four
          buttons would make the reader press Tab twenty-four times to reach
          the last one.
        */}
        <fieldset className="rw-icon-field">
          <legend className="rw-icon-legend">Icon</legend>
          <div className="rw-icon-grid" role="radiogroup" aria-label="Icon">
            {BOARD_ICONS.map((name_) => {
              const selected = name_ === icon;
              return (
                <button
                  key={name_}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={name_}
                  data-selected={selected}
                  /* Only the selected cell is a tab stop, so the grid is ONE
                     stop in the dialog's tab order and the arrows move within
                     it — the standard radio-group model. */
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setPicked(name_)}
                  onKeyDown={(e) => {
                    const step =
                      e.key === 'ArrowRight' || e.key === 'ArrowDown'
                        ? 1
                        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                          ? -1
                          : 0;
                    if (!step) return;
                    e.preventDefault();
                    const i = BOARD_ICONS.indexOf(icon);
                    const next = BOARD_ICONS[(i + step + BOARD_ICONS.length) % BOARD_ICONS.length];
                    setPicked(next);
                  }}
                >
                  <Icon name={name_} size={19} strokeWidth={2} />
                </button>
              );
            })}
          </div>
          {/*
            ⭐ Said out loud while it is still a guess. A grid that quietly
            moves its own selection as you type is the app doing something you
            did not ask for — the complaint from 17 Sept — unless it tells you
            that is what is happening and that you can overrule it.
          */}
          {picked === null && trimmed !== '' && (
            <p className="rw-icon-hint">Suggested from the name. Pick any to change it.</p>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
