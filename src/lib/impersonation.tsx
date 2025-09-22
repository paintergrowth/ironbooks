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

const Ctx = createContext<ImpersonationCtx | undefined>(undefined);
const LS_KEY = "impersonation:v1";

export const ImpersonationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [target, setTarget] = useState<ImpersonationTarget | null>(null);

  // load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setTarget(JSON.parse(raw));
    } catch {}
  }, []);

  // persist to localStorage
  useEffect(() => {
    try {
      if (target) localStorage.setItem(LS_KEY, JSON.stringify(target));
      else localStorage.removeItem(LS_KEY);
    } catch {}
    // broadcast (optional) for other tabs
    window.dispatchEvent(new CustomEvent("impersonation:changed"));
  }, [target]);

  const value = useMemo<ImpersonationCtx>(
    () => ({
      isImpersonating: !!target,
      target,
      setImpersonation: (t) => setTarget(t),
      clearImpersonation: () => setTarget(null),
    }),
    [target]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useImpersonation = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useImpersonation must be used inside <ImpersonationProvider>");
  return v;
};
