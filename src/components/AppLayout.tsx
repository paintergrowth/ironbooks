// src/components/AppLayout.tsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Menu, X } from 'lucide-react';
import { AppSidebar } from './sidebar-07/components/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar';
import DashboardNew from './DashboardNew';
import CFOAgent from './CFOAgent';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [reportFilter, setReportFilter] = useState<string | undefined>();
  const [reportTimeframe, setReportTimeframe] = useState<string | undefined>();

  // Get active section from URL path
  const getActiveSectionFromPath = (pathname: string) => {
    if (pathname === '/' || pathname === '/dashboard') return 'dashboard';
    if (pathname === '/cfo') return 'cfo-agent';
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
      setSidebarOpen(!mobile); // Hide sidebar by default on mobile
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
        return <DashboardNew onNavigateToReports={handleNavigateToReports} />;
      case 'cfo-agent':
        return <CFOAgent />;
      case 'reports':
        return <Reports initialFilter={reportFilter} initialTimeframe={reportTimeframe} />;
      case 'add-ons':
        return <AddOns />;
      case 'settings':
        return <Settings />;
      case 'admin-panel':
        return <AdminPanelComplete />;
      default:
        return <DashboardNew onNavigateToReports={handleNavigateToReports} />;
    }
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <h2 className="text-lg font-semibold capitalize">
              {activeSection.replace('-', ' ')}
            </h2>
          </header>
          <div className="flex-1 overflow-auto p-4">
            {renderContent()}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
