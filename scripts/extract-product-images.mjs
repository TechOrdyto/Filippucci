// Estrae le fotografie prodotto dai PDF del catalogo Molteni&C.
//
// Il PDF contiene testo e fotografie come oggetti distinti. Lo script usa le
// matrici degli operatori PDF per individuare le aree raster e poi ritaglia
// quelle aree dal rendering della pagina. Non copia più la pagina intera e
// non usa un elenco di pagine hardcoded.
//
// Uso:
//   node scripts/extract-product-images.mjs <pdf-path> <output-dir> [max-pages]
// Esempio:
//   node scripts/extract-product-images.mjs \
//     "document/Catalogo molteni e listino/2025_CT_Sofas_IT-EN.pdf" \
//     public/products

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";

const pdfPath = process.argv[2];
const outputDir = process.argv[3] ?? "public/products";
const maxPagesArg = Number.parseInt(process.argv[4] ?? "", 10);

if (!pdfPath) {
  console.error("Uso: node scripts/extract-product-images.mjs <pdf-path> <output-dir> [max-pages]");
  process.exit(1);
}

const sourcePath = resolve(pdfPath);
if (!existsSync(sourcePath)) {
  console.error(`PDF non trovato: ${sourcePath}`);
  process.exit(1);
}

const data = new Uint8Array(readFileSync(sourcePath));
const pdf = await getDocument({ data, disableWorker: true }).promise;
const pageCount = Number.isFinite(maxPagesArg) && maxPagesArg > 0
  ? Math.min(pdf.numPages, maxPagesArg)
  : pdf.numPages;
const productNames = loadProductNames();
const outputRoot = resolve(outputDir);
mkdirSync(outputRoot, { recursive: true });

console.log(`📄 PDF: ${pdfPath}`);
console.log(`   Pagine totali: ${pdf.numPages}, analisi fino a ${pageCount}`);
console.log(`   Prodotti cercati: ${productNames.join(", ")}`);

const matches = [];
for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const productName = findProductName(textContent.items.map((item) => item.str), productNames);
  if (!productName) continue;

  const regions = extractEmbeddedImageRegions(page, await page.getOperatorList());
  if (regions.length === 0) {
    console.log(`   ⚠️ Pagina ${pageNumber}: ${productName}, nessuna immagine raster utile`);
    continue;
  }

  matches.push({ pageNumber, productName, regions });
}

if (matches.length === 0) {
  console.log("\n📦 Nessuna pagina prodotto trovata.");
  process.exit(0);
}

console.log(`\n🖼️  Pagine prodotto trovate: ${matches.length}`);
const extracted = [];

for (const match of matches) {
  const pageDir = mkdtempSync(join(tmpdir(), "ordyto-products-"));
  try {
    const prefix = join(pageDir, "page");
    execFileSync("pdftoppm", [
      "-png",
      "-r",
      "100",
      "-f",
      String(match.pageNumber),
      "-l",
      String(match.pageNumber),
      sourcePath,
      prefix,
    ], { stdio: "ignore" });

    const pageFile = readdirSync(pageDir).find((file) => file.endsWith(".png"));
    if (!pageFile) {
      console.log(`   ⚠️ Pagina ${match.pageNumber}: rendering non disponibile`);
      continue;
    }

    const pagePath = join(pageDir, pageFile);
    const pageBuffer = readFileSync(pagePath);
    const metadata = await sharp(pageBuffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) continue;

    const productSlug = slugify(match.productName);
    const productDir = join(outputRoot, productSlug);
    mkdirSync(productDir, { recursive: true });

    for (let index = 0; index < match.regions.length; index++) {
      const region = match.regions[index];
      const left = Math.max(0, Math.min(width - 1, Math.round((region.x / 100) * width)));
      const top = Math.max(0, Math.min(height - 1, Math.round((region.y / 100) * height)));
      const cropWidth = Math.max(1, Math.round((region.width / 100) * width));
      const cropHeight = Math.max(1, Math.round((region.height / 100) * height));
      const safeWidth = Math.min(cropWidth, width - left);
      const safeHeight = Math.min(cropHeight, height - top);
      if (safeWidth < 10 || safeHeight < 10) continue;

      const filename = `${productSlug}-p${String(match.pageNumber).padStart(3, "0")}-${index + 1}.png`;
      const outputPath = join(productDir, filename);
      const cropped = await sharp(pageBuffer)
        .extract({ left, top, width: safeWidth, height: safeHeight })
        .png()
        .toBuffer();
      writeFileSync(outputPath, cropped);

      extracted.push({
        name: match.productName,
        page: match.pageNumber,
        file: outputPath,
        region,
      });
      console.log(`   ✅ Pagina ${match.pageNumber}: ${match.productName} → ${filename}`);
    }
  } finally {
    rmSync(pageDir, { recursive: true, force: true });
  }
}

console.log(`\n📦 Estratte ${extracted.length} fotografie in ${outputRoot}`);
for (const item of extracted) {
  console.log(`   - ${item.name}, pagina PDF ${item.page}: ${item.file}`);
}

