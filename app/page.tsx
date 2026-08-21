import { ForecastApp } from "./forecast-app";

export const dynamic = "force-static";

export default function Home() {
  return <ForecastApp initialView="login" initialPath="/" />;
}
