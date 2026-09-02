import type { Metadata } from "next";
import CatalogoPageClient from "./CatalogoPageClient";

export const metadata: Metadata = {
  title: "Catalogo | Filippucci Interior Studio",
  description: "Catalogo articoli Filippucci filtrabile per categoria, marca, collezione e designer.",
};

export default function CatalogoPage() {
  return <CatalogoPageClient />;
}
