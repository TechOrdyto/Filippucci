import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filippucci Interior Studio",
  description: "Dalla planimetria a una proposta d'interni fotorealistica.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
