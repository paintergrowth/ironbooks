import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useImpersonation } from "@/lib/impersonation";

const ViewingAsChip: React.FC<{ className?: string }> = ({ className }) => {
  const { isImpersonating, target, clearImpersonation } = useImpersonation();

  console.log('[ViewingAsChip] render → isImpersonating =', isImpersonating, 'target =', target);

  if (!isImpersonating || !target) return null;

  return (
    <div
      className={
        "flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 " +
        (className ?? "")
      }
      title="You are viewing the app as another user"
    >
      <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-100">
        Viewing as
      </Badge>
      <span className="text-sm font-medium text-amber-900">
        {target.name || "User"}
      </span>
      <span className="text-sm text-amber-800">— {target.email}</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={() => {
          console.log('[ViewingAsChip] Back to me clicked');
          clearImpersonation();
        }}
      >
        Back to me
      </Button>
    </div>
  );
};

export default ViewingAsChip;
