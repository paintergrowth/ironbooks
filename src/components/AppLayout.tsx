// src/components/AppLayout.tsx
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
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
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [reportFilter, setReportFilter] = useState<string | undefined>();
  const [reportTimeframe, setReportTimeframe] = useState<string | undefined>();

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
      setActiveSection('admin-panel');
    } else {
      setActiveSection('dashboard');
    }
  };

  const handleNavigateToReports = (filter: string, timeframe: string) => {
    setReportFilter(filter);
    setReportTimeframe(timeframe);
    setActiveSection('reports');
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard onNavigateToReports={handleNavigateToReports} />;
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
        return <Dashboard onNavigateToReports={handleNavigateToReports} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 relative">
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isMobile ? 'fixed z-50' : 'relative'}
        transition-transform duration-300 ease-in-out
        h-full
      `}>
        <Sidebar
          activeTab={activeSection}
          setActiveTab={setActiveSection}
          onClose={() => setSidebarOpen(false)}
          isMobile={isMobile}
        />
      </div>
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Menu Toggle */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
            {activeSection.replace('-', ' ')}
          </h2>
          <div className="w-9" /> {/* Spacer for centering */}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
