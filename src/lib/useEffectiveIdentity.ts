import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useImpersonation } from "@/lib/impersonation";

type State = {
  loaded: boolean;
  userId: string | null;
  email: string | null;
  name: string | null;
  realmId: string | null;
  isImpersonating: boolean;
};

export function useEffectiveIdentity(): State {
  const { isImpersonating, target } = useImpersonation();
  const [s, setS] = useState<State>({
    loaded: false, userId: null, email: null, name: null, realmId: null, isImpersonating: false
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isImpersonating && target) {
        console.log("[useEffectiveIdentity] impersonating →", target);
        if (!cancelled) {
          setS({
            loaded: true,
            userId: target.userId,
            email: target.email ?? null,
            name: target.name ?? null,
            realmId: target.realmId ?? null,
            isImpersonating: true,
          });
        }
        return;
      }

      // real identity
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) console.warn("[useEffectiveIdentity] getUser error:", error);
      if (!user) {
        if (!cancelled) setS({ loaded: true, userId: null, email: null, name: null, realmId: null, isImpersonating: false });
        return;
      }

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("full_name,qbo_realm_id")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) console.warn("[useEffectiveIdentity] profiles error:", pErr);

      if (!cancelled) {
        setS({
          loaded: true,
          userId: user.id,
          email: user.email ?? null,
          name: prof?.full_name ?? null,
          realmId: prof?.qbo_realm_id ?? null,
          isImpersonating: false,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [isImpersonating, target?.userId, target?.realmId]);

  return s;
}
