import { memo } from 'react';
import { classNames } from '~/utils/classNames';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Spinner = memo(({ className, size = 'md' }: SpinnerProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  return (
    <div 
      className={classNames(
        'animate-spin text-bolt-elements-loader-progress',
        sizeClasses[size],
        className
      )}
    >
      <div className="i-svg-spinners:90-ring-with-bg w-full h-full" />
    </div>
  );
});

Spinner.displayName = 'Spinner';