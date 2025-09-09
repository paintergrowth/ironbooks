import React from 'react';
import { Shield, Lock, CheckCircle } from 'lucide-react';

export const SecurityBar: React.FC = () => {
  return (
    <div className="w-full bg-blue-50 border-b border-blue-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-center space-x-6 text-sm text-blue-700">
          <div className="flex items-center space-x-1">
            <Shield className="h-4 w-4" />
            <span>SOC-ready practices</span>
          </div>
          <div className="flex items-center space-x-1">
            <Lock className="h-4 w-4" />
            <span>Data encrypted</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircle className="h-4 w-4" />
            <span>QuickBooks OAuth</span>
          </div>
        </div>
      </div>
    </div>
  );
};