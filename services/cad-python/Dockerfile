FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Runtime mínimo das bibliotecas nativas OCCT (arquivo STEP).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libx11-6 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-occt.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps -r requirements-occt.txt \
    && python -c "from OCP.STEPControl import STEPControl_Writer; from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder"

COPY app ./app

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
