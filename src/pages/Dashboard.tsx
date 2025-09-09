import React from 'react';
import AppLayout from '@/components/AppLayout';

/**
 * Dashboard page:
 * Renders the main application layout (left sidebar, top bar, content routes).
 * This is the authenticated app experience.
 */
const Dashboard: React.FC = () => {
  console.log("Dashboard page: main app layout");
  return <AppLayout />;
};

export default Dashboard;
