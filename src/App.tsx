import { PageViewTracker } from "./components/PageViewTracker";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { LoginNew } from "@/components/LoginNew";
import { DemoAuth } from "@/pages/DemoAuth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  const { user, loading } = useAppContext();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading IronBooks...</p>
        </div>
      </div>
    );
  }

  return (
    <>
        <PageViewTracker />
      <Routes>
        {!user ? (
          <>
            <Route path="/" element={<LoginNew />} />
            <Route path="/login" element={<LoginNew />} />
            <Route path="/demo-auth" element={<DemoAuth />} />
            <Route path="*" element={<LoginNew />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Dashboard />} />
           <Route path="/dashboard" element={<Dashboard />} />
           <Route path="/cfo" element={<Dashboard />} />
           <Route path="/reports" element={<Dashboard />} />
           <Route path="/add-ons" element={<Dashboard />} />
           <Route path="/settings" element={<Dashboard />} />
           <Route path="/admin-panel" element={<Dashboard />} />
           <Route path="*" element={<Dashboard />} />
          </>
        )}
      </Routes>


{/* Floating CTA Button (only when not logged in) */}   
      {true && (
        <button
          onClick={() => window.location.href = "/demo-auth"}
          className="fixed bottom-6 right-6 z-[999999] bg-red-600 text-white px-8 py-4 rounded-full border-4 border-white">
        
          🚀 Start Free Demo
        </button>
      )}
    </>
  );
};

const App = () => (
  

  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppProvider>
          <BrowserRouter>
          <AppContent />
          </BrowserRouter>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
