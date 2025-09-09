import React from 'react';

export const ShowcaseImage: React.FC = () => {
  return (
    <div className="relative w-full h-full">
      <img
        src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/public/assets/img/ironbooks1.jpg"
        alt="IronBooks Financial Cockpit - AI-powered bookkeeping dashboard"
        className="w-full h-full object-cover"
      />
    </div>
  );
};
