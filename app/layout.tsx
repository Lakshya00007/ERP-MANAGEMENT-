import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vidhya License Manager",
  description: "Private Vidhya Tech admin panel for School ERP licensing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
