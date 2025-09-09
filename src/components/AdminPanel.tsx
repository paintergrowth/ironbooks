import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrgSwitcher } from './OrgSwitcher';
import UserDetailsModal from './UserDetailsModal';
import AddUserModal from './AddUserModal';
import { 
  Users, 
  Plus, 
  Search, 
  Eye, 
  Key,
  CheckCircle,
  XCircle,
  Activity,
  Shield,
  ArrowUpDown,
  Download
} from 'lucide-react';

const AdminPanel: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [timeframe, setTimeframe] = useState('This Month');
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  
  const [users, setUsers] = useState([
    {
      id: '1',
      email: 'john@example.com',
      fullName: 'John Doe',
      role: 'Owner',
      plan: 'Pro',
      isActive: true,
      lastLogin: '2024-01-15T10:30:00Z',
      qboConnected: true,
      cfoAgentUses: 45,
      createdAt: '2024-01-01T00:00:00Z',
      revenueMTD: 125000,
      netProfitMTD: 25000,
      netMargin: 20.0
    },
    {
      id: '2', 
      email: 'jane@example.com',
      fullName: 'Jane Smith',
      role: 'Manager',
      plan: 'Standard',
      isActive: true,
      lastLogin: '2024-01-14T15:45:00Z',
      qboConnected: false,
      cfoAgentUses: 12,
      createdAt: '2024-01-02T00:00:00Z',
      revenueMTD: 85000,
      netProfitMTD: 4250,
      netMargin: 5.0
    },
    {
      id: '3',
      email: 'bob@example.com', 
      fullName: 'Bob Johnson',
      role: 'User',
      plan: 'Basic',
      isActive: false,
      lastLogin: '2024-01-10T09:15:00Z',
      qboConnected: true,
      cfoAgentUses: 78,
      createdAt: '2023-12-15T00:00:00Z',
      revenueMTD: 45000,
      netProfitMTD: -2250,
      netMargin: -5.0
    }
  ]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getMarginBadge = (margin: number) => {
    if (margin >= 10) {
      return <Badge className="bg-success text-white">{margin.toFixed(1)}%</Badge>;
    } else if (margin >= 0) {
      return <Badge className="bg-amber-500 text-white">{margin.toFixed(1)}%</Badge>;
    } else {
      return <Badge className="bg-destructive text-white">{margin.toFixed(1)}%</Badge>;
    }
  };

  const handleSort = (key: string) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedUsers = [...users].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    const aValue = a[sortConfig.key as keyof typeof a];
    const bValue = b[sortConfig.key as keyof typeof b];
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredUsers = sortedUsers.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-gray-600">Manage users and system settings</p>
        </div>
        <div className="flex items-center gap-4">
          <OrgSwitcher />
          <Button onClick={() => setShowAddUser(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Active Users</p>
                <p className="text-2xl font-bold">{users.filter(u => u.isActive).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeframe Selector */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium">Timeframe:</label>
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="This Month">This Month</SelectItem>
              <SelectItem value="Last Month">Last Month</SelectItem>
              <SelectItem value="YTD">YTD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => console.log('Export admin snapshot as PDF')} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export Snapshot
        </Button>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">User</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Last Login</th>
                  <th className="text-left p-2">QBO</th>
                  <th className="text-left p-2">CFO Uses</th>
                  <th className="text-left p-2">Plan</th>
                  <th className="text-right p-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('revenueMTD')}>
                    <div className="flex items-center justify-end">
                      Revenue (MTD) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th className="text-right p-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('netProfitMTD')}>
                    <div className="flex items-center justify-end">
                      Net Profit (MTD) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th className="text-center p-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('netMargin')}>
                    <div className="flex items-center justify-center">
                      Net Margin (%) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <div>
                        <p className="font-medium">{user.fullName}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline">{user.role}</Badge>
                    </td>
                    <td className="p-2">
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 mr-1" />
                            Inactive
                          </>
                        )}
                      </Badge>
                    </td>
                    <td className="p-2 text-sm">{formatDate(user.lastLogin)}</td>
                    <td className="p-2">
                      <Badge variant={user.qboConnected ? "default" : "outline"}>
                        {user.qboConnected ? 'Connected' : 'Not Connected'}
                      </Badge>
                    </td>
                    <td className="p-2 font-medium">{user.cfoAgentUses}</td>
                    <td className="p-2">
                      <Badge variant="secondary">{user.plan}</Badge>
                    </td>
                    <td className="p-2 text-right font-bold">
                      {user.revenueMTD ? formatCurrency(user.revenueMTD) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-right font-bold">
                      {user.netProfitMTD !== undefined ? (
                        <span className={user.netProfitMTD < 0 ? 'text-destructive' : ''}>
                          {formatCurrency(user.netProfitMTD)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {user.netMargin !== undefined ? getMarginBadge(user.netMargin) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setSelectedUser(user)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Key className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {selectedUser && (
        <UserDetailsModal 
          user={selectedUser} 
          isOpen={!!selectedUser} 
          onClose={() => setSelectedUser(null)} 
        />
      )}
      
      {showAddUser && (
        <AddUserModal 
          isOpen={showAddUser} 
          onClose={() => setShowAddUser(false)} 
        />
      )}
    </div>
  );
};

export default AdminPanel;