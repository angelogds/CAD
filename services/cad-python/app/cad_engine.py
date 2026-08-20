from __future__ import annotations

import io
import json
import math
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

import ezdxf
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

MM2_TO_M2 = 1_000_000.0
MM3_TO_M3 = 1_000_000_000.0


def _num(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def _points(obj: dict[str, Any]) -> list[tuple[float, float]]:
    return [(_num(p.get("x")), _num(p.get("y"))) for p in (obj.get("points") or []) if isinstance(p, dict)]


def _layer(obj: dict[str, Any]) -> str:
    return str(obj.get("layer") or (obj.get("metadata") or {}).get("layer") or "geometria_principal")[:255]


def _arc_angles(obj: dict[str, Any]) -> tuple[float, float]:
    g = obj.get("geometry") or {}
    return math.degrees(_num(g.get("startAngle"))), math.degrees(_num(g.get("endAngle")))


def infer_density(material: str | None) -> tuple[float | None, str | None]:
    token = str(material or "").upper()
    if any(k in token for k in ("A36", "SAE", "AÇO", "ACO", "CARBONO")):
        return 7850.0, "aço carbono"
    if "INOX" in token:
        return 8000.0, "aço inox"
    if any(k in token for k in ("ALUM", "ALUMÍNIO", "ALUMINIO")):
        return 2700.0, "alumínio"
    if "BRONZE" in token:
        return 8800.0, "bronze"
    if any(k in token for k in ("FERRO FUNDIDO", "FF")):
        return 7200.0, "ferro fundido"
    return None, None


def _shape_for_object(obj: dict[str, Any]):
    kind = str(obj.get("type") or "").lower()
    if kind == "rect":
        x, y = _num(obj.get("x")), _num(obj.get("y"))
        w, h = _num(obj.get("width")), _num(obj.get("height"))
        if abs(w) < 1e-9 or abs(h) < 1e-9:
            return None
        return box(min(x, x + w), min(y, y + h), max(x, x + w), max(y, y + h))
    if kind == "circle":
        radius = _num(obj.get("radius"))
        if radius <= 0:
            return None
        return Point(_num(obj.get("x")), _num(obj.get("y"))).buffer(radius, resolution=96)
    if kind == "polyline" and obj.get("closed"):
        pts = _points(obj)
        if len(pts) >= 3:
            poly = Polygon(pts)
            return poly if poly.is_valid and not poly.is_empty else poly.buffer(0)
    if kind == "shaft":
        g = obj.get("geometry") or {}
        origin = g.get("origin") or {}
        x, y = _num(origin.get("x")), _num(origin.get("y"))
        orientation = str(g.get("orientation") or "horizontal")
        shapes = []
        for seg in g.get("segments") or []:
            length = max(0.0, _num(seg.get("length")))
            diameter = max(0.0, _num(seg.get("diameter")))
            if not length or not diameter:
                continue
            r = diameter / 2
            if orientation == "vertical":
                shapes.append(box(x - r, y, x + r, y + length))
                y += length
            else:
                shapes.append(box(x, y - r, x + length, y + r))
                x += length
        return unary_union(shapes) if shapes else None
    return None


def _linear_length(obj: dict[str, Any]) -> float:
    kind = str(obj.get("type") or "").lower()
    if kind in ("line", "centerline"):
        return math.hypot(_num(obj.get("x2")) - _num(obj.get("x")), _num(obj.get("y2")) - _num(obj.get("y")))
    if kind == "polyline":
        pts = _points(obj)
        pairs = list(zip(pts, pts[1:]))
        total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in pairs)
        if obj.get("closed") and len(pts) > 2:
            total += math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
        return total
    if kind == "circle":
        return 2 * math.pi * max(0.0, _num(obj.get("radius")))
    if kind == "arc":
        g = obj.get("geometry") or {}
        radius = max(0.0, _num(g.get("radius")))
        start = _num(g.get("startAngle"))
        end = _num(g.get("endAngle"))
        delta = (end - start) % (2 * math.pi)
        return radius * delta
    return 0.0


def _canonical(obj: dict[str, Any]) -> str:
    useful = {k: v for k, v in obj.items() if k not in {"id", "metadata", "style", "visible"}}
    return json.dumps(useful, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)


