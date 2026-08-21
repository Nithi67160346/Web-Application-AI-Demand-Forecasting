import { ForecastApp } from "../../forecast-app";

export const dynamic = "force-static";

export default function UploadDataPage() {
  return <ForecastApp initialView="data" initialPath="/data/upload" />;
}
