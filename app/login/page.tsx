import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function LoginPage() {
  return <ForecastApp initialView="login" initialPath="/login" />;
}
