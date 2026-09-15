import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Input } from '@realwired/ui';

export interface DashboardNameDialogProps {
  open: boolean;
  /** "New dashboard" · "Duplicate dashboard" · "Rename dashboard". */
  title: string;
  /** The primary button. Says what happens — see the note below. */
  confirmLabel: string;
  /** The name the field starts with: empty for new, the copy's name, the current name. */
  initialName?: string;
  onConfirm: (name: string) => void;
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
  onConfirm,
  onCancel,
}: DashboardNameDialogProps) {
  const [name, setName] = useState(initialName);
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
    const t = window.setTimeout(() => inputRef.current?.select(), 0);
    return () => window.clearTimeout(t);
  }, [open, initialName]);

  const trimmed = name.trim();
  const submit = () => {
    if (trimmed) onConfirm(trimmed);
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
        <Input
          id="rw-dash-name"
          ref={inputRef}
          value={name}
          placeholder="Northgate QBR"
          autoComplete="off"
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
