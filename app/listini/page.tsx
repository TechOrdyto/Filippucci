import type { Metadata } from "next";
import ListiniPageClient from "./ListiniPageClient";

export const metadata: Metadata = {
  title: "Listini | Filipucci Interior Studio",
  description: "Articoli associati al progetto con quantità, prezzi e totale.",
};

export default function ListiniPage() {
  return <ListiniPageClient />;
}
