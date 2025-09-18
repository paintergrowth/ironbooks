import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { useTheme } from './theme-provider';
import { useAppContext } from '@/contexts/AppContext';
import { 
  LayoutDashboard, 
  Bot, 
  FileText, 
  Plus, 
  Settings, 
  Sun, 
  Moon,
  LogOut
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onClose?: () => void;
  isMobile?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onClose, isMobile }) => {
  const { theme, setTheme } = useTheme();
  const { logout } = useAppContext();
  const navigate = useNavigate();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { id: 'cfo-agent', label: 'CFO Agent', icon: Bot, path: '/cfo' },
    { id: 'reports', label: 'Reports', icon: FileText, path: '/reports' },
    { id: 'add-ons', label: 'Add-Ons', icon: Plus, path: '/add-ons' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
    
  ];

  const handleItemClick = (path: string) => {
    navigate(path);
    if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <div className={`w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full ${
      isMobile ? 'shadow-xl' : ''
    }`}>
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">IronBooks</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <Button
              key={item.id}
              variant={isActive ? "default" : "ghost"}
              className={`w-full justify-start text-left h-12 transition-all duration-200 ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' 
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
              onClick={() => handleItemClick(item.path)}
            >
              <Icon className="mr-3 h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </Button>
          );
        })}
      </nav>

      {/* Theme Toggle & Logout */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-full justify-start"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="mr-2 h-4 w-4" />
              Light Mode
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" />
              Dark Mode
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
