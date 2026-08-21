import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function MonitoringPage() {
  return <ForecastApp initialView="monitoring" initialPath="/monitoring" />;
}
