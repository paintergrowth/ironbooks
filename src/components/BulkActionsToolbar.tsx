import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Mail, Key, UserX, UserCheck, Download, X, 
  AlertTriangle 
} from 'lucide-react';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onResendInvite: () => void;
  onForcePasswordReset: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onExportCSV: () => void;
  onClear: () => void;
}

const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedCount,
  onResendInvite,
  onForcePasswordReset,
  onSuspend,
  onUnsuspend,
  onExportCSV,
  onClear
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            {selectedCount} selected
          </Badge>
          
          <div className="flex space-x-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={onResendInvite}
              className="text-xs"
            >
              <Mail className="w-3 h-3 mr-1" />
              Resend Invite
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={onForcePasswordReset}
              className="text-xs"
            >
              <Key className="w-3 h-3 mr-1" />
              Reset Password
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={onSuspend}
              className="text-xs text-orange-600 hover:text-orange-700"
            >
              <UserX className="w-3 h-3 mr-1" />
              Suspend
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={onUnsuspend}
              className="text-xs text-green-600 hover:text-green-700"
            >
              <UserCheck className="w-3 h-3 mr-1" />
              Unsuspend
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={onExportCSV}
              className="text-xs"
            >
              <Download className="w-3 h-3 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
        
        <Button 
          size="sm" 
          variant="ghost"
          onClick={onClear}
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="mt-2 text-xs text-gray-600">
        <div className="flex items-center space-x-4">
          <span className="flex items-center">
            <AlertTriangle className="w-3 h-3 mr-1 text-amber-500" />
            Suspending disables login but preserves data
          </span>
        </div>
      </div>
    </div>
  );
};

export default BulkActionsToolbar;