from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def top(self) -> float:
        return self.y + self.height


def _num(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
        return result if result == result and abs(result) != float("inf") else default
    except (TypeError, ValueError):
        return default


def _intersects(a: Rect, b: Rect) -> bool:
    return not (a.right <= b.x or b.right <= a.x or a.top <= b.y or b.top <= a.y)


def _contains(outer: Rect, inner: Rect, eps: float = 1e-9) -> bool:
    return inner.x >= outer.x - eps and inner.y >= outer.y - eps and inner.right <= outer.right + eps and inner.top <= outer.top + eps


def _split_free_rect(free: Rect, used: Rect) -> list[Rect]:
    if not _intersects(free, used):
        return [free]
    result: list[Rect] = []
    if used.x > free.x:
        result.append(Rect(free.x, free.y, used.x - free.x, free.height))
    if used.right < free.right:
        result.append(Rect(used.right, free.y, free.right - used.right, free.height))
    if used.y > free.y:
        result.append(Rect(free.x, free.y, free.width, used.y - free.y))
    if used.top < free.top:
        result.append(Rect(free.x, used.top, free.width, free.top - used.top))
    return [rect for rect in result if rect.width > 1e-6 and rect.height > 1e-6]


def _prune_free_rects(rects: list[Rect]) -> list[Rect]:
    unique: list[Rect] = []
    for index, rect in enumerate(rects):
        if any(index != other_index and _contains(other, rect) for other_index, other in enumerate(rects)):
            continue
        if not any(abs(rect.x - current.x) < 1e-9 and abs(rect.y - current.y) < 1e-9 and abs(rect.width - current.width) < 1e-9 and abs(rect.height - current.height) < 1e-9 for current in unique):
            unique.append(rect)
    return unique


def _expanded_parts(parts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    for index, raw in enumerate(parts):
        if not isinstance(raw, dict):
            continue
        width = _num(raw.get("width_mm") or raw.get("width"))
        height = _num(raw.get("height_mm") or raw.get("height"))
        quantity = int(max(0, min(500, _num(raw.get("quantity"), 1))))
        if width <= 0 or height <= 0 or quantity <= 0:
            continue
        name = str(raw.get("name") or raw.get("id") or f"PECA-{index + 1}").strip()[:80]
        source_id = str(raw.get("id") or name)[:120]
        for unit in range(quantity):
            expanded.append({"id": f"{source_id}:{unit + 1}", "source_id": source_id, "name": name, "width": width, "height": height, "area": width * height})
    expanded.sort(key=lambda item: (max(item["width"], item["height"]), item["area"]), reverse=True)
    return expanded


def _best_fit(free_rects: list[Rect], part: dict[str, Any], spacing: float, allow_rotate: bool):
    orientations = [(part["width"], part["height"], False)]
    if allow_rotate and abs(part["width"] - part["height"]) > 1e-9:
        orientations.append((part["height"], part["width"], True))
    best = None
    for free_index, free in enumerate(free_rects):
        for width, height, rotated in orientations:
            packed_w, packed_h = width + spacing, height + spacing
            if packed_w > free.width + 1e-9 or packed_h > free.height + 1e-9:
                continue
            leftover_w, leftover_h = free.width - packed_w, free.height - packed_h
            score = (min(leftover_w, leftover_h), leftover_w * leftover_h, max(leftover_w, leftover_h), free.y, free.x)
            candidate = (score, free_index, width, height, rotated, packed_w, packed_h)
            if best is None or candidate[0] < best[0]:
                best = candidate
    return best


def pack_rectangles(payload: dict[str, Any]) -> dict[str, Any]:
    sheet_width = _num(payload.get("sheet_width_mm") or payload.get("sheet_width"))
    sheet_height = _num(payload.get("sheet_height_mm") or payload.get("sheet_height"))
    margin = max(0.0, _num(payload.get("margin_mm"), 10.0))
    spacing = max(0.0, _num(payload.get("spacing_mm"), 5.0))
    allow_rotate = bool(payload.get("allow_rotate", True))
    max_sheets = int(max(1, min(50, _num(payload.get("max_sheets"), 20))))
    parts = _expanded_parts(payload.get("parts") or [])
    if sheet_width <= 0 or sheet_height <= 0:
        raise ValueError("Informe largura e altura válidas para a chapa.")
    usable_width, usable_height = sheet_width - margin * 2, sheet_height - margin * 2
    if usable_width <= 0 or usable_height <= 0:
        raise ValueError("As margens informadas eliminam a área útil da chapa.")
    if not parts:
        raise ValueError("Informe pelo menos uma peça retangular para o nesting.")

    sheets: list[dict[str, Any]] = []
    placements: list[dict[str, Any]] = []
    unplaced: list[dict[str, Any]] = []

    def add_sheet() -> dict[str, Any]:
        sheet = {"index": len(sheets) + 1, "free": [Rect(margin, margin, usable_width, usable_height)], "placements": []}
        sheets.append(sheet)
        return sheet

    add_sheet()
    for part in parts:
        selected = None
        for sheet in sheets:
            candidate = _best_fit(sheet["free"], part, spacing, allow_rotate)
            if candidate is not None:
                selected = (sheet, candidate)
                break
        if selected is None and len(sheets) < max_sheets:
            sheet = add_sheet()
            candidate = _best_fit(sheet["free"], part, spacing, allow_rotate)
            if candidate is not None:
                selected = (sheet, candidate)
        if selected is None:
            unplaced.append({"id": part["id"], "source_id": part["source_id"], "name": part["name"], "width_mm": part["width"], "height_mm": part["height"]})
            continue

        sheet, candidate = selected
        _score, free_index, width, height, rotated, packed_w, packed_h = candidate
        free = sheet["free"][free_index]
        placement = {"id": part["id"], "source_id": part["source_id"], "name": part["name"], "sheet": sheet["index"], "x_mm": round(free.x, 4), "y_mm": round(free.y, 4), "width_mm": round(width, 4), "height_mm": round(height, 4), "rotated": rotated, "rotation_deg": 90 if rotated else 0, "area_mm2": round(width * height, 4)}
        placements.append(placement)
        sheet["placements"].append(placement)
        occupied = Rect(free.x, free.y, packed_w, packed_h)
        split: list[Rect] = []
        for rect in sheet["free"]:
            split.extend(_split_free_rect(rect, occupied))
        sheet["free"] = _prune_free_rects(split)

    sheet_summaries = []
    total_part_area = 0.0
    for sheet in sheets:
        area = sum(float(item["area_mm2"]) for item in sheet["placements"])
        total_part_area += area
        utilization = area / (sheet_width * sheet_height) * 100.0 if sheet_width * sheet_height else 0.0
        sheet_summaries.append({"sheet": sheet["index"], "placements": len(sheet["placements"]), "used_area_mm2": round(area, 3), "utilization_percent": round(utilization, 2)})

    used_sheet_count = sum(1 for sheet in sheets if sheet["placements"])
    total_sheet_area = used_sheet_count * sheet_width * sheet_height
    utilization = total_part_area / total_sheet_area * 100.0 if total_sheet_area else 0.0
    return {"ok": not unplaced, "sheet": {"width_mm": sheet_width, "height_mm": sheet_height, "margin_mm": margin, "spacing_mm": spacing, "allow_rotate": allow_rotate}, "summary": {"sheets_used": used_sheet_count, "parts_requested": len(parts), "parts_placed": len(placements), "parts_unplaced": len(unplaced), "used_area_mm2": round(total_part_area, 3), "waste_area_mm2": round(max(0.0, total_sheet_area - total_part_area), 3), "utilization_percent": round(utilization, 2)}, "sheets": sheet_summaries, "placements": placements, "unplaced": unplaced, "algorithm": "maxrects-best-short-side-fit-v1"}
