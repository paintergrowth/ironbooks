import React from 'react';

interface AuthLayoutProps {
  children: React.ReactNode;
  showCaseComponent?: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ 
  children, 
  showCaseComponent 
}) => {
  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-[580px_1fr]">
      {/* Left Panel - Auth Form */}
      <aside className="bg-card flex flex-col justify-center px-12 py-8 relative">
        {/* IronBooks Logo */}
        <div className="absolute top-8 left-12">
          <div className="flex items-center space-x-3">
            <img 
              src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/public/assets/img/LOGO-2.png" 
              alt="IronBooks" 
              className="h-8 w-auto"
            />
          </div>
        </div>

        {/* Auth Panel Content */}
        <div className="w-full max-w-md mx-auto">
          {children}
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 left-12 right-12">
          <p className="text-xs text-muted-foreground text-center">
            Trusted by contractors who want financial clarity, not spreadsheet headaches.
          </p>
        </div>
      </aside>

      {/* Right Panel - Product Showcase */}
      <section className="relative hidden lg:block overflow-hidden bg-background">
        <div className="absolute inset-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm">
          <div className="w-full h-full rounded-xl overflow-hidden">
            {showCaseComponent}
          </div>
        </div>
      </section>
    </div>
  );
};
