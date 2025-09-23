// src/lib/impersonation.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

const log = (...args: any[]) => console.log("[impersonation]", ...args);

const Ctx = createContext<ImpersonationCtx | undefined>(undefined);
const LS_KEY = "impersonation:v1";

export const ImpersonationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  log("provider: mount");
  const [target, setTarget] = useState<ImpersonationTarget | null>(null);

  // load from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      log("provider: initial read localStorage =", raw || "(none)");
      if (raw) {
        const parsed = JSON.parse(raw);
        log("provider: parsed initial target =", parsed);
        setTarget(parsed);
      }
    } catch (e) {
      console.warn("[impersonation] provider: failed to read/parse LS", e);
    }
  }, []);

  // persist + broadcast whenever target changes
  useEffect(() => {
    try {
      if (target) {
        localStorage.setItem(LS_KEY, JSON.stringify(target));
        log("provider: saved to LS", target);
      } else {
        localStorage.removeItem(LS_KEY);
        log("provider: cleared LS");
      }
    } catch (e) {
      console.warn("[impersonation] provider: failed to write LS", e);
    }
    window.dispatchEvent(new CustomEvent("impersonation:changed"));
    log("provider: dispatched event impersonation:changed");
  }, [target]);

  // expose handy globals for quick testing in console
  useEffect(() => {
    (window as any).__imp = {
      get: () => target,
      set: (t: ImpersonationTarget) => {
        log("__imp.set called", t);
        setTarget(t);
      },
      clear: () => {
        log("__imp.clear called");
        setTarget(null);
      },
    };
    log("provider: window.__imp ready (get/set/clear)");
  }, [target]);

  const value = useMemo<ImpersonationCtx>(
    () => ({
      isImpersonating: !!target,
      target,
      setImpersonation: (t) => {
        log("setImpersonation()", t);
        setTarget(t);
      },
      clearImpersonation: () => {
        log("clearImpersonation()");
        setTarget(null);
      },
    }),
    [target]
  );

  log("provider: render → isImpersonating =", !!target, "target =", target);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useImpersonation = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useImpersonation must be used inside <ImpersonationProvider>");
  log("hook: useImpersonation() → isImpersonating =", v.isImpersonating, "target =", v.target);
  return v;
};

/**
 * Resolves the *effective* identity to use for data fetching.
 * - If impersonating: returns target.userId and that user's realmId (fetched if missing).
 * - Else: returns real userId and their realmId.
 */
export const useEffectiveIdentity = () => {
  const { isImpersonating, target } = useImpersonation();

  const [realUserId, setRealUserId] = useState<string | null>(null);
  const [realRealmId, setRealRealmId] = useState<string | null>(null);

  const [impersonatedRealmId, setImpersonatedRealmId] = useState<string | null>(null);

  // Get real authed userId
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.warn("[impersonation] useEffectiveIdentity: getUser error", error);
      }
      if (mounted) {
        setRealUserId(data?.user?.id ?? null);
        log("useEffectiveIdentity: realUserId =", data?.user?.id ?? null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch realm for **real** user when not impersonating
  useEffect(() => {
    let cancelled = false;
    if (!isImpersonating && realUserId) {
      (async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("qbo_realm_id")
          .eq("id", realUserId)
          .single();
        if (!cancelled) {
          if (error) {
            console.warn("[impersonation] real profile load error", error);
          }
          setRealRealmId(data?.qbo_realm_id ?? null);
          log("useEffectiveIdentity: realRealmId =", data?.qbo_realm_id ?? null);
        }
      })();
    } else if (!isImpersonating) {
      setRealRealmId(null);
    }
    return () => {
      cancelled = true;
    };
  }, [isImpersonating, realUserId]);

  // Fetch realm for **impersonated** user if target has no realmId
  useEffect(() => {
    let cancelled = false;
    if (isImpersonating && target?.userId) {
      if (target.realmId) {
        setImpersonatedRealmId(target.realmId);
        log("useEffectiveIdentity: using provided impersonated realmId =", target.realmId);
      } else {
        (async () => {
          const { data, error } = await supabase
            .from("profiles")
            .select("qbo_realm_id")
            .eq("id", target.userId)
            .single();
          if (!cancelled) {
            if (error) {
              console.warn("[impersonation] impersonated profile load error", error);
            }
            setImpersonatedRealmId(data?.qbo_realm_id ?? null);
            log("useEffectiveIdentity: fetched impersonated realmId =", data?.qbo_realm_id ?? null);
          }
        })();
      }
    } else {
      setImpersonatedRealmId(null);
    }
    return () => {
      cancelled = true;
    };
  }, [isImpersonating, target?.userId, target?.realmId]);

  const userId = isImpersonating ? (target?.userId ?? null) : realUserId;
  const realmId = isImpersonating ? impersonatedRealmId : realRealmId;

  log("useEffectiveIdentity: return { userId, realmId, isImpersonating } =", {
    userId,
    realmId,
    isImpersonating,
  });

  return {
    userId,
    realmId,
    isImpersonating,
    target,
  };
};
