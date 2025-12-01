import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';

export function SocialMediaWidgets() {
  const [hoveredWidget, setHoveredWidget] = useState<string | null>(null);

  const widgets = [
    {
      id: 'discord',
      icon: 'i-ph:discord-logo',
      label: 'Join Discord',
      description: 'Get support & connect with traders',
      url: 'https://discord.com/invite/UMsrG9tgYY',
      color: 'bg-[#5865F2] hover:bg-[#4752C4]',
      textColor: 'text-white',
      members: ' '
    },
    {
      id: 'twitter',
      icon: 'i-ph:x-logo',
      label: 'Follow on X',
      description: 'Latest updates & trading insights',
      url: 'https://x.com/10xtradersai?t=8IxDwcYsvxOvXl2jTpIJZQ&s=08',
      color: 'bg-black hover:bg-gray-800',
      textColor: 'text-white',
      followers: 'Follow for updates'
    }
  ];

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-3">
      {widgets.map((widget, index) => (
        <motion.div
          key={widget.id}
          className="relative"
          onMouseEnter={() => setHoveredWidget(widget.id)}
          onMouseLeave={() => setHoveredWidget(null)}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1, duration: 0.3 }}
        >
          {/* Expanded Widget */}
          <AnimatePresence>
            {hoveredWidget === widget.id && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: 20 }}
                transition={{ duration: 0.2 }}
                className="absolute right-16 top-0 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-xl p-4 min-w-[280px] backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={classNames(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    widget.color
                  )}>
                    <div className={classNames(widget.icon, 'text-xl', widget.textColor)} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-bolt-elements-textPrimary">
                      {widget.label}
                    </h3>
                    <p className="text-xs text-bolt-elements-textSecondary">
                      {widget.description}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-bolt-elements-textTertiary">
                    {widget.id === 'discord' ? widget.members : widget.followers}
                  </span>
                  <a
                    href={widget.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={classNames(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      widget.color,
                      widget.textColor
                    )}
                  >
                    {widget.id === 'discord' ? 'Join Now' : 'Follow'}
                  </a>
                </div>
                
                {/* Arrow pointing to the main button */}
                <div className="absolute right-[-8px] top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-8 border-l-bolt-elements-background-depth-2 border-t-4 border-t-transparent border-b-4 border-b-transparent" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Floating Button */}
          <motion.a
            href={widget.url}
            target="_blank"
            rel="noopener noreferrer"
            className={classNames(
              'flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-300 cursor-pointer',
              widget.color,
              'hover:scale-110 hover:shadow-xl'
            )}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className={classNames(widget.icon, 'text-xl', widget.textColor)} />
          </motion.a>
        </motion.div>
      ))}
    </div>
  );
}