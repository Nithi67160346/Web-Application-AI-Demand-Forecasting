import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function DataPage() {
  return <ForecastApp initialView="data" initialPath="/data" />;
}
