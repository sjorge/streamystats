"use client";

import { useEffect, useState } from "react";

export const usePersistantState = <T,>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] => {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<T>(initialValue);

  useEffect(() => {
    const storedValue = localStorage.getItem(key);
    if (storedValue) {
      try {
        setState(JSON.parse(storedValue));
      } catch (e) {
        console.error(`Failed to parse stored value for key "${key}":`, e);
      }
    }
    setLoading(false);
  }, [key]);

  useEffect(() => {
    if (!loading) {
      localStorage.setItem(key, JSON.stringify(state));
    }
  }, [key, state, loading]);

  return [state, setState, loading];
};
