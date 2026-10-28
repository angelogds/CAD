"""STEP (brep) exato para eixos em milímetros, via OpenCascade/OCP."""
import base64
import math
import os
import tempfile
from collections.abc import Mapping

LIMIT = 8_000_000

def positive(value, label, maximum):
    try: v = float(value)
    except (TypeError, ValueError): raise ValueError(f"{label}: número inválido") from None
    if not math.isfinite(v) or not 0 < v <= maximum:
        raise ValueError(f"{label}: fora dos limites")
    return v

def validate_shaft(spec):
    if not isinstance(spec, Mapping): raise ValueError("Parâmetros do eixo não informados")
    raw = spec.get("segments")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 12:
        raise ValueError("Informe entre 1 e 12 trechos do eixo")
    sections = []
    for i, seg in enumerate(raw, 1):
        if not isinstance(seg, Mapping): raise ValueError(f"Trecho {i} inválido")
        sections.append({
            "length": positive(seg.get("length"), f"Comprimento {i}", 10000),
            "diameter": positive(seg.get("diameter"), f"Diâmetro {i}", 2000),
        })
    total = sum(s["length"] for s in sections)
    if total > 10000: raise ValueError("Comprimento total acima de 10000 mm")
    bore = None
    if spec.get("bore"):
        obj = spec["bore"]
        if not isinstance(obj, Mapping): raise ValueError("Alojamento inválido")
        d = positive(obj.get("diameter"), "Ø alojamento", 2000)
        h = positive(obj.get("depth"), "Profundidade alojamento", 10000)
        if d >= sections[0]["diameter"] or h > sections[0]["length"]:
            raise ValueError("Alojamento precisa caber no primeiro trecho")
        bore = {"diameter": d, "depth": h}
    raw_holes = spec.get("crossHoles") or []
    if not isinstance(raw_holes, list) or len(raw_holes) > 36:
        raise ValueError("Máximo de 36 furos transversais")
    holes = []
    for i, hole in enumerate(raw_holes, 1):
        if not isinstance(hole, Mapping): raise ValueError(f"Furo {i} inválido")
        x = positive(hole.get("distance"), f"Posição do furo {i}", total)
        d = positive(hole.get("diameter"), f"Ø furo {i}", 2000)
        if (d >= sections[0]["diameter"] or x-d/2 <= 0 or
            x+d/2 >= sections[0]["length"] or (bore and x+d/2 > bore["depth"])):
            raise ValueError(f"Furo {i} fora da área de alojamento")
        holes.append({"distance": x, "diameter": d})
    holes.sort(key=lambda h: h["distance"])
    for a, b in zip(holes, holes[1:]):
        if b["distance"] - a["distance"] <= (a["diameter"]+b["diameter"])/2:
            raise ValueError("Furos transversais sobrepostos")
    return {"segments": sections, "bore": bore, "crossHoles": holes,
            "total": total, "maxDiameter": max(s["diameter"] for s in sections)}

def make_step(spec):
    """Retorna STEP real e volume medido; sem aplicar chanfros não cotados."""
    model = validate_shaft(spec)
    try:
        from OCP.gp import gp_Ax2, gp_Pnt, gp_Dir
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
        from OCP.BRepCheck import BRepCheck_Analyzer
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopAbs import TopAbs_SOLID
        from OCP.GProp import GProp_GProps
        from OCP.BRepGProp import BRepGProp
        from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
        from OCP.IFSelect import IFSelect_RetDone
    except ImportError as exc:
        raise RuntimeError("OCCT indisponível no CAD Python Engine") from exc

    def cylinder(origin, direction, radius, height):
        return BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(*origin),gp_Dir(*direction)),radius,height).Shape()

    def boolean(operation, label):
        operation.Build()
        if not operation.IsDone(): raise ValueError("Falha no recorte: "+label)
        return operation.Shape()

    x, solid = 0.0, None
    for section in model["segments"]:
        part = cylinder((x,0,0),(1,0,0),section["diameter"]/2,section["length"])
        solid = part if solid is None else boolean(BRepAlgoAPI_Fuse(solid,part),"união")
        x += section["length"]
    if model["bore"]:
        bore = model["bore"]
        drill = cylinder((-1,0,0),(1,0,0),bore["diameter"]/2,bore["depth"]+1)
        solid = boolean(BRepAlgoAPI_Cut(solid,drill),"alojamento")
    for hole in model["crossHoles"]:
        radius = hole["diameter"]/2
        drill = cylinder((hole["distance"],0,-model["maxDiameter"]),
            (0,0,1),radius,2*model["maxDiameter"])
        solid = boolean(BRepAlgoAPI_Cut(solid,drill),"furo transversal")
    if solid.IsNull() or not BRepCheck_Analyzer(solid).IsValid():
        raise ValueError("Geometria STEP inválida")
    explorer = TopExp_Explorer(solid,TopAbs_SOLID)
    count = 0
    while explorer.More():
        count += 1
        explorer.Next()
    if count != 1: raise ValueError("A peça precisa formar um único sólido")
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(solid,props)
    volume = float(props.Mass())
    if not math.isfinite(volume) or volume <= 0: raise ValueError("Volume inválido")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".step",delete=False) as f:
            tmp_path = f.name
        writer = STEPControl_Writer()
        if writer.Transfer(solid,STEPControl_AsIs) != IFSelect_RetDone:
            raise ValueError("Falha ao preparar STEP")
        if writer.Write(tmp_path) != IFSelect_RetDone:
            raise ValueError("Falha ao gravar STEP")
        with open(tmp_path,"rb") as f: raw = f.read(LIMIT+1)
        if len(raw) > LIMIT: raise ValueError("Arquivo STEP acima de 8 MB")
        if not raw.startswith(b"ISO-10303-21;"): raise ValueError("STEP sem cabeçalho válido")
        return {"content_base64":base64.b64encode(raw).decode("ascii"),
                "bytes":len(raw),"volume_mm3":round(volume,2),
                "length_mm":model["total"],"max_diameter_mm":model["maxDiameter"],
                "holes":len(model["crossHoles"]),"units":"MM",
                "chamfers":"not_specified"}
    finally:
        if tmp_path and os.path.exists(tmp_path): os.unlink(tmp_path)
