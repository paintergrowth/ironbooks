import React from 'react';

export const LoginFooter: React.FC = () => {
  return (
    <footer className="w-full bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div className="text-sm text-gray-600">
            © 2024 IronBooks. All rights reserved.
          </div>
          
          <div className="flex space-x-6">
            <a 
              href="/terms" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Terms of Service
            </a>
            <a 
              href="/privacy" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Privacy Policy
            </a>
            <a 
              href="/dpa" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Data Processing Agreement
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};