import { ApplicationInsights, IConfiguration } from '@microsoft/applicationinsights-web';

const connectionString = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING;

let appInsights: ApplicationInsights | null = null;

// Initialization is triggered lazily (see App.tsx), so this module is only
// downloaded and evaluated when telemetry is actually needed. This keeps the
// ~200KB Application Insights SDK out of the initial bundle.
export function initTelemetry(): void {
  if (!connectionString || appInsights) {
    return;
  }

  const config: IConfiguration = {
    connectionString
  };

  appInsights = new ApplicationInsights({ config });
  appInsights.loadAppInsights();
  appInsights.trackPageView({ name: 'startup', uri: window.location.href });
}

export function trackPageView(name: string, uri: string) {
  if (appInsights) {
    appInsights.trackPageView({ name, uri });
  }
}

export function getAppInsights(): ApplicationInsights | null {
  return appInsights;
}
