import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function RegisterPage() {
  return <ForecastApp initialView="register" initialPath="/register" />;
}
