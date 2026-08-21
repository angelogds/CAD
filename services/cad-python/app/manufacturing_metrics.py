from __future__ import annotations

import math
from typing import Any

from shapely.ops import unary_union

from .cad_engine import (
    MM2_TO_M2,
    MM3_TO_M3,
    _layer,
    _num,
    _points,
    _shape_for_object,
    infer_density,
)

GENERATED_LAYER_PREFIX = "FAB_"
EPS = 1e-6


def _is_generated(obj: dict[str, Any]) -> bool:
    layer = _layer(obj).upper()
    kind = str(obj.get("type") or "").lower()
    return layer.startswith(GENERATED_LAYER_PREFIX) or kind in {"dimension"}


def prepare_analysis_cad(cad: dict[str, Any]) -> dict[str, Any]:
    """Remove folha, vistas e anotações de fabricação das métricas da peça.

    O DXF completo continua preservado. A filtragem existe apenas para impedir que
    moldura A3/A4, textos e símbolos técnicos alterem área/perímetro/peso.
    """
    prepared = dict(cad or {})
    prepared["objects"] = [
        obj for obj in (cad.get("objects") or [])
        if isinstance(obj, dict) and not _is_generated(obj)
    ]
    return prepared


def _poly_rect(obj: dict[str, Any]) -> dict[str, float] | None:
    if str(obj.get("type") or "").lower() != "polyline" or not obj.get("closed"):
        return None
    pts = _points(obj)
    if len(pts) != 4:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    width, height = max_x - min_x, max_y - min_y
    if width <= EPS or height <= EPS:
        return None
    tol = max(0.01, max(width, height) * 0.001)
    for x, y in pts:
        on_x = abs(x - min_x) <= tol or abs(x - max_x) <= tol
        on_y = abs(y - min_y) <= tol or abs(y - max_y) <= tol
        if not (on_x and on_y):
            return None
    return {
        "min_x": min_x,
        "max_x": max_x,
        "min_y": min_y,
        "max_y": max_y,
        "width": width,
        "height": height,
        "center_x": (min_x + max_x) / 2,
        "center_y": (min_y + max_y) / 2,
    }


def _circles(objects: list[dict[str, Any]]) -> list[dict[str, float]]:
    result: list[dict[str, float]] = []
    for obj in objects:
        if str(obj.get("type") or "").lower() != "circle":
            continue
        radius = abs(_num(obj.get("radius")))
        if radius <= EPS:
            continue
        result.append({
            "x": _num(obj.get("x")),
            "y": _num(obj.get("y")),
            "radius": radius,
        })
    return result


def _rects(objects: list[dict[str, Any]]) -> list[dict[str, float]]:
    return [rect for obj in objects if (rect := _poly_rect(obj)) is not None]


def _detect_shaft(rects: list[dict[str, float]]) -> dict[str, Any] | None:
    if len(rects) < 2:
        return None
    ordered = sorted(rects, key=lambda r: r["min_x"])
    center_y = sum(r["center_y"] for r in ordered) / len(ordered)
    aligned = [
        r for r in ordered
        if abs(r["center_y"] - center_y) <= max(0.5, r["height"] * 0.02)
    ]
    if len(aligned) < 2:
        return None
    for previous, current in zip(aligned, aligned[1:]):
        if abs(current["min_x"] - previous["max_x"]) > max(0.8, current["width"] * 0.01):
            return None
    volume = sum(math.pi * (r["height"] / 2) ** 2 * r["width"] for r in aligned)
    return {
        "type": "EIXO_ESCALONADO",
        "volume_mm3": volume,
        "total_length_mm": sum(r["width"] for r in aligned),
        "max_diameter_mm": max(r["height"] for r in aligned),
        "segments": [
            {"length_mm": round(r["width"], 3), "diameter_mm": round(r["height"], 3)}
            for r in aligned
        ],
    }


def _detect_round_part(circles: list[dict[str, float]], rects: list[dict[str, float]]) -> dict[str, Any] | None:
    if not circles:
        return None
    outer = max(circles, key=lambda c: c["radius"])
    diameter = outer["radius"] * 2
    tol = max(0.5, diameter * 0.015)
    concentric = sorted(
        [
            c for c in circles
            if c is not outer and math.hypot(c["x"] - outer["x"], c["y"] - outer["y"]) <= tol
        ],
        key=lambda c: c["radius"],
        reverse=True,
    )
    bore = concentric[0] if concentric else None
    side = next(
        (
            r for r in rects
            if abs(r["height"] - diameter) <= tol
            and r["width"] > EPS
            and r["width"] <= diameter * 0.6
        ),
        None,
    )
    if side is None:
        return None

    holes = []
    for circle in circles:
        if circle is outer or circle is bore:
            continue
        distance = math.hypot(circle["x"] - outer["x"], circle["y"] - outer["y"])
        if distance <= tol:
            continue
        if circle["radius"] > outer["radius"] * 0.30:
            continue
        if distance + circle["radius"] <= outer["radius"] + tol:
            holes.append(circle)

    net_area = math.pi * outer["radius"] ** 2
    if bore:
        net_area -= math.pi * bore["radius"] ** 2
    net_area -= sum(math.pi * hole["radius"] ** 2 for hole in holes)
    net_area = max(0.0, net_area)
    thickness = side["width"]
    perimeter = 2 * math.pi * outer["radius"]
    if bore:
        perimeter += 2 * math.pi * bore["radius"]
    perimeter += sum(2 * math.pi * hole["radius"] for hole in holes)

    return {
        "type": "FLANGE" if len(holes) >= 3 else "DISCO",
        "volume_mm3": net_area * thickness,
        "net_area_mm2": net_area,
        "perimeter_mm": perimeter,
        "thickness_mm": thickness,
        "outer_diameter_mm": diameter,
        "bore_diameter_mm": bore["radius"] * 2 if bore else None,
        "hole_count": len(holes),
        "hole_diameter_mm": holes[0]["radius"] * 2 if holes else None,
    }


