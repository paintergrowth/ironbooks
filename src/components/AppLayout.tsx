// src/components/AppLayout.tsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from './sidebar-07/components/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar';
import { Menu } from 'lucide-react';
import { Button } from './ui/button';
import Dashboard from './Dashboard';
import CFOAgent from './CFOAgent';
import AIAccountant from './ai-accountant/AIAccountant';
import Reports from './Reports';
import AddOns from './AddOns';
import Settings from './Settings';
import AdminPanelComplete from './AdminPanelComplete';

// AFTER (force the exact files you edited)
//import Settings from "../components/Settings";
//import CFOAgent from "../components/CFOAgent";

const AppLayout: React.FC = () => {
  console.log("src/components/AppLayout.tsx live: components/CFOAgent.tsx (QBO card build)");
  const location = useLocation();
  const navigate = useNavigate();
  const [aiAccountantSidebarOpen, setAiAccountantSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [reportFilter, setReportFilter] = useState<string | undefined>();
  const [reportTimeframe, setReportTimeframe] = useState<string | undefined>();

  // Get active section from URL path
  const getActiveSectionFromPath = (pathname: string) => {
    if (pathname === '/' || pathname === '/dashboard') return 'dashboard';
    if (pathname === '/cfo') return 'cfo-agent';
    if (pathname === '/ai-accountant') return 'ai-accountant';
    if (pathname === '/reports') return 'reports';
    if (pathname === '/add-ons') return 'add-ons';
    if (pathname === '/settings') return 'settings';
    if (pathname === '/admin-panel') return 'admin-panel';
    return 'dashboard';
  };

  const activeSection = getActiveSectionFromPath(location.pathname);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleToggleAdminMode = () => {
    setIsAdminMode(!isAdminMode);
    if (!isAdminMode) {
      navigate('/admin-panel');
    } else {
      navigate('/dashboard');
    }
  };

  const handleNavigateToReports = (filter: string, timeframe: string) => {
    setReportFilter(filter);
    setReportTimeframe(timeframe);
    navigate('/reports');
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard onNavigateToReports={handleNavigateToReports} />;
      case 'cfo-agent':
        return <CFOAgent />;
      case 'ai-accountant':
        return <AIAccountant sidebarOpen={aiAccountantSidebarOpen} setSidebarOpen={setAiAccountantSidebarOpen} />;
      case 'reports':
        return <Reports initialFilter={reportFilter} initialTimeframe={reportTimeframe} />;
      case 'add-ons':
        return <AddOns />;
      case 'settings':
        return <Settings />;
      case 'admin-panel':
        return <AdminPanelComplete />;
      default:
        return <Dashboard onNavigateToReports={handleNavigateToReports} />;
    }
  };

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <AppSidebar />
      <SidebarInset>
        {/* Header with Menu Toggle */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
              {activeSection.replace('-', ' ')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {activeSection === 'ai-accountant' && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setAiAccountantSidebarOpen(true)}
              >
                <Menu size={20} />
              </Button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className={`flex-1 min-h-0 ${activeSection === 'ai-accountant' ? '' : 'p-4 md:p-6'}`}>
          {activeSection === 'ai-accountant' ? (
            renderContent()
          ) : (
            <div className="h-full">
              {renderContent()}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppLayout;
