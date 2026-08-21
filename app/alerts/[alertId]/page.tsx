import { ForecastApp } from "../../forecast-app";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [
    { alertId: "alert-test-kit-a" },
    { alertId: "alert-antigen-e" },
    { alertId: "alert-mask-c" },
  ];
}

export default function AlertDetailPage() {
  return <ForecastApp initialView="alerts" initialPath="/alerts/alert-test-kit-a" />;
}
