import React from 'react';
import { Quote } from 'lucide-react';

export const BenefitsPanel: React.FC = () => {
  const benefits = [
    {
      icon: "https://d64gsuwffb70l.cloudfront.net/68a692708d87cda6046003a7_1756175934481_3bb93358.webp",
      text: "Bank-grade security (encryption at rest & in transit)"
    },
    {
      icon: "https://d64gsuwffb70l.cloudfront.net/68a692708d87cda6046003a7_1756175939932_0808ce5c.webp",
      text: "1-click QuickBooks connection"
    },
    {
      icon: "https://d64gsuwffb70l.cloudfront.net/68a692708d87cda6046003a7_1756175945467_ff3e4045.webp",
      text: "Real-time insights & reports"
    }
  ];

  return (
    <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 to-indigo-100 p-12 flex-col justify-center">
      <div className="max-w-md">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">
          Financial clarity for contractors
        </h2>
        
        <div className="space-y-6 mb-12">
          {benefits.map((benefit, index) => (
            <div key={index} className="flex items-start space-x-4">
              <img 
                src={benefit.icon} 
                alt="" 
                className="w-6 h-6 mt-1 flex-shrink-0"
              />
              <p className="text-gray-700 leading-relaxed">{benefit.text}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
          <Quote className="h-6 w-6 text-blue-600 mb-4" />
          <blockquote className="text-gray-800 font-medium mb-4">
            "Within a week we had clarity on cash and margin. Game changer."
          </blockquote>
          <div className="flex items-center space-x-3">
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/68a692708d87cda6046003a7_1756175950010_7f33d82d.webp"
              alt="Redwood Painting testimonial"
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <div className="font-semibold text-gray-900">Atlas Painting</div>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-600 text-center">
          Trusted by 200+ painting businesses
        </p>
      </div>
    </div>
  );
};