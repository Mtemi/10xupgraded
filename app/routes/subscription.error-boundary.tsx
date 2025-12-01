// app/routes/subscription.error-boundary.tsx

import { useRouteError } from '@remix-run/react';

export function ErrorBoundary() {
  const error = useRouteError();
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-bolt-elements-background-depth-1">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-bolt-elements-textPrimary mb-4">
          Subscription Error
        </h1>
        <p className="text-bolt-elements-textSecondary mb-6">
          {error instanceof Error ? error.message : 'An error occurred while processing your subscription'}
        </p>
        <button
          onClick={() => window.location.href = '/subscription/plans'}
          className="bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text px-6 py-2 rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
