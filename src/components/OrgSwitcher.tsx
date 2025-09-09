import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/contexts/AppContext';

interface Org {
  id: string;
  name: string;
  is_demo: boolean;
}

export function OrgSwitcher() {
  const { selectedOrgId, setSelectedOrgId } = useAppContext();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now - in real app would fetch from API
    const mockOrgs: Org[] = [
      { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Demo Company', is_demo: true },
      { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Test Org', is_demo: false }
    ];
    
    setOrgs(mockOrgs);
    if (!selectedOrgId && mockOrgs.length > 0) {
      setSelectedOrgId(mockOrgs[0].id);
    }
    setLoading(false);
  }, [selectedOrgId, setSelectedOrgId]);

  const selectedOrg = orgs.find(org => org.id === selectedOrgId);

  if (loading) {
    return <div className="w-48 h-10 bg-gray-200 animate-pulse rounded" />;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedOrgId || ''} onValueChange={setSelectedOrgId}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select organization" />
        </SelectTrigger>
        <SelectContent>
          {orgs.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              <div className="flex items-center gap-2">
                <span>{org.name}</span>
                {org.is_demo && (
                  <Badge variant="outline" className="text-xs">
                    Demo
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {selectedOrg?.is_demo && (
        <Badge variant="outline" className="text-xs text-gray-600">
          Demo
        </Badge>
      )}
    </div>
  );
}