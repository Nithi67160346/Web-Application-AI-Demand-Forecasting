import { ForecastApp } from "../../forecast-app";

export const dynamic = "force-static";

export default function NewForecastPage() {
  return <ForecastApp initialView="forecast" initialPath="/forecast/new" />;
}
