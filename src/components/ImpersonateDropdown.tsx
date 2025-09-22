import React, { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useImpersonation } from "@/lib/impersonation";

type LiteUser = {
  id: string;
  full_name: string | null;
  qbo_realm_id: string | null;
  email?: string | null; // optional, since many projects don't store email in profiles
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

    async function loadUsers() {
      setLoading(true);
      console.log("[ImpersonateDropdown] loading users…");

      try {
        // 1) Try WITH email (works only if you have profiles.email)
        let query = supabase
          .from("profiles")
          .select("id,full_name,qbo_realm_id,email")
          .order("full_name", { ascending: true, nullsFirst: true })
          .limit(250);

        let { data, error } = await query;

        // 2) If email column doesn't exist (42703), retry WITHOUT it
        if (error && (error as any).code === "42703") {
          console.warn("[ImpersonateDropdown] profiles.email missing, retrying without it…");
          const { data: dataNoEmail, error: errNoEmail } = await supabase
            .from("profiles")
            .select("id,full_name,qbo_realm_id")
            .order("full_name", { ascending: true, nullsFirst: true })
            .limit(250);

          if (errNoEmail) {
            console.error("[ImpersonateDropdown] retry without email failed:", errNoEmail);
            throw errNoEmail;
          }
          data = dataNoEmail as any[];
        } else if (error) {
          console.error("[ImpersonateDropdown] load error:", error);
          throw error;
        }

        const list = (data || []) as LiteUser[];
        if (!cancelled) {
          setUsers(list);
          console.log("[ImpersonateDropdown] users loaded:", list.length);
          if (list.length === 0) {
            console.warn(
              "[ImpersonateDropdown] 0 users returned. If unexpected, check RLS on public.profiles for your admin role."
            );
          }
        }
      } catch (e) {
        if (!cancelled) {
          setUsers([]);
        }
      } finally {
        !cancelled && setLoading(false);
      }
    }

    loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPick = (id: string) => {
    setValue(id);
    const u = users.find((x) => x.id === id);
    console.log("[ImpersonateDropdown] selected:", u);
    if (u) {
      setImpersonation({
        userId: u.id,
        email: u.email || "", // may be empty if profiles has no email
        name: u.full_name || null,
        realmId: u.qbo_realm_id || null,
      });
    }
  };

  const options = useMemo(
    () =>
      users.map((u) => (
        <SelectItem key={u.id} value={u.id}>
          {labelFor(u)}
        </SelectItem>
      )),
    [users]
  );

  // Helpful placeholder text depending on state
  const placeholder = loading
    ? "Loading users…"
    : users.length === 0
    ? "No users (check RLS/columns)"
    : "View as…";

  return (
    <div className={className}>
      <Select
        value={value}
        onValueChange={onPick}
        disabled={loading || users.length === 0}
      >
        <SelectTrigger className="w-64" title="Impersonate a user">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {options}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ImpersonateDropdown;
