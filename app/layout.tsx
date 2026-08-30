import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ordyto — Interior Design AI PoC",
  description:
    "PoC: da planimetria a render fotorealistico con catalogo Molteni&C",
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