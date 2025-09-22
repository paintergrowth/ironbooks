import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ✅ Wrap the whole app so any component (e.g., ViewingAsChip) can use the hook
import { ImpersonationProvider } from '@/lib/impersonation';

console.log("src/main.tsx live: components/CFOAgent.tsx (QBO card build)");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ImpersonationProvider>
      <App />
    </ImpersonationProvider>
  </React.StrictMode>
);

window.addEventListener('error', (e) => {
  if (String(e?.error?.message || '').includes('supabaseUrl is required')) {
    console.error('[global] createClient error stack:', e.error?.stack);
  }
});
