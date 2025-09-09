import React from 'react';
import AppLayout from '@/components/AppLayout';

/**
 * Index page:
 * Renders the main application layout (left sidebar, top bar, content routes).
 * NOTE: AppProvider is already mounted in app.tsx, so we do NOT wrap it again here.
 */
const Index: React.FC = () => {
  console.log("src/pages/index.tsx live: components/CFOAgent.tsx (QBO card build)");
  return <AppLayout />;
};

export default Index;
