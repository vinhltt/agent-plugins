"""Regression tests for xlsx-to-csv output path mapping and CLI wiring.

Stdlib only: pandas is never imported, so the suite runs on a bare system Python.
Run from the repo root:
    python3 -m unittest discover -s plugins/document-converter/skills/xlsx-to-csv/tests -v
"""

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path, PurePosixPath, PureWindowsPath
from unittest import mock

SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "xlsx-to-csv-convert.py"


def load_script():
    """Load the hyphenated script file as a module."""
    spec = importlib.util.spec_from_file_location("xlsx_to_csv_convert", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


conv = load_script()


def map_auto(path, is_dir=False, target_dir=None):
    mapper, _, _ = conv.build_output_mapper(path, is_dir, None, target_dir)
    return mapper


class AutoModeMappingTests(unittest.TestCase):
    def test_nested_file_maps_to_parent_sibling(self):
        p = PurePosixPath("/ws/specs/sample/docs/file.xlsx")
        self.assertEqual(map_auto(p)(p), PurePosixPath("/ws/specs/sample/docs_CSV_AI/file.xlsx"))

    def test_ancestor_with_same_name_is_ignored(self):
        p = PurePosixPath("/ws2/docs/x/docs/f.xlsx")
        self.assertEqual(map_auto(p)(p), PurePosixPath("/ws2/docs/x/docs_CSV_AI/f.xlsx"))

    def test_dir_with_nested_same_name_subfolder(self):
        anchor = PurePosixPath("/ws/docs")
        f = PurePosixPath("/ws/docs/a/docs/f.xlsx")
        self.assertEqual(map_auto(anchor, is_dir=True)(f), PurePosixPath("/ws/docs_CSV_AI/a/docs/f.xlsx"))

    def test_windows_file(self):
        p = PureWindowsPath("D:/proj/docs/f.xlsx")
        self.assertEqual(map_auto(p)(p), PureWindowsPath("D:/proj/docs_CSV_AI/f.xlsx"))

    def test_windows_dir_nested(self):
        anchor = PureWindowsPath("D:/proj/docs")
        f = PureWindowsPath("D:/proj/docs/sub/f.xlsx")
        self.assertEqual(map_auto(anchor, is_dir=True)(f), PureWindowsPath("D:/proj/docs_CSV_AI/sub/f.xlsx"))

    def test_file_and_dir_input_agree(self):
        f = PurePosixPath("/x/docs/f.xlsx")
        self.assertEqual(map_auto(f)(f), map_auto(PurePosixPath("/x/docs"), is_dir=True)(f))

    def test_target_dir_alone_is_honored(self):
        p = PurePosixPath("/ws/docs/f.xlsx")
        self.assertEqual(map_auto(p, target_dir="Out")(p), PurePosixPath("/ws/Out/f.xlsx"))

    def test_summary_labels(self):
        _, source, target = conv.build_output_mapper(PurePosixPath("/ws/docs/f.xlsx"), False, None, None)
        self.assertEqual((source, target), ("/ws/docs", "/ws/docs_CSV_AI"))


class RootGuardTests(unittest.TestCase):
    def test_inputs_at_filesystem_root_are_rejected(self):
        cases = [
            (PurePosixPath("/f.xlsx"), False),
            (PureWindowsPath("D:/f.xlsx"), False),
            (PureWindowsPath(r"\\srv\share\f.xlsx"), False),
            (PurePosixPath("/"), True),
        ]
        for path, is_dir in cases:
            with self.subTest(path=str(path)):
                with self.assertRaisesRegex(ValueError, "filesystem root"):
                    conv.build_output_mapper(path, is_dir, None, None)


class TargetDirValidationTests(unittest.TestCase):
    def test_invalid_names_rejected(self):
        for name in ["/abs", "..", ".", "", "a/b", r"C:\x", r"a\b", "C:x", "Out/"]:
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    conv.validate_target_name(name)

    def test_plain_name_accepted(self):
        self.assertEqual(conv.validate_target_name("Out_CSV"), "Out_CSV")

    def test_invalid_name_rejected_through_mapper_in_both_modes(self):
        p = PurePosixPath("/ws/docs/f.xlsx")
        for source_dir in (None, "docs"):
            with self.subTest(source_dir=source_dir):
                with self.assertRaises(ValueError):
                    conv.build_output_mapper(p, False, source_dir, "..")

    def test_auto_target_equal_to_source_folder_rejected(self):
        for name in ("docs", "DOCS", "docs.", "docs "):
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, "source folder"):
                    conv.build_output_mapper(PurePosixPath("/ws/docs/f.xlsx"), False, None, name)


