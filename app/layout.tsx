import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demandly · AI Demand Forecasting",
  description: "วางแผน Demand และ Inventory ด้วย AI ที่อธิบายได้ สำหรับทีม Supply Chain",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
