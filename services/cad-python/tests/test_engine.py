import unittest

from app.cad_engine import analyze_cad, export_dxf, import_dxf


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


if __name__ == "__main__":
    unittest.main()
