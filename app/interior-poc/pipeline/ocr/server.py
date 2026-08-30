# Servizio OCR PaddleOCR — sidecar Python
# Espone POST /ocr per l'analisi di immagini
# Avvio: uvicorn server:app --port 8001

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64
import io
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

app = FastAPI(title="Ordyto OCR Service")

# Inizializza PaddleOCR (una volta all'avvio)
# lang="it" per italiano, use_angle_cls=True per testo ruotato
ocr_engine = None

class OcrRequest(BaseModel):
    image_base64: str
    lang: str = "it"

class OcrResponse(BaseModel):
    text_blocks: list
    image_size: dict

def get_engine(lang: str):
    global ocr_engine
    if ocr_engine is None:
        # PaddleOCR 2.x: API stabile, senza doc_preprocessor
        ocr_engine = PaddleOCR(
            use_angle_cls=True,
            lang=lang,
            show_log=False,
        )
    return ocr_engine

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ocr", response_model=OcrResponse)
def ocr(req: OcrRequest):
    try:
        # Decodifica immagine
        image_bytes = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(image_bytes))
        image_np = np.array(image)

        # Esegui OCR (PaddleOCR 2.x: ocr.ocr con cls)
        engine = get_engine(req.lang)
        result = engine.ocr(image_np, cls=True)

        text_blocks = []
        if result and result[0]:
            for line in result[0]:
                bbox = line[0]  # 4 punti [x0,y0], [x1,y1], [x2,y2], [x3,y3]
                text_info = line[1]
                text = text_info[0]
                confidence = float(text_info[1])

                # Calcola bounding box e centro
                xs = [p[0] for p in bbox]
                ys = [p[1] for p in bbox]
                x0, y0 = min(xs), min(ys)
                x1, y1 = max(xs), max(ys)

                text_blocks.append({
                    "text": text,
                    "confidence": confidence,
                    "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
                    "center": {"x": (x0 + x1) / 2, "y": (y0 + y1) / 2},
                })

        return OcrResponse(
            text_blocks=text_blocks,
            image_size={"width": image.width, "height": image.height},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)