def analyze_cad(cad: dict[str, Any], thickness_mm: float | None = None, density_kg_m3: float | None = None) -> dict[str, Any]:
    objects = [o for o in (cad.get("objects") or []) if isinstance(o, dict) and o.get("visible", True) is not False]
    issues: list[dict[str, Any]] = []
    seen: dict[str, str] = {}
    shapes = []
    hatch_count = 0

    for obj in objects:
        entity_id = str(obj.get("id") or "")
        kind = str(obj.get("type") or "").lower()
        if (obj.get("metadata") or {}).get("primitive") == "hatch":
            hatch_count += 1
        key = _canonical(obj)
        if key in seen:
            issues.append({"severity": "warning", "code": "DUPLICATE", "entity_id": entity_id, "message": f"Geometria duplicada de {seen[key]}."})
        else:
            seen[key] = entity_id or kind

        if kind in ("line", "centerline") and _linear_length(obj) < 1e-6:
            issues.append({"severity": "error", "code": "ZERO_LENGTH", "entity_id": entity_id, "message": "Linha com comprimento zero."})
        elif kind == "circle" and _num(obj.get("radius")) <= 0:
            issues.append({"severity": "error", "code": "INVALID_RADIUS", "entity_id": entity_id, "message": "Círculo com raio inválido."})
        elif kind == "polyline":
            pts = _points(obj)
            if len(pts) < 2:
                issues.append({"severity": "error", "code": "POLYLINE_POINTS", "entity_id": entity_id, "message": "Polilinha sem pontos suficientes."})
            elif obj.get("closed") and len(pts) < 3:
                issues.append({"severity": "error", "code": "CLOSED_POLYLINE", "entity_id": entity_id, "message": "Contorno fechado exige pelo menos três vértices."})

        shape = _shape_for_object(obj)
        if shape is not None and not shape.is_empty:
            if not shape.is_valid:
                issues.append({"severity": "error", "code": "INVALID_CONTOUR", "entity_id": entity_id, "message": "Contorno fechado geometricamente inválido."})
            else:
                shapes.append(shape)

    union = unary_union(shapes) if shapes else None
    area_mm2 = float(union.area) if union is not None and not union.is_empty else 0.0
    perimeter_mm = float(union.length) if union is not None and not union.is_empty else 0.0
    linear_mm = sum(_linear_length(o) for o in objects)

    material = (cad.get("material") or (cad.get("metadata") or {}).get("material") or "")
    inferred_density, inferred_name = infer_density(material)
    effective_density = _num(density_kg_m3, 0.0) or inferred_density
    effective_thickness = _num(thickness_mm, 0.0)
    mass_kg = None
    if area_mm2 > 0 and effective_thickness > 0 and effective_density:
        mass_kg = area_mm2 * effective_thickness / MM3_TO_M3 * effective_density

    errors = sum(1 for item in issues if item["severity"] == "error")
    warnings = sum(1 for item in issues if item["severity"] == "warning")
    score = max(0, min(100, 100 - errors * 15 - warnings * 3))

    return {
        "ok": errors == 0,
        "validation": {"score": score, "errors": errors, "warnings": warnings, "issues": issues},
        "metrics": {
            "entities": len(objects),
            "closed_contours": len(shapes),
            "hatch_entities": hatch_count,
            "area_mm2": round(area_mm2, 3),
            "area_m2": round(area_mm2 / MM2_TO_M2, 6),
            "perimeter_mm": round(perimeter_mm, 3),
            "perimeter_m": round(perimeter_mm / 1000.0, 6),
            "linear_length_mm": round(linear_mm, 3),
            "linear_length_m": round(linear_mm / 1000.0, 6),
            "thickness_mm": effective_thickness or None,
            "density_kg_m3": effective_density,
            "density_source": inferred_name if density_kg_m3 in (None, 0, "") and inferred_density else ("informada" if effective_density else None),
            "estimated_mass_kg": round(mass_kg, 3) if mass_kg is not None else None,
        },
    }


