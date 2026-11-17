import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/** Fetch JSON from the API; re-fetches when the app-wide data version changes. */
export function useData(path) {
  const { version } = useApp();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => { live = false; };
  }, [path, version, tick]);
  return { ...state, reload };
}