def _clean_area(objects: list[dict[str, Any]]) -> tuple[float, float]:
    shapes = []
    for obj in objects:
        shape = _shape_for_object(obj)
        if shape is not None and not shape.is_empty and shape.is_valid:
            shapes.append(shape)
    if not shapes:
        return 0.0, 0.0
    merged = unary_union(shapes)
    return float(merged.area), float(merged.length)


def enhance_analysis(
    cad: dict[str, Any],
    base_result: dict[str, Any],
    thickness_mm: float | None = None,
    density_kg_m3: float | None = None,
) -> dict[str, Any]:
    prepared = prepare_analysis_cad(cad)
    objects = [
        obj for obj in (prepared.get("objects") or [])
        if isinstance(obj, dict) and obj.get("visible", True) is not False
    ]
    metrics = dict(base_result.get("metrics") or {})

    clean_area, clean_perimeter = _clean_area(objects)
    metrics["area_mm2"] = round(clean_area, 3)
    metrics["area_m2"] = round(clean_area / MM2_TO_M2, 6)
    metrics["perimeter_mm"] = round(clean_perimeter, 3)
    metrics["perimeter_m"] = round(clean_perimeter / 1000.0, 6)

    rects = _rects(objects)
    circles = _circles(objects)
    shaft = _detect_shaft(rects)
    round_part = None if shaft else _detect_round_part(circles, rects)
    recognized = shaft or round_part

    if round_part:
        metrics["area_mm2"] = round(round_part["net_area_mm2"], 3)
        metrics["area_m2"] = round(round_part["net_area_mm2"] / MM2_TO_M2, 6)
        metrics["perimeter_mm"] = round(round_part["perimeter_mm"], 3)
        metrics["perimeter_m"] = round(round_part["perimeter_mm"] / 1000.0, 6)

    effective_thickness = _num(thickness_mm, 0.0)
    volume_mm3 = None
    mass_method = None
    if recognized:
        volume_mm3 = float(recognized["volume_mm3"])
        effective_thickness = _num(recognized.get("thickness_mm"), effective_thickness)
        mass_method = "sólido de revolução reconhecido automaticamente"
    elif clean_area > 0 and effective_thickness > 0:
        volume_mm3 = clean_area * effective_thickness
        mass_method = "área 2D x espessura informada"

    material = cad.get("material") or (cad.get("metadata") or {}).get("material") or ""
    inferred_density, inferred_name = infer_density(str(material))
    effective_density = _num(density_kg_m3, 0.0) or inferred_density
    mass_kg = None
    if volume_mm3 is not None and effective_density:
        mass_kg = volume_mm3 / MM3_TO_M3 * effective_density

    metrics.update({
        "part_type": recognized.get("type") if recognized else ("CHAPA_2D" if effective_thickness > 0 else None),
        "volume_mm3": round(volume_mm3, 3) if volume_mm3 is not None else None,
        "volume_cm3": round(volume_mm3 / 1000.0, 3) if volume_mm3 is not None else None,
        "estimated_mass_kg": round(mass_kg, 3) if mass_kg is not None else None,
        "mass_method": mass_method,
        "thickness_mm": round(effective_thickness, 3) if effective_thickness > 0 else None,
        "density_kg_m3": effective_density,
        "density_source": inferred_name if density_kg_m3 in (None, 0, "") and inferred_density else ("informada" if effective_density else None),
        "total_length_mm": round(_num((recognized or {}).get("total_length_mm")), 3) or None,
        "max_diameter_mm": round(_num((recognized or {}).get("max_diameter_mm") or (recognized or {}).get("outer_diameter_mm")), 3) or None,
        "bore_diameter_mm": round(_num((recognized or {}).get("bore_diameter_mm")), 3) or None,
        "hole_count": (recognized or {}).get("hole_count"),
        "hole_diameter_mm": round(_num((recognized or {}).get("hole_diameter_mm")), 3) or None,
        "segments": (recognized or {}).get("segments"),
        "generated_entities_ignored": len((cad.get("objects") or [])) - len(objects),
    })
    base_result["metrics"] = metrics
    return base_result
