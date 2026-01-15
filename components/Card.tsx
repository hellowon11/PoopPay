import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, icon }) => {
  return (
    <div className={`bg-white border-2 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${className}`}>
      {(title || icon) && (
        <div className="flex items-center gap-2 mb-3 border-b-2 border-dashed border-gray-200 pb-2">
          {icon}
          {title && <h3 className="font-bold text-xl text-brand-brown">{title}</h3>}
        </div>
      )}
      {children}
    </div>
  );
};