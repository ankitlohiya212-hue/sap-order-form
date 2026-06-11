import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAP Order Entry",
  description: "Internal order-entry console for SMKDR Google Sheets"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