function loadProductNames() {
  const catalogPath = resolve("app/interior-poc/data/catalog.json");
  if (existsSync(catalogPath)) {
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
      const names = catalog.products
        .map((product) => product.name)
        .filter((name) => typeof name === "string" && name.trim().length > 0);
      if (names.length > 0) return [...new Set(names)];
    } catch {
      // Usa il fallback per mantenere lo script eseguibile anche senza catalogo.
    }
  }

  return [
    "Blevio",
    "Arc",
    "Devon",
    "Glove",
    "Glove-Up",
    "Porta Volta",
    "Emile",
    "Augusto",
    "Cleo",
    "Paul",
    "Marteen",
    "Octave",
    "Gregor",
    "Regis",
    "Surf",
    "Turner",
    "Chelsea",
    "Domino",
    "Skin",
    "Lido",
    "Lucio",
    "Albert",
    "Breeze",
    "Reversi",
    "Gillis",
    "Kensington",
    "Lia",
    "Linea",
    "Margou",
    "Paula",
    "Piccadilly",
    "Eugène",
    "Tuscany",
    "Walter",
  ];
}

function findProductName(strings, productNames) {
  const normalizedStrings = strings.map((value) => value.trim().toUpperCase());

  return productNames.find((name) => {
    const normalizedName = name.trim().toUpperCase();
    return normalizedStrings.some((value) => value.replace(/[—–-]+$/, "").trim() === normalizedName);
  });
}

function extractEmbeddedImageRegions(page, operatorList) {
  const [pageX0, pageY0, pageX1, pageY1] = page.view;
  const pageWidth = pageX1 - pageX0;
  const pageHeight = pageY1 - pageY0;
  let transform = [1, 0, 0, 1, 0, 0];
  const transformStack = [];
  const regions = [];

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i];

    if (fn === OPS.save) {
      transformStack.push(transform);
    } else if (fn === OPS.restore) {
      transform = transformStack.pop() ?? transform;
    } else if (fn === OPS.transform && isMatrix(args)) {
      transform = multiplyMatrices(transform, args);
    } else if (fn === OPS.paintImageXObject && Array.isArray(args)) {
      const sourceWidth = typeof args[1] === "number" ? args[1] : 0;
      const sourceHeight = typeof args[2] === "number" ? args[2] : 0;
      const region = matrixToRegion(transform, pageX0, pageY0, pageWidth, pageHeight);
      if (region && isUsefulRegion(region, sourceWidth, sourceHeight)) {
        regions.push({ ...region, sourceWidth, sourceHeight });
      }
    }
  }

  return mergeAdjacentRegions(regions).filter(
    (region) => !isLikelyFullPageComposite(region)
  );
}

function isMatrix(value) {
  return Array.isArray(value) && value.length === 6 && value.every(
    (entry) => typeof entry === "number" && Number.isFinite(entry)
  );
}

function multiplyMatrices(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function matrixToRegion(matrix, pageX0, pageY0, pageWidth, pageHeight) {
  const points = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ]);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const x = ((x0 - pageX0) / pageWidth) * 100;
  const y = ((pageY0 + pageHeight - y1) / pageHeight) * 100;
  const width = ((x1 - x0) / pageWidth) * 100;
  const height = ((y1 - y0) / pageHeight) * 100;
  return { x, y, width, height };
}

function isUsefulRegion(region, sourceWidth, sourceHeight) {
  const area = region.width * region.height;
  const ratio = region.width / region.height;
  return (
    sourceWidth >= 300 &&
    sourceHeight >= 300 &&
    area >= 5 &&
    ratio >= 0.2 &&
    ratio <= 5
  );
}

function isLikelyFullPageComposite(region) {
  // Alcune pagine sono rasterizzate come spread e includono già titoli,
  // descrizioni e numeri pagina: non sono ritagli fotografici affidabili.
  return region.width >= 98 && region.height >= 75;
}

function mergeAdjacentRegions(regions) {
  const sorted = [...regions].sort((a, b) => a.x - b.x || a.y - b.y);
  const merged = [];

  for (const region of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push({ ...region });
      continue;
    }

    const verticalOverlap = Math.min(
      previous.y + previous.height,
      region.y + region.height
    ) - Math.max(previous.y, region.y);
    const minHeight = Math.min(previous.height, region.height);
    const horizontalGap = Math.max(
      0,
      Math.max(previous.x, region.x) -
        Math.min(previous.x + previous.width, region.x + region.width)
    );
    const sameRow = minHeight > 0 && verticalOverlap / minHeight >= 0.95;
    const similarHeight = Math.abs(previous.height - region.height) <= 3;

    if (sameRow && similarHeight && horizontalGap <= 1) {
      const right = Math.max(previous.x + previous.width, region.x + region.width);
      const bottom = Math.max(previous.y + previous.height, region.y + region.height);
      previous.x = Math.min(previous.x, region.x);
      previous.y = Math.min(previous.y, region.y);
      previous.width = right - previous.x;
      previous.height = bottom - previous.y;
      previous.sourceWidth += region.sourceWidth;
      previous.sourceHeight = Math.max(previous.sourceHeight, region.sourceHeight);
    } else {
      merged.push({ ...region });
    }
  }

  return merged;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
