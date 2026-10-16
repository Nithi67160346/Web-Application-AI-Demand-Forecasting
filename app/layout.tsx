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
    icon: `${import.meta.env.VITE_BASE_PATH || ""}/brand/favicon-64.png`,
    shortcut: `${import.meta.env.VITE_BASE_PATH || ""}/brand/favicon-64.png`,
    apple: `${import.meta.env.VITE_BASE_PATH || ""}/brand/apple-touch-icon.png`,
  },
};

const themeScript = `try{if(localStorage.getItem("demandly-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Theme is applied before paint from the saved choice, so the toggle never flashes.
    <html lang="th" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
        {/* Root layout wraps every route, so the pages-router font warning does not apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=Noto+Sans+Thai:wght@400..800&display=swap"/>
        <script dangerouslySetInnerHTML={{ __html: themeScript }}/>
      </head>
      <body>{children}</body>
    </html>
  );
}
