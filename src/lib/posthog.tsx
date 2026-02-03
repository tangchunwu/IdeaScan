import posthog from 'posthog-js';
import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Initialize PostHog
const isClient = typeof window !== 'undefined';
const apiKey = import.meta.env.VITE_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

if (isClient && apiKey) {
  posthog.init(apiKey, {
    api_host: apiHost,
    person_profiles: 'identified_only',
    capture_pageview: false, // We handle this manually for SPA
    capture_pageleave: true,
    autocapture: true,
  });
}

export const AnalyticsProvider = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

// Hook for tracking page views in SPA
export const usePageView = () => {
  const location = useLocation();

  useEffect(() => {
    if (apiKey) {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        path: location.pathname,
      });
    }
  }, [location.pathname]);
};

// Capture custom events
export const captureEvent = (eventName: string, properties?: Record<string, any>) => {
  if (apiKey) {
    posthog.capture(eventName, properties);
  } else {
    console.debug(`[Analytics] Event: ${eventName}`, properties);
  }
};

// Identify user (call after login)
export const identifyUser = (userId: string, traits?: Record<string, any>) => {
  if (apiKey) {
    posthog.identify(userId, traits);
  }
};

// Reset user (call after logout)
export const resetUser = () => {
  if (apiKey) {
    posthog.reset();
  }
};

export default posthog;
