from __future__ import annotations

import base64
import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .cad_engine import analyze_cad, export_dxf, import_dxf

app = FastAPI(title="Campo do Gado CAD Python Engine", version="1.0.0")


class AnalyzeRequest(BaseModel):
    cad: dict[str, Any] = Field(default_factory=dict)
    thickness_mm: float | None = None
    density_kg_m3: float | None = None


class DxfExportRequest(BaseModel):
    cad: dict[str, Any] = Field(default_factory=dict)
    filename: str | None = None


class DxfImportRequest(BaseModel):
    content_base64: str | None = None
    content_text: str | None = None


def require_internal_token(x_cad_engine_token: str | None = Header(default=None)) -> None:
    expected = str(os.getenv("CAD_ENGINE_TOKEN") or "").strip()
    if expected and x_cad_engine_token != expected:
        raise HTTPException(status_code=401, detail="Token interno inválido")


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "cad-python-engine", "version": "1.0.0"}


@app.post("/v1/analyze", dependencies=[Depends(require_internal_token)])
def analyze(payload: AnalyzeRequest) -> dict[str, Any]:
    result = analyze_cad(payload.cad, payload.thickness_mm, payload.density_kg_m3)
    return {"ok": True, "data": result}


@app.post("/v1/dxf/export", dependencies=[Depends(require_internal_token)])
def dxf_export(payload: DxfExportRequest) -> dict[str, Any]:
    content, warnings = export_dxf(payload.cad)
    filename = (payload.filename or "desenho-tecnico.dxf").strip() or "desenho-tecnico.dxf"
    if not filename.lower().endswith(".dxf"):
        filename += ".dxf"
    return {
        "ok": True,
        "filename": filename,
        "content_base64": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "warnings": warnings,
    }


@app.post("/v1/dxf/import", dependencies=[Depends(require_internal_token)])
def dxf_import(payload: DxfImportRequest) -> dict[str, Any]:
    if payload.content_base64:
        try:
            content = base64.b64decode(payload.content_base64).decode("utf-8", errors="replace")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"DXF base64 inválido: {exc}") from exc
    elif payload.content_text:
        content = payload.content_text
    else:
        raise HTTPException(status_code=400, detail="Informe content_base64 ou content_text")

    try:
        cad, warnings = import_dxf(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Não foi possível interpretar o DXF: {exc}") from exc
    return {"ok": True, "cad": cad, "warnings": warnings, "objects": len(cad.get("objects") or [])}
