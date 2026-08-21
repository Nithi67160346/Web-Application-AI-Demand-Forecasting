import { ForecastApp } from "../../forecast-app";

export const dynamic = "force-static";

export default function DataQualityPage() {
  return <ForecastApp initialView="data" initialPath="/data/quality" />;
}
