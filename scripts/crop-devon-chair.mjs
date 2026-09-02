// Ritaglia UNA singola sedia Devon dalla scena (tavolo + 6 sedie)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envContent = readFileSync(resolve(".env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}

const sharp = (await import("sharp")).default;

const src = "public/products/devon/raw/devon-p2-main.png";
const imageBuffer = readFileSync(resolve(src));
const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;

const systemPrompt = `Sei un esperto di cataloghi di arredamento Molteni&C.
L'immagine mostra un tavolo con diverse sedie Devon attorno.
Identifica il bounding box di UNA SINGOLA sedia (la più grande e completa, non tagliata).
IGNORA il tavolo, le altre sedie, il testo e lo sfondo.
Rispondi SOLO con JSON:
{"x": percentuale dal bordo sinistro (0-100), "y": percentuale dal bordo superiore (0-100), "width": larghezza in percentuale (0-100), "height": altezza in percentuale (0-100)}
Rispondi SOLO con JSON valido, nessun altro testo.`;

const apiKey = process.env.OPENAI_API_KEY;
const endpoint = apiKey ? "https://api.openai.com/v1/chat/completions" : "https://opencode.ai/zen/v1/chat/completions";
const authKey = apiKey ?? "public";
const model = apiKey ? "gpt-4o-mini" : "mimo-v2.5-free";

const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${authKey}` },
  body: JSON.stringify({
    model, temperature: 0.1, max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }] },
    ],
  }),
});
if (!res.ok) throw new Error(`API error ${res.status}`);
const data = await res.json();
const content = data.choices?.[0]?.message?.content ?? "";
const jsonMatch = content.match(/\{[\s\S]*\}/);
const bbox = JSON.parse(jsonMatch[0]);
console.log("BBox sedia:", JSON.stringify(bbox));

const meta = await sharp(imageBuffer).metadata();
let left = Math.round((bbox.x / 100) * meta.width);
let top = Math.round((bbox.y / 100) * meta.height);
let w = Math.round((bbox.width / 100) * meta.width);
let h = Math.round((bbox.height / 100) * meta.height);
const margin = Math.round(Math.min(meta.width, meta.height) * 0.03);
left = Math.max(0, left - margin);
top = Math.max(0, top - margin);
w = Math.min(meta.width - left, w + margin * 2);
h = Math.min(meta.height - top, h + margin * 2);

const cropped = await sharp(imageBuffer).extract({ left, top, width: w, height: h }).toBuffer();
writeFileSync(resolve("public/products/devon/devon-chair.png"), cropped);
const outMeta = await sharp(cropped).metadata();
console.log("✅ devon-chair.png", outMeta.width + "x" + outMeta.height);
