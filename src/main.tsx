
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
console.log("src/main.tsx live: components/CFOAgent.tsx (QBO card build)");
// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
window.addEventListener('error', (e) => {
  if (String(e?.error?.message || '').includes('supabaseUrl is required')) {
    console.error('[global] createClient error stack:', e.error?.stack);
  }
});

