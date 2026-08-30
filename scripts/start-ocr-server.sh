#!/bin/bash
# Avvia il servizio OCR PaddleOCR
# Uso: bash scripts/start-ocr-server.sh

set -e

cd "$(dirname "$0")/../app/interior-poc/pipeline/ocr"

echo "🔍 Verifica Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 non trovato. Installalo con: brew install python"
    exit 1
fi

echo "🔍 Verifica dipendenze..."
if ! python3 -c "import paddleocr" 2>/dev/null; then
    echo "📦 Installazione dipendenze PaddleOCR..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate 2>/dev/null || true
fi

echo "🚀 Avvio servizio OCR su http://localhost:8001..."
python3 server.py