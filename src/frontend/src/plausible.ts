import { init, track } from '@plausible-analytics/tracker';

const trackingDomain = import.meta.env.VITE_PLAUSIBLE_TRACKING_DOMAIN;

let isInitialized = false;

if (trackingDomain) {
  init({
    domain: trackingDomain,
    autoCapturePageviews: false
  });
  isInitialized = true;
}

export function trackPageView() {
  if (isInitialized) {
    track('pageview', {});
  }
}

export function isPlausibleEnabled(): boolean {
  return isInitialized;
}
