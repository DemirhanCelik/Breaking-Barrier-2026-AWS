import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/** Keep drafts in this tab, separated by account, unit, task, and editor. */
export function useSessionDraft<T>(key: string, initial: T, accepts: (value: unknown) => value is T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (accepts(parsed)) return parsed;
      }
    } catch { /* Invalid or unavailable storage: start with an empty draft. */ }
    return initial;
  });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      setSaved(true);
    } catch { setSaved(false); }
  }, [key, value]);
  return [value, setValue, saved];
}

export function clearSessionDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Editing still works without storage. */ }
}
