import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncData<T> = {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  revalidate: () => void;
};

/**
 * Fetch-on-render without synchronous setState-in-effect.
 *
 * Loading is derived (`settledKey !== fullKey`) and state only settles
 * inside async callbacks, so `react-hooks/set-state-in-effect` stays clean.
 * Previous data stays visible while refetching (no list flashing).
 */
export function useAsyncData<T>(loader: () => Promise<T>, requestKey: string): AsyncData<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Latest-loader mirror kept in an effect (never during render) so the
  // fetch effect below only depends on the key.
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const fullKey = `${requestKey}#${version}`;
  const isLoading = settledKey !== fullKey;

  useEffect(() => {
    let cancelled = false;

    loaderRef
      .current()
      .then((value) => {
        if (cancelled) {
          return;
        }

        setData(value);
        setError(undefined);
        setSettledKey(fullKey);
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }

        setError(caught instanceof Error ? caught : new Error("Request failed"));
        setSettledKey(fullKey);
      });

    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const revalidate = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return { data, error, isLoading, revalidate };
}
