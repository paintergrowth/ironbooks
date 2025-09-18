import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { LoginNew } from "@/components/LoginNew";
import { DemoAuth } from "@/pages/DemoAuth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Settings from "@/pages/Settings";
import AdminPanelComplete from "@/components/AdminPanelComplete";

const queryClient = new QueryClient();

const AppContent = () => {
  const { user, loading } = useAppContext();

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
    <BrowserRouter>
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
           <Route path="/settings" element={<Settings />} />
           <Route path="/admin-panel" element={<AdminPanelComplete />} />
           <Route path="*" element={<Dashboard />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  

  <ThemeProvider defaultTheme="dark">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppProvider>
          <AppContent />
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
