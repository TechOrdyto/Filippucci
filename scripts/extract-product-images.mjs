// Script per estrarre le immagini dei prodotti dai PDF del catalogo Molteni&C
// Usa pdftoppm (poppler) per convertire le pagine in immagini
// Uso: node scripts/extract-product-images.mjs <pdf-path> <output-dir> [max-pages]
// Esempio: node scripts/extract-product-images.mjs "document/Catalogo molteni e listino/2025_CT_Sofas_IT-EN.pdf" public/products/sofas 40

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = process.argv[2];
const outputDir = process.argv[3] ?? "public/products";
const maxPages = parseInt(process.argv[4] ?? "30", 10);

if (!pdfPath) {
  console.error("Uso: node scripts/extract-product-images.mjs <pdf-path> <output-dir> [max-pages]");
  process.exit(1);
}

// Configura worker pdfjs
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const workerSrc = resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const data = new Uint8Array(readFileSync(resolve(pdfPath)));
const pdf = await getDocument({ data }).promise;

mkdirSync(resolve(outputDir), { recursive: true });

console.log(`📄 PDF: ${pdfPath}`);
console.log(`   Pagine totali: ${pdf.numPages}, estrazione fino a ${maxPages}`);

// 1. Converti le pagine in PNG con pdftoppm
const tmpDir = join(tmpdir(), `ordyto-products-${Date.now()}`);
mkdirSync(tmpDir, { recursive: true });

const pageCount = Math.min(pdf.numPages, maxPages);
console.log(`🖼️  Conversione pagine 1-${pageCount} con pdftoppm...`);
execSync(`pdftoppm -png -r 100 -f 1 -l ${pageCount} "${resolve(pdfPath)}" "${join(tmpDir, "page")}"`, {
  stdio: "inherit",
});

const pageFiles = readdirSync(tmpDir)
  .filter((f) => f.endsWith(".png"))
  .sort((a, b) => {
    const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
    const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
    return na - nb;
  });

console.log(`   Convertite ${pageFiles.length} pagine`);

// 2. Identifica i prodotti per pagina e copia le immagini
const extracted = [];

// Nomi reali dei prodotti (dall'overview del catalogo)
const KNOWN_PRODUCTS = [
  "Emile", "Augusto", "Cleo", "Paul", "Marteen", "Octave", "Gregor",
  "Regis", "Surf", "Turner", "Chelsea", "Domino", "Skin", "Lido", "Lucio",
  "Albert", "Breeze", "Reversi", "Gillis", "Glove-Up", "Kensington", "Lia",
  "Linea", "Margou", "Paula", "Piccadilly", "Eugène", "Tuscany", "Walter",
  "Cinnamon", "Doda", "Elain", "45°/Tavolino", "Alisee", "Aster", "Attico",
  "Fleur", "Fonte", "Hubert", "Lèa", "Louisa", "Maylis", "Odile", "Panna Cotta",
  "Picea", "Regent", "Teso", "Vicino", "When", "D.163.7", "D.151.4", "D.153.1",
  "D.154.2", "D.154.5", "D.156.3", "D.157.6", "D.552.2", "D.555.1", "Domino Next",
];

for (let i = 1; i <= pageCount; i++) {
  const page = await pdf.getPage(i);
  const textContent = await page.getTextContent();
  const pageText = textContent.items
    .map((item) => item.str)
    .join(" ")
    .trim();

  // Cerca il nome prodotto nella pagina (header in maiuscolo seguito da —)
  const productMatch = pageText.match(/^([A-Z][A-Z0-9.\s'’-]{2,40})\s*—/);
  const headerName = productMatch ? productMatch[1].trim() : null;

  // Verifica che il nome sia un prodotto reale (case-insensitive)
  const productName = KNOWN_PRODUCTS.find(
    (p) => headerName && p.toLowerCase() === headerName.toLowerCase()
  );

  if (productName) {
    const pageFile = pageFiles[i - 1];
    if (pageFile) {
      const filename = slugify(productName) + ".png";
      const srcPath = join(tmpDir, pageFile);
      const destPath = join(resolve(outputDir), filename);
      writeFileSync(destPath, readFileSync(srcPath));
      extracted.push({ name: productName, file: filename, page: i });
      console.log(`   ✅ Pagina ${i}: ${productName} → ${filename}`);
    }
  }
}

console.log(`\n📦 Estratte ${extracted.length} immagini prodotti in ${resolve(outputDir)}`);
console.log("\nRiepilogo:");
for (const item of extracted) {
  console.log(`   - ${item.name}: /products/${item.file}`);
}

// ─── Helpers ─────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}