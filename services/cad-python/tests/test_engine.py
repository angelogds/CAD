import math
import unittest

from app.cad_engine import analyze_cad, export_dxf, import_dxf
from app.manufacturing_metrics import enhance_analysis, prepare_analysis_cad


class CadEngineTests(unittest.TestCase):
    def test_analyze_area_perimeter_and_mass(self):
        cad = {
            "material": "AÇO A36",
            "objects": [
                {"id": "r1", "type": "rect", "x": 0, "y": 0, "width": 1000, "height": 500, "visible": True},
            ],
        }
        result = analyze_cad(cad, thickness_mm=10)
        self.assertEqual(result["validation"]["errors"], 0)
        self.assertAlmostEqual(result["metrics"]["area_m2"], 0.5, places=5)
        self.assertAlmostEqual(result["metrics"]["perimeter_m"], 3.0, places=5)
        self.assertAlmostEqual(result["metrics"]["estimated_mass_kg"], 39.25, places=2)

    def test_detects_zero_length_and_duplicate(self):
        line = {"type": "line", "x": 1, "y": 1, "x2": 1, "y2": 1, "visible": True}
        cad = {"objects": [{"id": "a", **line}, {"id": "b", **line}]}
        result = analyze_cad(cad)
        codes = [issue["code"] for issue in result["validation"]["issues"]]
        self.assertIn("ZERO_LENGTH", codes)
        self.assertIn("DUPLICATE", codes)

    def test_dxf_roundtrip_supported_entities(self):
        cad = {
            "layers": {"contorno": {"visible": True}},
            "objects": [
                {"id": "l1", "type": "line", "x": 0, "y": 0, "x2": 100, "y2": 0, "layer": "contorno", "visible": True},
                {"id": "c1", "type": "circle", "x": 50, "y": 50, "radius": 20, "layer": "contorno", "visible": True},
                {"id": "p1", "type": "polyline", "points": [{"x": 0, "y": 0}, {"x": 20, "y": 0}, {"x": 20, "y": 20}], "closed": True, "layer": "contorno", "visible": True},
            ],
        }
        content, warnings = export_dxf(cad)
        self.assertIn("SECTION", content)
        self.assertEqual(warnings, [])
        imported, import_warnings = import_dxf(content)
        types = [obj["type"] for obj in imported["objects"]]
        self.assertIn("line", types)
        self.assertIn("circle", types)
        self.assertIn("polyline", types)
        self.assertEqual(import_warnings, [])

    def test_flange_volume_mass_and_sheet_is_ignored(self):
        objects = [
            {"id": "outer", "type": "circle", "x": 0, "y": 0, "radius": 150, "visible": True},
            {"id": "bore", "type": "circle", "x": 0, "y": 0, "radius": 40, "visible": True},
            {
                "id": "side",
                "type": "polyline",
                "points": [{"x": 200, "y": -150}, {"x": 220, "y": -150}, {"x": 220, "y": 150}, {"x": 200, "y": 150}],
                "closed": True,
                "visible": True,
            },
            {
                "id": "sheet",
                "type": "polyline",
                "layer": "FAB_FOLHA_TECNICA",
                "points": [{"x": -1000, "y": -1000}, {"x": 1000, "y": -1000}, {"x": 1000, "y": 1000}, {"x": -1000, "y": 1000}],
                "closed": True,
                "visible": True,
            },
        ]
        for index in range(8):
            angle = 2 * math.pi * index / 8
            objects.append({
                "id": f"h{index}",
                "type": "circle",
                "x": math.cos(angle) * 110,
                "y": math.sin(angle) * 110,
                "radius": 9,
                "visible": True,
            })
        cad = {"material": "AÇO SAE 1045", "objects": objects}
        prepared = prepare_analysis_cad(cad)
        base = analyze_cad(prepared)
        result = enhance_analysis(cad, base)
        metrics = result["metrics"]
        expected_area = math.pi * 150**2 - math.pi * 40**2 - 8 * math.pi * 9**2
        expected_volume = expected_area * 20
        self.assertEqual(metrics["part_type"], "FLANGE")
        self.assertEqual(metrics["hole_count"], 8)
        self.assertAlmostEqual(metrics["area_mm2"], expected_area, places=2)
        self.assertAlmostEqual(metrics["volume_mm3"], expected_volume, places=2)
        self.assertAlmostEqual(metrics["estimated_mass_kg"], expected_volume / 1_000_000_000 * 7850, places=3)
        self.assertEqual(metrics["generated_entities_ignored"], 1)

    def test_stepped_shaft_uses_solid_of_revolution(self):
        cad = {
            "material": "AÇO SAE 1045",
            "objects": [
                {"type": "polyline", "points": [{"x": 0, "y": -30}, {"x": 80, "y": -30}, {"x": 80, "y": 30}, {"x": 0, "y": 30}], "closed": True, "visible": True},
                {"type": "polyline", "points": [{"x": 80, "y": -25}, {"x": 200, "y": -25}, {"x": 200, "y": 25}, {"x": 80, "y": 25}], "closed": True, "visible": True},
                {"type": "polyline", "points": [{"x": 200, "y": -20}, {"x": 260, "y": -20}, {"x": 260, "y": 20}, {"x": 200, "y": 20}], "closed": True, "visible": True},
            ],
        }
        prepared = prepare_analysis_cad(cad)
        base = analyze_cad(prepared)
        result = enhance_analysis(cad, base)
        metrics = result["metrics"]
        expected_volume = math.pi * 30**2 * 80 + math.pi * 25**2 * 120 + math.pi * 20**2 * 60
        self.assertEqual(metrics["part_type"], "EIXO_ESCALONADO")
        self.assertAlmostEqual(metrics["volume_mm3"], expected_volume, places=2)
        self.assertAlmostEqual(metrics["total_length_mm"], 260, places=3)
        self.assertAlmostEqual(metrics["max_diameter_mm"], 60, places=3)


if __name__ == "__main__":
    unittest.main()
