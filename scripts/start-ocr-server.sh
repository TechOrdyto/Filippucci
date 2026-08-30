#!/bin/bash
# Avvia il servizio OCR PaddleOCR
# Uso: bash scripts/start-ocr-server.sh

set -e

cd "$(dirname "$0")/../app/interior-poc/pipeline/ocr"

# PaddlePaddle richiede Python <= 3.12
PYTHON_BIN=""
for candidate in /opt/homebrew/bin/python3.12 /usr/local/bin/python3.12 python3.12; do
    if command -v "$candidate" &> /dev/null; then
        PYTHON_BIN="$candidate"
        break
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo "❌ Python 3.12 non trovato. Installalo con: brew install python@3.12"
    exit 1
fi

echo "🔍 Python: $PYTHON_BIN"

echo "🔍 Verifica dipendenze..."
if [ ! -d ".venv" ]; then
    echo "📦 Creazione venv..."
    "$PYTHON_BIN" -m venv .venv
fi

source .venv/bin/activate

if ! python -c "import paddleocr" 2>/dev/null; then
    echo "📦 Installazione dipendenze PaddleOCR..."
    pip install -r requirements.txt
fi

echo "🚀 Avvio servizio OCR su http://localhost:8001..."
python server.py