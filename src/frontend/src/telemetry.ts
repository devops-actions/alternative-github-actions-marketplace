import { ApplicationInsights, IConfiguration } from '@microsoft/applicationinsights-web';

const connectionString = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING;

let appInsights: ApplicationInsights | null = null;

if (connectionString) {
  const config: IConfiguration = {
    connectionString,
    enableAutoRouteTracking: false,
    disableAjaxTracking: false,
    disableFetchTracking: false,
    autoTrackPageVisitTime: true
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
