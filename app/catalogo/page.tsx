import type { Metadata } from "next";
import CatalogoPageClient from "./CatalogoPageClient";

export const metadata: Metadata = {
  title: "Catalogo | Filipucci Interior Studio",
  description: "Catalogo articoli Filipucci filtrabile per categoria, marca, collezione e designer.",
};

export default function CatalogoPage() {
  return <CatalogoPageClient />;
}
