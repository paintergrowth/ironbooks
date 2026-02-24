import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, TrendingUp, Building } from 'lucide-react';

const AddOns: React.FC = () => {
  const addOns = [
    {
      id: 'payroll',
      title: 'Payroll Services',
      headline: 'Save 10+ hours a month with automated payroll & compliance management.',
      description: 'We handle payroll processing, tax filing, and compliance so you never worry about deadlines or penalties. Get back your time and protect your business.',
      icon: Users,
      price: 'Starting at $99/month — less than the cost of one payroll mistake.',
      cta: '👉 Start Payroll Setup',
      popular: false
    },
    {
      id: 'cfo-services',
      title: 'CFO Services',
      headline: 'Get executive-level financial clarity without the $150K salary.',
      description: 'Strategic planning, budgeting, and advisory from seasoned CFOs who know your industry. Turn numbers into decisions and scale with confidence.',
      icon: TrendingUp,
      price: 'Starting at $500/month — compared to $5K+ for a part-time CFO.',
      cta: '👉 Talk to a CFO Today',
      popular: true
    },
    {
      id: 'entity',
      title: 'Additional Entity',
      headline: 'Seamlessly manage multiple businesses in one platform.',
      description: 'Add bookkeeping services for another entity without the hassle of juggling multiple systems. One login, one dashboard, total visibility.',
      icon: Building,
      price: 'Starting at $200/month — simple add-on for multi-entity operators.',
      cta: '👉 Add Another Entity',
      popular: false
    }
  ];

  const handleRequestAddOn = (addOnId: string) => {
    // In a real app, this would open a form or contact modal
    alert(`Request submitted for ${addOns.find(a => a.id === addOnId)?.title}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Add-On Services</h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Expand your financial operations with our premium add-on services designed to scale with your business
        </p>
      </div>

      {/* Add-On Cards Grid */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 mb-16">
        {addOns.map((addOn) => {
          const Icon = addOn.icon;
          return (
            <Card key={addOn.id} className="relative h-full hover:shadow-lg transition-shadow duration-300 border-0 shadow-md">
              {addOn.popular && (
                <Badge className="absolute -top-3 -right-3 bg-success text-white px-3 py-1 text-sm font-semibold shadow-md z-10">
                  Most Popular
                </Badge>
              )}
              <CardHeader className="pb-4">
                <div className="flex items-center mb-3">
                  <div className="p-2 bg-primary/10 dark:bg-primary/20 rounded-lg mr-3">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                    {addOn.title}
                  </CardTitle>
                </div>
                <p className="text-lg font-semibold text-gray-800 dark:text-white leading-tight">
                  {addOn.headline}
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-6">
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-base">
                    {addOn.description}
                  </p>
                  
                  <div className="border-t dark:border-gray-700 pt-4">
                    <p className="text-sm font-bold text-primary mb-4">
                      {addOn.price}
                    </p>
                    <Button 
                      className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 text-base shadow-sm" 
                      onClick={() => handleRequestAddOn(addOn.id)}
                    >
                      {addOn.cta}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Custom Solutions Section */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-8 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Custom Solutions</h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
            Your business is unique — we'll tailor a financial solution that fits your specific needs and goals.
          </p>
            <a
              href="https://api.leadconnectorhq.com/widget/bookings/45mins-profit-xray-call"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button 
                variant="outline" 
                size="lg"
                className="bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 font-semibold px-8 py-3 text-base"
              >
                👉 Book a Free Consultation
              </Button>
            </a>
        </div>
      </div>
    </div>
  );
};

export default AddOns;
