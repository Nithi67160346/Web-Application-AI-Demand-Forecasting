import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function AlertsPage() {
  return <ForecastApp initialView="alerts" initialPath="/alerts" />;
}
