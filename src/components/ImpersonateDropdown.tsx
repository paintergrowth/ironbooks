import React, { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useImpersonation } from "@/lib/impersonation";

type LiteUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  qbo_realm_id: string | null;
};

const labelFor = (u: LiteUser) =>
  `${u.full_name || "Unnamed"}${u.email ? ` — ${u.email}` : ""}`;

const ImpersonateDropdown: React.FC<{ className?: string }> = ({ className }) => {
  const { setImpersonation } = useImpersonation();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<LiteUser[]>([]);
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        console.log("[ImpersonateDropdown] loading users…");
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name, qbo_realm_id")
          .order("full_name", { ascending: true, nullsFirst: true })
          .limit(250);

        if (error) throw error;
        if (!cancelled) {
          const list = (data || []) as LiteUser[];
          setUsers(list);
          console.log("[ImpersonateDropdown] users loaded:", list.length);
        }
      } catch (e) {
        console.error("[ImpersonateDropdown] load error:", e);
      } finally {
        !cancelled && setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onPick = (id: string) => {
    setValue(id);
    const u = users.find((x) => x.id === id);
    console.log("[ImpersonateDropdown] selected:", u);
    if (u) {
      setImpersonation({
        userId: u.id,
        email: u.email || "",
        name: u.full_name || null,
        realmId: u.qbo_realm_id || null,
      });
    }
  };

  const options = useMemo(
    () => users.map((u) => (
      <SelectItem key={u.id} value={u.id}>
        {labelFor(u)}
      </SelectItem>
    )),
    [users]
  );

  return (
    <div className={className}>
      <Select value={value} onValueChange={onPick} disabled={loading || users.length === 0}>
        <SelectTrigger className="w-64" title="Impersonate a user">
          <SelectValue placeholder={loading ? "Loading users…" : "View as…"} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {options}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ImpersonateDropdown;
