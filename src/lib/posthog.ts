
import posthog from 'posthog-js';
import { ReactNode } from 'react';

// Initialize PostHog
// Check if running client-side and keys are available
const isClient = typeof window !== 'undefined';
const apiKey = import.meta.env.VITE_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

if (isClient && apiKey) {
       posthog.init(apiKey, {
              api_host: apiHost,
              person_profiles: 'identified_only',
              capture_pageview: false, // We handle this manually in App.tsx for SPA
       });
}

export const AnalyticsProvider = ({ children }: { children: ReactNode }) => {
       return <>{ children } </>;
};

export const captureEvent = (eventName: string, properties?: Record<string, any>) => {
       if (apiKey) {
              posthog.capture(eventName, properties);
       } else {
              console.debug(`[Analytics Config Missing] Event: ${eventName}`, properties);
       }
};

export default posthog;
