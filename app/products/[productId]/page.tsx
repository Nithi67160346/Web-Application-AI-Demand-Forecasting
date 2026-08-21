import { ForecastApp } from "../../forecast-app";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [
    { productId: "test-kit-a" },
    { productId: "gloves-b" },
    { productId: "mask-c" },
    { productId: "syringe-d" },
    { productId: "antigen-e" },
  ];
}

export default function ProductDetailPage() {
  return <ForecastApp initialView="products" initialPath="/products/test-kit-a" />;
}
