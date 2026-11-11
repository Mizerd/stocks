import { useEffect, useRef, useState } from 'react';

// Class name that tints a figure for a moment after it changes: "flash up" or "flash dn".
// `tick` changes with every move; use it as the element's key so the CSS animation restarts.
export function useFlash(value: number) {
  const previous = useRef(value);
  const [flash, setFlash] = useState({ className: '', tick: 0 });

  useEffect(() => {
    if (value === previous.current) return;
    const className = value > previous.current ? 'flash up' : 'flash dn';
    previous.current = value;
    setFlash((old) => ({ className, tick: old.tick + 1 }));
  }, [value]);

  return flash;
}
