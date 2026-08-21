import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function ForecastPage() {
  return <ForecastApp initialView="forecast" initialPath="/forecast" />;
}
