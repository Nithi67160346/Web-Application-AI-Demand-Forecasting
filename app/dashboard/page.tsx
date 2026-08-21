import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function DashboardPage() {
  return <ForecastApp initialView="dashboard" initialPath="/dashboard" />;
}
