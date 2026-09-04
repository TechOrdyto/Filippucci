import type { Metadata } from "next";
import "./globals.css";
import AuthSessionProvider from "./components/AuthSessionProvider";

export const metadata: Metadata = {
  title: "Filipucci Interior Studio",
  description: "Dalla planimetria a una proposta d'interni fotorealistica.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
