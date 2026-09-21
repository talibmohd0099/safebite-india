// src/hooks/useLoaderFinish.js
//
// Lets a page ask its <LoadingScreen> to finish (sprint to 100%, tick every
// step) and wait for that to complete before navigating to the report --
// so the ring the person has been watching is at 100% at the moment it
// hands over to the score ring. Never blocks for more than a second.
import { useCallback, useRef, useState } from 'react';
import { recordLoaderRect } from '../utils/reportHandoff';

const FINISH_TIMEOUT_MS = 1200;

export function useLoaderFinish() {
  const [finishing, setFinishing] = useState(false);
  const resolverRef = useRef(null);

  /** Resolves when the loader has reached 100% and recorded its position. */
  const finishLoader = useCallback(
    () =>
      new Promise((resolve) => {
        const done = () => {
          recordLoaderRect();
          resolve();
        };
        resolverRef.current = done;
        setFinishing(true);
        setTimeout(() => {
          if (resolverRef.current === done) {
            resolverRef.current = null;
            done();
          }
        }, FINISH_TIMEOUT_MS);
      }),
    []
  );

  const onFinished = useCallback(() => {
    const done = resolverRef.current;
    resolverRef.current = null;
    done?.();
  }, []);

  const resetFinish = useCallback(() => setFinishing(false), []);

  return { finishing, finishLoader, onFinished, resetFinish };
}
