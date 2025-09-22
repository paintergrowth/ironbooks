import React, { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useImpersonation } from "@/lib/impersonation";

type Row = { id: string; full_name: string | null; qbo_realm_id: string | null; email: string | null };

const labelFor = (u: Row) => `${u.full_name || "Unnamed"} — ${u.email || "no-email"}`;

const ImpersonateDropdown: React.FC<{ className?: string }> = ({ className }) => {
  const { setImpersonation } = useImpersonation();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [val, setVal] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        console.log("[ImpersonateDropdown] calling rpc('admin_list_profiles')…");
        const { data, error } = await supabase.rpc("admin_list_profiles");
        if (error) {
          console.error("[ImpersonateDropdown] rpc error:", error);
          setRows([]);
          return;
        }
        if (!cancelled) {
          console.log("[ImpersonateDropdown] users loaded:", data?.length ?? 0);
          setRows((data as Row[]) || []);
        }
      } catch (e) {
        console.error("[ImpersonateDropdown] load failed:", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onPick = (id: string) => {
    setVal(id);
    const u = rows.find(r => r.id === id);
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

  const items = useMemo(() => rows.map(u => (
    <SelectItem key={u.id} value={u.id}>{labelFor(u)}</SelectItem>
  )), [rows]);

  const placeholder = loading
    ? "Loading users…"
    : rows.length === 0
      ? "No users (admin only / check RPC grants)"
      : "View as…";

  return (
    <div className={className}>
      <Select value={val} onValueChange={onPick} disabled={loading || rows.length === 0}>
        <SelectTrigger className="w-64" title="Impersonate a user">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {items}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ImpersonateDropdown;
