import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconButton, Popover } from '@realwired/ui';

import { attachOptions, type AttachGroup, type Attachment, type AttachOption } from '../lib/attach';

/* ============================================================================
   The composer's "+" — what the question is carrying.

   ⭐ A search-first list, not a menu. The library grows every time the copilot
   saves something and there are 85 clients in the book, so a list you scroll is
   a list that stops working during the demo it was built for. Typing filters
   both groups at once, and the first match is always what Enter takes.

   ## What it offers, and why only two things

   `lib/attach.ts` carries the rule: only what the engine can genuinely honour.
   A report (which becomes the answer, or a pinned tile) and a client (which
   becomes the scope). ⏭ Segments are the intended third group and are
   deliberately absent — the reason is written out in that file and it is not a
   small one.

   ## Keyboard

   The field keeps focus throughout and drives the list, which is how every
   picker of this shape behaves: ↑/↓ move the active row, Enter takes it,
   Escape closes. Rows are not tab stops — tabbing through 85 clients to reach
   a button is not navigation.

   ## ⚠️ Styling

   Structure comes from `.rw-attach-*` in `app.css`, not from utilities. TRAPS
   §1: this app has no Tailwind build, so a utility works only if the library
   already emitted that exact class for its own components, and `ps-8`,
   `max-h-72` and `rounded-pill` are all guesses. A class in `app.css` cannot
   evaporate.
   ========================================================================== */

export interface AttachMenuProps {
  attached: Attachment[];
  onAttach: (a: Attachment) => void;
  /** Matches the microphone and send at the other edge of the field. */
  disabled?: boolean;
}

/** Flatten for keyboard traversal — a group is a heading, not a level. */
const flatten = (groups: AttachGroup[]): AttachOption[] => groups.flatMap((g) => g.options);

export function AttachMenu({ attached, onAttach, disabled }: AttachMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => attachOptions(query, attached), [query, attached]);
  const rows = useMemo(() => flatten(groups), [groups]);

  /* A filtered list has a different first row. Anything else leaves the
     highlight on a row that has moved or gone, and Enter then takes something
     the reader never looked at. */
  useEffect(() => setActive(0), [query]);

  /* Opening starts clean — the last search is not this search. */
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  /* Keep the active row in view when the arrows walk past the fold. `nearest`
     so it scrolls the list and never the page behind it. */
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const take = (option: AttachOption) => {
    onAttach(
      option.kind === 'report'
        ? { kind: 'report', id: option.id, label: option.label }
        : { kind: 'client', label: option.label }
    );
    /* Closes rather than staying open for a second pick. Attaching one thing
       and then typing the question is the common case, and a panel left up
       over the field you are about to type in is in the way. */
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + rows.length) % rows.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[active];
      if (row) take(row);
    }
  };

  let index = -1;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="start"
      width={320}
      className="rw-attach-pop"
      trigger={
        <IconButton
          icon="add"
          /* `md` is size-9 — the same 36px box as the microphone and send at
             the trailing edge, so all three sit on one baseline. */
          size="md"
          label="Attach a report or a client"
          aria-expanded={open}
          disabled={disabled}
        />
      }
    >
      <div className="rw-attach-search">
        <Icon name="search" size={14} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search reports and clients"
          aria-label="Search reports and clients"
        />
      </div>

      <div ref={listRef} className="rw-attach-list" role="listbox">
        {rows.length === 0 ? (
          /* An empty result says what it searched. "No results" over a list
             whose shape the reader cannot see is not an answer. */
          <p className="rw-attach-empty">Nothing in reports or clients matches “{query}”.</p>
        ) : (
          groups.map((group) => (
            <div key={group.id}>
              <p className="rw-attach-group">{group.label}</p>
              {group.options.map((option) => {
                index += 1;
                const isActive = index === active;
                const at = index;
                return (
                  <button
                    key={`${option.kind}-${option.id}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    /* Not a tab stop: the field is the control, these are its
                       results. */
                    tabIndex={-1}
                    onMouseEnter={() => setActive(at)}
                    onClick={() => take(option)}
                    className="rw-attach-row"
                  >
                    <Icon name={option.kind === 'report' ? 'report' : 'org'} size={15} aria-hidden />
                    <span className="rw-attach-text">
                      <span className="rw-attach-label">{option.label}</span>
                      {option.meta && <span className="rw-attach-meta">{option.meta}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Popover>
  );
}

/* ============================================================================
   The chips
   ========================================================================== */

export interface AttachChipsProps {
  attached: Attachment[];
  onRemove: (a: Attachment) => void;
}

/**
 * What is attached, above the field and inside the same box.
 *
 * Every one is removable, and removing is the whole interaction: a chip you
 * cannot take off is a filter you cannot clear, on a question you are about to
 * send.
 */
export function AttachChips({ attached, onRemove }: AttachChipsProps) {
  if (attached.length === 0) return null;

  return (
    <>
      {attached.map((a) => (
        <span key={`${a.kind}-${a.kind === 'report' ? a.id : a.label}`} className="rw-attach-chip">
          <Icon name={a.kind === 'report' ? 'report' : 'org'} size={12} aria-hidden />
          <span className="rw-attach-chip-label">{a.label}</span>
          <button type="button" onClick={() => onRemove(a)} aria-label={`Remove ${a.label}`}>
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </>
  );
}
