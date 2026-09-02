// Descrive i crop Devon per scegliere le migliori foto di riferimento
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envContent = readFileSync(resolve(".env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}

const files = [
  "public/products/devon/raw/devon-p1-right.png",
  "public/products/devon/raw/devon-p1-detail.png",
  "public/products/devon/raw/devon-p2-main.png",
  "public/products/devon/raw/devon-p3-left.png",
  "public/products/devon/raw/devon-p3-right.png",
  "public/products/devon/devon-p1-right.png",
  "public/products/devon/devon-p1-detail.png",
  "public/products/devon/devon-p2-main.png",
  "public/products/devon/devon-p3-left.png",
  "public/products/devon/devon-p3-right.png",
];

const systemPrompt = `Descrivi brevemente cosa mostra questa immagine di catalogo Molteni&C.
Indica: (1) quanti prodotti (sedie/poltroncine/sgabelli) sono visibili, (2) se c'è testo/didascalie/tabelle visibili, (3) se il prodotto è intero o tagliato, (4) il colore/legno del prodotto.
Rispondi in italiano, massimo 3 righe.`;

async function describe(imageDataUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = apiKey ? "https://api.openai.com/v1/chat/completions" : "https://opencode.ai/zen/v1/chat/completions";
  const authKey = apiKey ?? "public";
  const model = apiKey ? "gpt-4o-mini" : "mimo-v2.5-free";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authKey}` },
    body: JSON.stringify({
      model, temperature: 0.1, max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

for (const f of files) {
  const buf = readFileSync(resolve(f));
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  try {
    const desc = await describe(dataUrl);
    console.log(`\n=== ${f} ===\n${desc}`);
  } catch (e) {
    console.log(`\n=== ${f} ===\n❌ ${e.message}`);
  }
}
