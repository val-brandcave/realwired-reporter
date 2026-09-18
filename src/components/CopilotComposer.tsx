import { useState } from 'react';
import { ChatComposer } from '@realwired/ui';

import { AttachChips, AttachMenu } from './AttachMenu';
import { sameAttachment, type Attachment } from '../lib/attach';
import { ask, useThread } from '../lib/thread';

/* ============================================================================
   The way you ask, on both copilot surfaces.

   ⭐ One component, because it is one assistant. The chat page and the docked
   panel already share one thread; giving them two different composers would
   mean the same conversation had two different ways to be typed into, and the
   attach rules would drift apart the first time one of them changed.

   What is NOT shared is the placement: the chat page floats its composer on
   the canvas (`raised`), the panel keeps it in a footer band. That is the one
   real difference between the two surfaces and it is the one prop.
   ========================================================================== */

export interface CopilotComposerProps {
  placeholder: string;
  /** Float on the canvas rather than sitting in a band. The chat page only. */
  raised?: boolean;
}

export function CopilotComposer({ placeholder, raised }: CopilotComposerProps) {
  const { pending } = useThread();
  const [draft, setDraft] = useState('');
  /*
   * ⚠️ The chips are the COMPOSER's state, not the thread's.
   *
   * They describe a question that has not been asked yet, so they belong to
   * the thing being written rather than to the conversation. Once sent they
   * are copied onto the turn — see `TurnAttachments` — which is what keeps a
   * sent answer's scope visible after the composer has been cleared.
   *
   * ⚠️ That does mean the two surfaces hold their own chips. Correct: a
   * half-written question in the panel is not the same half-written question
   * as the one on the chat page, and merging them would have one surface
   * silently editing what the other was about to send.
   */
  const [attached, setAttached] = useState<Attachment[]>([]);

  const send = () => {
    ask(draft, attached);
    setDraft('');
    /* Cleared with the field. A chip left behind would silently scope the NEXT
       question too, and the reader would have no reason to look for it. */
    setAttached([]);
  };

  const add = (a: Attachment) =>
    setAttached((list) => (list.some((x) => sameAttachment(x, a)) ? list : [...list, a]));

  const remove = (a: Attachment) =>
    setAttached((list) => list.filter((x) => !sameAttachment(x, a)));

  return (
    <ChatComposer
      value={draft}
      onChange={setDraft}
      onSubmit={send}
      busy={Boolean(pending)}
      raised={raised}
      /*
       * ⭐ Dictation, and it earns its place here more than anywhere else in
       * the app. This product's primary reader is not a query author — saying
       * "build me a dashboard for Northgate's quarterly review" is a sentence
       * people produce naturally, and typing it is the step that makes a
       * copilot feel like a search box.
       *
       * ⚠️ The first press raises the browser's own microphone permission
       * prompt, which is a modal we do not control. Grant it on the demo
       * machine before a call rather than discovering it in front of one.
       * Chrome and Edge only; the control is absent elsewhere.
       */
      dictation
      leading={<AttachMenu attached={attached} onAttach={add} disabled={Boolean(pending)} />}
      attachments={<AttachChips attached={attached} onRemove={remove} />}
      /* ⭐ A chip on its own is a complete request — attaching `Total client
         fee` and pressing send means "show me this". Without this, send stays
         disabled until something is typed and the chips become decoration
         that only works alongside a sentence. */
      hasAttachments={attached.length > 0}
      placeholder={placeholder}
    />
  );
}
