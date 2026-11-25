import React from 'react';
import { motion } from 'motion/react';
import { AI_NAME, AI_AVATAR_URL } from '../constants';
import { translations } from '../lib/translations';
import { Language } from '../types';

interface LoadingScreenProps {
  language: Language;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ language }) => {
  const t = translations[language].loading;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[#0e0f13] text-white p-6 md:p-12 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-indigo-600/10 rounded-full blur-[80px] md:blur-[120px]" />
      </div>

      {/* Empty spacer for flex alignment */}
      <div className="h-12" />

      {/* Centered Branded Logo and Progress block */}
      <div className="flex flex-col items-center gap-6 relative z-10 max-w-sm w-full">
        <div className="relative">
          {/* Pulsing outer ambient ring */}
          <motion.div
            animate={{ 
              scale: [0.95, 1.05, 0.95],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{ 
              repeat: Infinity, 
              duration: 3, 
              ease: "easeInOut" 
            }}
            className="absolute -inset-4 bg-indigo-500/25 rounded-[32px] blur-xl -z-10"
          />

          {/* Actual Branded Logo */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-24 h-24 md:w-28 md:h-28 rounded-2xl md:rounded-[24px] overflow-hidden bg-gradient-to-tr from-[#1f1f1f] to-[#2d2d2d] border border-white/10 shadow-2xl flex items-center justify-center p-0.5"
          >
            <img 
              src={AI_AVATAR_URL} 
              alt={AI_NAME} 
              className="w-full h-full object-cover rounded-2xl md:rounded-[22px]"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // If local image fails, fallback to clean text/icon styling
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.innerHTML = `<span class="text-3xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-indigo-600 font-orbitron">${AI_NAME.charAt(0)}</span>`;
                }
              }}
            />
          </motion.div>
        </div>

        {/* Brand Name & Loading Indicator */}
        <div className="space-y-4 text-center mt-2">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-3xl md:text-4xl font-extrabold tracking-tight text-white font-sans"
          >
            {AI_NAME}
          </motion.h1>
          
          <div className="flex flex-col items-center gap-3">
            <p className="text-[10px] md:text-xs text-gray-400 font-bold tracking-[0.25em] uppercase px-4">
              {t.subtitle}
            </p>
            
            {/* Elegant, thin loading line */}
            <div className="w-40 h-[2px] bg-white/5 rounded-full overflow-hidden relative">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                className="absolute inset-x-0 top-0 bottom-0 bg-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding info */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 0.4 }}
        className="flex flex-col items-center gap-1.5 relative z-10"
      >
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.15em] text-center">
          {t.poweredBy}
        </p>
        <div className="flex gap-1 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
              className="w-1 h-1 bg-indigo-500 rounded-full"
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

