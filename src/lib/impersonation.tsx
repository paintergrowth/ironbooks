import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type ImpersonationTarget = {
  userId: string;
  email: string;
  name?: string | null;
  realmId?: string | null;
};

type ImpersonationCtx = {
  isImpersonating: boolean;
  target: ImpersonationTarget | null;
  setImpersonation: (t: ImpersonationTarget) => void;
  clearImpersonation: () => void;
};

const log = (...args: any[]) => console.log('[impersonation]', ...args);

const Ctx = createContext<ImpersonationCtx | undefined>(undefined);
const LS_KEY = "impersonation:v1";

export const ImpersonationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  log('provider: mount');
  const [target, setTarget] = useState<ImpersonationTarget | null>(null);

  // load from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      log('provider: initial read localStorage =', raw || '(none)');
      if (raw) {
        const parsed = JSON.parse(raw);
        log('provider: parsed initial target =', parsed);
        setTarget(parsed);
      }
    } catch (e) {
      console.warn('[impersonation] provider: failed to read/parse LS', e);
    }
  }, []);

  // persist + broadcast whenever target changes
  useEffect(() => {
    try {
      if (target) {
        localStorage.setItem(LS_KEY, JSON.stringify(target));
        log('provider: saved to LS', target);
      } else {
        localStorage.removeItem(LS_KEY);
        log('provider: cleared LS');
      }
    } catch (e) {
      console.warn('[impersonation] provider: failed to write LS', e);
    }
    window.dispatchEvent(new CustomEvent("impersonation:changed"));
    log('provider: dispatched event impersonation:changed');
  }, [target]);

  // expose handy globals for quick testing in console
  useEffect(() => {
    (window as any).__imp = {
      get: () => target,
      set: (t: ImpersonationTarget) => {
        log('__imp.set called', t);
        setTarget(t);
      },
      clear: () => {
        log('__imp.clear called');
        setTarget(null);
      },
    };
    log('provider: window.__imp ready (get/set/clear)');
  }, [target]);

  const value = useMemo<ImpersonationCtx>(
    () => ({
      isImpersonating: !!target,
      target,
      setImpersonation: (t) => {
        log('setImpersonation()', t);
        setTarget(t);
      },
      clearImpersonation: () => {
        log('clearImpersonation()');
        setTarget(null);
      },
    }),
    [target]
  );

  log('provider: render → isImpersonating =', !!target, 'target =', target);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useImpersonation = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useImpersonation must be used inside <ImpersonationProvider>");
  log('hook: useImpersonation() → isImpersonating =', v.isImpersonating, 'target =', v.target);
  return v;
};
