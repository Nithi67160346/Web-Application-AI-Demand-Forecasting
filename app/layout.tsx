import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Demandly · AI Demand Forecasting",
  description: "วางแผน Demand และ Inventory ด้วย AI ที่อธิบายได้ สำหรับทีม Supply Chain",
  icons: {
    icon: `${import.meta.env.VITE_BASE_PATH || ""}/favicon.svg`,
    shortcut: `${import.meta.env.VITE_BASE_PATH || ""}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
