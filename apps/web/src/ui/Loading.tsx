import { M3eLoadingIndicator } from '@m3e/react/loading-indicator';

/** The Material 3 Expressive loading indicator, centred. */
export function Loading({ className = 'py-10' }: { className?: string }) {
  return <div className={`flex justify-center ${className}`} role="status" aria-live="polite"><M3eLoadingIndicator /></div>;
}
