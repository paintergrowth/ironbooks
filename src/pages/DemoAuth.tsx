import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ArrowLeft, Info } from 'lucide-react';

export const DemoAuth: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAppContext();

  const handleDemoLogin = () => {
    // Create a demo user that matches the User type from Supabase
    const demoUser = {
      id: 'demo-user',
      email: 'demo@ironbooks.com',
      user_metadata: {
        full_name: 'Demo User'
      },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      email_confirmed_at: new Date().toISOString(),
      phone_confirmed_at: null,
      confirmation_sent_at: null,
      recovery_sent_at: null,
      email_change_sent_at: null,
      new_email: null,
      invited_at: null,
      action_link: null,
      phone: null,
      role: 'authenticated',
      last_sign_in_at: new Date().toISOString()
    };
    
    setUser(demoUser as any);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Demo Access</CardTitle>
          <CardDescription>
            Experience IronBooks with read-only demo data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Demo Features:</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• View sample financial data</li>
                  <li>• Explore all dashboard features</li>
                  <li>• Read-only access (no changes saved)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button 
              onClick={handleDemoLogin}
              className="w-full"
              size="lg"
            >
              Enter Demo Dashboard
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => navigate('/login')}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sign In
            </Button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            <p>Demo data is read-only and resets on page refresh</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};