def export_dxf(cad: dict[str, Any]) -> tuple[str, list[str]]:
    doc = ezdxf.new("R2018", setup=True)
    doc.units = ezdxf.units.MM
    msp = doc.modelspace()
    warnings: list[str] = []

    for name in (cad.get("layers") or {}).keys():
        safe_name = str(name)[:255]
        if safe_name and safe_name not in doc.layers:
            doc.layers.add(safe_name)

    for obj in cad.get("objects") or []:
        if not isinstance(obj, dict) or obj.get("visible", True) is False:
            continue
        kind = str(obj.get("type") or "").lower()
        layer = _layer(obj)
        attrs = {"layer": layer}
        try:
            if kind in ("line", "centerline"):
                msp.add_line((_num(obj.get("x")), _num(obj.get("y"))), (_num(obj.get("x2")), _num(obj.get("y2"))), dxfattribs=attrs)
            elif kind == "rect":
                x, y, w, h = _num(obj.get("x")), _num(obj.get("y")), _num(obj.get("width")), _num(obj.get("height"))
                msp.add_lwpolyline([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], close=True, dxfattribs=attrs)
            elif kind == "circle":
                msp.add_circle((_num(obj.get("x")), _num(obj.get("y"))), _num(obj.get("radius")), dxfattribs=attrs)
            elif kind == "arc":
                g = obj.get("geometry") or {}
                start, end = _arc_angles(obj)
                msp.add_arc((_num(g.get("cx")), _num(g.get("cy"))), _num(g.get("radius")), start, end, dxfattribs=attrs)
            elif kind == "polyline":
                pts = _points(obj)
                if len(pts) >= 2:
                    primitive = str((obj.get("metadata") or {}).get("primitive") or "")
                    if primitive == "ellipse" and len(pts) >= 8:
                        cx = sum(p[0] for p in pts) / len(pts)
                        cy = sum(p[1] for p in pts) / len(pts)
                        rx = _num((obj.get("metadata") or {}).get("rx"), 0.0)
                        ry = _num((obj.get("metadata") or {}).get("ry"), 0.0)
                        rot = _num((obj.get("metadata") or {}).get("rotation"), 0.0)
                        if rx > 0 and ry > 0:
                            msp.add_ellipse((cx, cy), (math.cos(rot) * rx, math.sin(rot) * rx), ratio=min(1.0, ry / rx), dxfattribs=attrs)
                        else:
                            msp.add_lwpolyline(pts, close=bool(obj.get("closed")), dxfattribs=attrs)
                    else:
                        msp.add_lwpolyline(pts, close=bool(obj.get("closed")), dxfattribs=attrs)
            elif kind == "text":
                entity = msp.add_text(str(obj.get("text") or ""), height=max(1.0, _num(obj.get("size"), 14.0)), dxfattribs=attrs)
                entity.set_placement((_num(obj.get("x")), _num(obj.get("y"))))
            elif kind == "shaft":
                g = obj.get("geometry") or {}
                origin = g.get("origin") or {}
                x, y = _num(origin.get("x")), _num(origin.get("y"))
                orientation = str(g.get("orientation") or "horizontal")
                for seg in g.get("segments") or []:
                    length, diameter = _num(seg.get("length")), _num(seg.get("diameter"))
                    r = diameter / 2
                    if orientation == "vertical":
                        pts = [(x - r, y), (x + r, y), (x + r, y + length), (x - r, y + length)]
                        y += length
                    else:
                        pts = [(x, y - r), (x + length, y - r), (x + length, y + r), (x, y + r)]
                        x += length
                    msp.add_lwpolyline(pts, close=True, dxfattribs=attrs)
            elif kind == "dimension":
                g = obj.get("geometry") or {}
                p1, p2, tp = g.get("p1"), g.get("p2"), g.get("textPoint")
                if isinstance(p1, dict) and isinstance(p2, dict):
                    msp.add_line((_num(p1.get("x")), _num(p1.get("y"))), (_num(p2.get("x")), _num(p2.get("y"))), dxfattribs=attrs)
                if isinstance(tp, dict) and g.get("label"):
                    text = msp.add_text(str(g.get("label")), height=3.5, dxfattribs=attrs)
                    text.set_placement((_num(tp.get("x")), _num(tp.get("y"))))
            else:
                warnings.append(f"Entidade não exportada: {kind or 'sem tipo'}")
        except Exception as exc:  # defensive: one bad entity must not abort the whole export
            warnings.append(f"Falha ao exportar {kind or 'entidade'} {obj.get('id')}: {exc}")

    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue(), warnings


def _new_id(handle: Any = None) -> str:
    token = str(handle or "").strip()
    return f"dxf-{token}" if token else f"dxf-{uuid.uuid4()}"