class ExplicitModeTests(unittest.TestCase):
    def test_first_matching_segment_replaced(self):
        p = PurePosixPath("/ws2/docs/x/docs/f.xlsx")
        mapper, source, target = conv.build_output_mapper(p, False, "docs", None)
        self.assertEqual(mapper(p), PurePosixPath("/ws2/docs_CSV_AI/x/docs/f.xlsx"))
        self.assertEqual((source, target), ("docs", "docs_CSV_AI"))

    def test_path_flavour_preserved(self):
        p = PureWindowsPath("D:/ws2/docs/x/docs/f.xlsx")
        mapper, _, _ = conv.build_output_mapper(p, False, "docs", None)
        out = mapper(p)
        self.assertIsInstance(out, PureWindowsPath)
        self.assertEqual(out, PureWindowsPath("D:/ws2/docs_CSV_AI/x/docs/f.xlsx"))

    def test_explicit_target_dir(self):
        p = PurePosixPath("/ws/docs/a/f.xlsx")
        mapper, _, _ = conv.build_output_mapper(p, False, "docs", "Out")
        self.assertEqual(mapper(p), PurePosixPath("/ws/Out/a/f.xlsx"))


class RealFilesystemTests(unittest.TestCase):
    def test_temp_dir_mapping_creates_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs"
            docs.mkdir()
            xlsx = docs / "f.xlsx"
            xlsx.touch()
            p = Path(os.path.abspath(xlsx))
            mapper, _, _ = conv.build_output_mapper(p, False, None, None)
            out = mapper(p)
            self.assertEqual(out, Path(os.path.abspath(tmp)) / "docs_CSV_AI" / "f.xlsx")
            self.assertFalse(out.parent.exists())

    def test_import_without_pandas(self):
        with mock.patch.dict(sys.modules, {"pandas": None}):
            module = load_script()
        self.assertTrue(hasattr(module, "build_output_mapper"))


class WriteErrorTests(unittest.TestCase):
    """Per-file write errors are reported and skipped; a fake pandas keeps this stdlib-only."""

    def test_os_error_is_reported_not_raised(self):
        sheet = mock.Mock()
        sheet.to_csv.side_effect = PermissionError("denied")
        fake_pd = mock.Mock()
        fake_pd.read_excel.return_value = {"S1": sheet, "S2": sheet}
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(sys.modules, {"pandas": fake_pd}), \
                mock.patch("builtins.print") as printed:
            xlsx = Path(tmp) / "docs" / "f.xlsx"
            result = conv.convert_xlsx_to_csv(xlsx, lambda p: Path(tmp) / "out" / p.name)
        self.assertEqual(result, ([], 0, 2))
        errors = [c.args[0] for c in printed.call_args_list if "ERROR writing" in c.args[0]]
        self.assertEqual(len(errors), 2)

    def test_makedirs_error_is_reported_not_raised(self):
        fake_pd = mock.Mock()
        fake_pd.read_excel.return_value = {"S1": mock.Mock()}
        with mock.patch.dict(sys.modules, {"pandas": fake_pd}), \
                mock.patch.object(conv.os, "makedirs", side_effect=PermissionError("denied")), \
                mock.patch("builtins.print") as printed:
            result = conv.convert_xlsx_to_csv(Path("/x/f.xlsx"), lambda p: Path("/ro/out/f.xlsx"))
        self.assertEqual(result, ([], 0, 1))
        self.assertTrue(any("ERROR writing" in c.args[0] for c in printed.call_args_list))

    def test_read_error_counts_as_failed(self):
        fake_pd = mock.Mock()
        fake_pd.read_excel.side_effect = ValueError("not a workbook")
        with mock.patch.dict(sys.modules, {"pandas": fake_pd}), mock.patch("builtins.print"):
            result = conv.convert_xlsx_to_csv(Path("/x/f.xlsx"), lambda p: p)
        self.assertEqual(result, ([], 0, 1))


