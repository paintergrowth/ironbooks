import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ✅ Wrap the whole app so any component (e.g., ViewingAsChip) can use the hook
import { ImpersonationProvider } from '@/lib/impersonation';

console.log("src/main.tsx live: components/CFOAgent.tsx (QBO card build)");
console.log('[main] boot: mounting <ImpersonationProvider> + <App>')
console.log('[main] localStorage["impersonation:v1"]:', localStorage.getItem('impersonation:v1') || '(none)')

window.addEventListener('impersonation:changed', () => {
  console.log('[main] event: impersonation:changed → localStorage snapshot =', localStorage.getItem('impersonation:v1') || '(none)')
})

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
