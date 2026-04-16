import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bobo's Dart",
  description: "Offline Dart Counter fuer 301 und 501 mit Average, Undo und Checkout-Hinweisen.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
