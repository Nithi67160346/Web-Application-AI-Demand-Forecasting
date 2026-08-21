import { ForecastApp } from "../../forecast-app";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ forecastId: "demo-forecast" }];
}

export default function ForecastDetailPage() {
  return <ForecastApp initialView="forecast" initialPath="/forecast/demo-forecast" />;
}
