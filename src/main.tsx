import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ImpersonationProvider } from '@/lib/impersonation'

console.log('[main] boot: mounting <ImpersonationProvider> + <App>')
console.log('[main] localStorage["impersonation:v1"]:', localStorage.getItem('impersonation:v1') || '(none)')

window.addEventListener('error', (e) => {
  if (String(e?.error?.message || '').includes('supabaseUrl is required')) {
    console.error('[global] createClient error stack:', e.error?.stack)
  }
})

window.addEventListener('impersonation:changed', () => {
  console.log('[main] event: impersonation:changed → localStorage snapshot =', localStorage.getItem('impersonation:v1') || '(none)')
})

createRoot(document.getElementById('root')!).render(
  <ImpersonationProvider>
    <App />
  </ImpersonationProvider>
)
