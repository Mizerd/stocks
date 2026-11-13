import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';

interface Message {
  id: number;
  text: string;
  undo?: () => void;
}

const SHOWN_MS = 5000;

let show: ((message: Message) => void) | null = null;
let lastId = 0;

// Shows a short message at the bottom of the screen, in place of any still showing.
export function showToast(text: string, undo?: () => void) {
  show?.({ id: ++lastId, text, undo });
}

// Where showToast messages appear. Mounted once on each page that can send one.
export function Toast() {
  const { t } = useT();
  const [message, setMessage] = useState<Message | null>(null);
  const [paused, setPaused] = useState(false);
  const undoButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = setMessage;
    return () => {
      if (show === setMessage) show = null;
    };
  }, []);

  // Stays while the pointer or keyboard focus is on it.
  useEffect(() => {
    if (!message || paused) return;
    const timer = setTimeout(() => setMessage(null), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [message, paused]);

  // A removed row takes its focused button with it; Undo is then the natural next stop.
  useEffect(() => {
    if (message && document.activeElement === document.body) undoButton.current?.focus();
  }, [message]);

  function dismiss() {
    setMessage(null);
    setPaused(false);
  }

  return (
    <div role="status" className="toast-at">
      {message && (
        <div
          key={message.id}
          className="toast"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          onKeyDown={(e) => e.key === 'Escape' && dismiss()}
        >
          <span>{message.text}</span>
          {message.undo && (
            <button
              type="button"
              ref={undoButton}
              className="toast-undo"
              onClick={() => {
                message.undo?.();
                dismiss();
              }}
            >
              {t('common.undo')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