class MainWiringTests(unittest.TestCase):
    """Drive main() with the converters patched out; assert the mapper it builds."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        # realpath: cwd-based (relative) inputs come back physical, e.g. macOS /var -> /private/var
        self.root = Path(os.path.realpath(tmp.name))
        self.docs = self.root / "ws" / "docs"
        self.docs.mkdir(parents=True)
        self.xlsx = self.docs / "f.xlsx"
        self.xlsx.touch()

    def run_main(self, *argv):
        """Run main() and return (converter name, mapper) it was called with."""
        with mock.patch.object(conv, "convert_xlsx_to_csv", return_value=([], 0, 0)) as file_conv, \
                mock.patch.object(conv, "convert_directory", return_value=([], 0, 0)) as dir_conv, \
                mock.patch.object(sys, "argv", ["xlsx-to-csv-convert.py", *argv]), \
                mock.patch("builtins.print") as printed:
            conv.main()
        self.printed = [" ".join(map(str, c.args)) for c in printed.call_args_list]
        if file_conv.called:
            return "file", file_conv.call_args.args[1]
        return "dir", dir_conv.call_args.args[1]

    def test_file_with_target_dir_only(self):
        kind, mapper = self.run_main(str(self.xlsx), "--target-dir", "Out")
        self.assertEqual(kind, "file")
        self.assertEqual(mapper(self.xlsx), self.root / "ws" / "Out" / "f.xlsx")

    def test_dir_auto(self):
        kind, mapper = self.run_main(str(self.docs))
        self.assertEqual(kind, "dir")
        self.assertEqual(mapper(self.docs / "sub" / "f.xlsx"), self.root / "ws" / "docs_CSV_AI" / "sub" / "f.xlsx")

    def test_explicit_source_dir(self):
        _, mapper = self.run_main(str(self.xlsx), "--source-dir", "ws")
        self.assertEqual(mapper(self.xlsx), self.root / "ws_CSV_AI" / "docs" / "f.xlsx")
        self.assertIn("Source: ws → Target: ws_CSV_AI", self.printed)

    def test_auto_mode_prints_auto_detected_line(self):
        self.run_main(str(self.docs))
        self.assertIn(f"Auto-detected: {self.docs} → {self.root / 'ws' / 'docs_CSV_AI'}", self.printed)

    def test_relative_input_matches_absolute(self):
        cwd = os.getcwd()
        self.addCleanup(os.chdir, cwd)
        os.chdir(self.root / "ws")
        _, mapper = self.run_main(os.path.join("docs", "f.xlsx"))
        self.assertEqual(mapper(self.xlsx), self.root / "ws" / "docs_CSV_AI" / "f.xlsx")

    def test_invalid_target_dir_exits_1(self):
        with self.assertRaises(SystemExit) as ctx:
            self.run_main(str(self.xlsx), "--target-dir", "..")
        self.assertEqual(ctx.exception.code, 1)

    def test_failed_conversion_exits_1(self):
        with mock.patch.object(conv, "convert_xlsx_to_csv", return_value=([], 0, 1)), \
                mock.patch.object(sys, "argv", ["xlsx-to-csv-convert.py", str(self.xlsx)]), \
                mock.patch("builtins.print") as printed:
            with self.assertRaises(SystemExit) as ctx:
                conv.main()
        self.assertEqual(ctx.exception.code, 1)
        self.assertIn("\nDone. 0 created, 0 skipped, 1 failed.", [c.args[0] for c in printed.call_args_list])

    def test_mapper_error_exits_1(self):
        with mock.patch.object(conv, "build_output_mapper", side_effect=ValueError("x")):
            with self.assertRaises(SystemExit) as ctx:
                self.run_main(str(self.xlsx))
        self.assertEqual(ctx.exception.code, 1)

    @unittest.skipUnless(hasattr(os, "symlink") and os.name != "nt", "POSIX symlinks only")
    def test_symlinked_dir_maps_beside_link(self):
        real = self.root / "real" / "data"
        real.mkdir(parents=True)
        link = self.root / "ws" / "linked"
        os.symlink(real, link)
        _, mapper = self.run_main(str(link))
        self.assertEqual(mapper(link / "f.xlsx"), self.root / "ws" / "linked_CSV_AI" / "f.xlsx")


if __name__ == "__main__":
    unittest.main()
