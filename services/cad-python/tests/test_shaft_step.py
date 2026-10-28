"""Regressão da exportação STEP por sólidos OpenCascade."""
import base64
import math
import os
import tempfile
import unittest

from app.shaft_step import make_step, validate_shaft
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp


class ShaftStepTests(unittest.TestCase):
    def setUp(self):
        self.shaft = {
            "segments": [
                {"length": 120, "diameter": 127},
                {"length": 100, "diameter": 104},
                {"length": 150, "diameter": 96},
            ]
        }

    def test_solid_volume_and_chamfer_exclusion(self):
        data = make_step(self.shaft)
        expected = math.pi / 4 * (127**2 * 120 + 104**2 * 100 + 96**2 * 150)
        self.assertEqual(data["length_mm"], 370)
        self.assertEqual(data["max_diameter_mm"], 127)
        self.assertEqual(data["chamfers"], "not_specified")
        self.assertEqual(data["holes"], 0)
        self.assertAlmostEqual(data["volume_mm3"], expected, delta=0.02)

    def test_bore_and_three_transverse_holes_roundtrip(self):
        self.shaft["bore"] = {"diameter": 96, "depth": 120}
        self.shaft["crossHoles"] = [
            {"distance": 25, "diameter": 13},
            {"distance": 60, "diameter": 13},
            {"distance": 95, "diameter": 13},
        ]
        result = make_step(self.shaft)
        self.assertEqual(result["holes"], 3)
        raw = base64.b64decode(result["content_base64"])
        self.assertTrue(raw.startswith(b"ISO-10303-21;"))
        fd, path = tempfile.mkstemp(suffix=".step")
        os.close(fd)
        try:
            with open(path, "wb") as f:
                f.write(raw)
            reader = STEPControl_Reader()
            self.assertEqual(reader.ReadFile(path), IFSelect_RetDone)
            reader.TransferRoots()
            shape = reader.OneShape()
            self.assertTrue(BRepCheck_Analyzer(shape).IsValid())
            props = GProp_GProps()
            BRepGProp.VolumeProperties_s(shape, props)
            self.assertAlmostEqual(props.Mass(), result["volume_mm3"], delta=0.1)
        finally:
            os.unlink(path)

    def test_invalid_bore_and_drilling_rejected(self):
        with self.assertRaises(ValueError):
            validate_shaft({**self.shaft, "bore": {"diameter": 127, "depth": 120}})
        with self.assertRaises(ValueError):
            validate_shaft({**self.shaft, "bore": {"diameter": 96, "depth": 121}})
        for holes in (
            [{"distance": 0, "diameter": 13}],
            [{"distance": 125, "diameter": 13}],
            [{"distance": 25, "diameter": 13}, {"distance": 31, "diameter": 13}],
        ):
            with self.subTest(holes=holes):
                with self.assertRaises(ValueError):
                    validate_shaft({**self.shaft, "crossHoles": holes})


if __name__ == "__main__":
    unittest.main()
