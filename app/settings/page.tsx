import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function SettingsPage() {
  return <ForecastApp initialView="settings" initialPath="/settings" />;
}