def _entity_to_objects(entity) -> tuple[list[dict[str, Any]], list[str]]:
    kind = entity.dxftype()
    layer = str(getattr(entity.dxf, "layer", "geometria_principal") or "geometria_principal")
    common = {"layer": layer, "metadata": {"layer": layer, "source": "dxf"}, "visible": True, "style": {}}
    handle = getattr(entity.dxf, "handle", None)
    warnings: list[str] = []
    objects: list[dict[str, Any]] = []

    try:
        if kind == "LINE":
            s, e = entity.dxf.start, entity.dxf.end
            objects.append({"id": _new_id(handle), "type": "line", "x": s.x, "y": s.y, "x2": e.x, "y2": e.y, **common})
        elif kind == "CIRCLE":
            c = entity.dxf.center
            objects.append({"id": _new_id(handle), "type": "circle", "x": c.x, "y": c.y, "radius": entity.dxf.radius, **common})
        elif kind == "ARC":
            c = entity.dxf.center
            objects.append({"id": _new_id(handle), "type": "arc", "geometry": {"cx": c.x, "cy": c.y, "radius": entity.dxf.radius, "startAngle": math.radians(entity.dxf.start_angle), "endAngle": math.radians(entity.dxf.end_angle), "ccw": True}, **common})
        elif kind == "LWPOLYLINE":
            pts = [{"x": p[0], "y": p[1]} for p in entity.get_points("xy")]
            objects.append({"id": _new_id(handle), "type": "polyline", "points": pts, "closed": bool(entity.closed), **common})
        elif kind == "POLYLINE":
            pts = [{"x": v.dxf.location.x, "y": v.dxf.location.y} for v in entity.vertices]
            objects.append({"id": _new_id(handle), "type": "polyline", "points": pts, "closed": bool(entity.is_closed), **common})
        elif kind == "ELLIPSE":
            pts = [{"x": p.x, "y": p.y} for p in entity.flattening(0.25, segments=24)]
            objects.append({"id": _new_id(handle), "type": "polyline", "points": pts, "closed": True, **common, "metadata": {**common["metadata"], "primitive": "ellipse"}})
        elif kind == "SPLINE":
            pts = [{"x": p.x, "y": p.y} for p in entity.flattening(0.25, segments=8)]
            objects.append({"id": _new_id(handle), "type": "polyline", "points": pts, "closed": bool(entity.closed), **common, "metadata": {**common["metadata"], "primitive": "spline"}})
        elif kind in ("TEXT", "MTEXT"):
            insert = entity.dxf.insert
            text_value = entity.plain_text() if kind == "MTEXT" else entity.dxf.text
            height = getattr(entity.dxf, "char_height", None) or getattr(entity.dxf, "height", None) or 14
            objects.append({"id": _new_id(handle), "type": "text", "x": insert.x, "y": insert.y, "text": str(text_value), "size": float(height), **common})
        elif kind in ("INSERT", "DIMENSION"):
            for virtual in entity.virtual_entities():
                nested, nested_warnings = _entity_to_objects(virtual)
                objects.extend(nested)
                warnings.extend(nested_warnings)
        elif kind == "HATCH":
            warnings.append("HATCH DXF identificado; mantenha a geometria de contorno e reaplique a hachura no editor para preservar o padrão visual.")
        else:
            warnings.append(f"Entidade DXF ainda não suportada: {kind}")
    except Exception as exc:
        warnings.append(f"Falha ao importar {kind}: {exc}")
    return objects, warnings


def import_dxf(content: str) -> tuple[dict[str, Any], list[str]]:
    doc = ezdxf.read(io.StringIO(content))
    msp = doc.modelspace()
    objects: list[dict[str, Any]] = []
    warnings: list[str] = []
    layers: dict[str, dict[str, Any]] = {}

    for layer in doc.layers:
        name = str(layer.dxf.name)
        layers[name] = {"color": "#d7dde5", "visible": True, "locked": False, "lineType": str(getattr(layer.dxf, "linetype", "CONTINUOUS") or "CONTINUOUS")}

    for entity in msp:
        converted, entity_warnings = _entity_to_objects(entity)
        objects.extend(converted)
        warnings.extend(entity_warnings)

    return {
        "schemaVersion": 2,
        "unidade": "mm",
        "activeLayer": next(iter(layers.keys()), "geometria_principal"),
        "layers": layers,
        "objects": objects,
        "dimensions": [],
    }, warnings
