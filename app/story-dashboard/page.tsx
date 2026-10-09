import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function StoryDashboardPage() {
  return <ForecastApp initialView="storytelling" initialPath="/story-dashboard" />;
}
