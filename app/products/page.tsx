import { ForecastApp } from "../forecast-app";

export const dynamic = "force-static";

export default function ProductsPage() {
  return <ForecastApp initialView="products" initialPath="/products" />;
}
