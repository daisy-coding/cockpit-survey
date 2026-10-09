"""Проверки настоящей файловой системы; все фикстуры только в .tmp worktree."""
import errno
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HELPER = Path(__file__).resolve().parents[1] / "hooks" / "files.py"
SPEC = importlib.util.spec_from_file_location("survey_files", HELPER)
FILES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FILES)


class FilesTest(unittest.TestCase):
    def setUp(self):
        temporary_root = Path.cwd() / ".tmp"
        temporary_root.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="survey-files-", dir=temporary_root)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.folder = self.root / ".cockpit" / "surveys"
        self.folder.mkdir(parents=True)
        self.source = self.folder / "arch.json"
        self.source.write_text('{"version": 1}', encoding="utf-8")
        self.answers = self.folder / "arch.answers.json"

    def call(self, op, **extra):
        request = {"op": op, "root": str(self.root), "id": "arch", **extra}
        result = subprocess.run([sys.executable, str(HELPER)], input=json.dumps(request), capture_output=True, text=True, check=True)
        self.assertEqual(result.stderr, "")
        return json.loads(result.stdout)

    def test_atomic_roundtrip_and_private_permissions(self):
        self.answers.write_text("old", encoding="utf-8")
        text = '{"text": "$(touch NEVER); свой ответ"}\n'
        self.assertEqual(self.call("write", text=text), {"saved": True})
        self.assertEqual(self.call("answers"), {"text": text})
        self.assertEqual(self.answers.read_text(encoding="utf-8"), text)
        self.assertEqual(stat.S_IMODE(self.answers.stat().st_mode), 0o600)
        self.assertEqual(list(self.folder.glob(".survey-*.tmp")), [])
        self.assertFalse((self.root / "NEVER").exists())

    def test_failed_rename_keeps_old_file_and_removes_temporary(self):
        self.answers.write_text("old", encoding="utf-8")
        with patch.object(FILES.os, "replace", side_effect=OSError(errno.EIO, "PRIVATE")):
            with self.assertRaises(OSError):
                FILES.dispatch({"op": "write", "root": str(self.root), "id": "arch", "text": "new"})
        self.assertEqual(self.answers.read_text(encoding="utf-8"), "old")
        self.assertEqual(list(self.folder.glob(".survey-*.tmp")), [])

    def test_source_and_answer_symlinks_are_not_followed(self):
        victim = self.root / "private.txt"
        victim.write_text("PRIVATE", encoding="utf-8")
        self.source.unlink()
        self.source.symlink_to(victim)
        self.answers.symlink_to(victim)
        for op in ("read", "answers", "write"):
            self.assertEqual(self.call(op, text="new"), {"error": "symlink"})
        self.assertEqual(victim.read_text(encoding="utf-8"), "PRIVATE")

    def test_dangling_symlinks_are_rejected(self):
        self.answers.symlink_to(self.root / "missing")
        self.assertEqual(self.call("answers"), {"error": "symlink"})
        self.assertEqual(self.call("write", text="new"), {"error": "symlink"})
        self.assertFalse((self.root / "missing").exists())

    def test_parent_symlinks_are_rejected(self):
        renamed = self.root / "held-surveys"
        self.folder.rename(renamed)
        self.folder.symlink_to(renamed, target_is_directory=True)
        for op in ("read", "answers", "list", "write"):
            self.assertEqual(self.call(op, text="new"), {"error": "symlink"})
        self.assertFalse((renamed / "arch.answers.json").exists())

    def test_symlink_swap_between_stat_and_open(self):
        victim = self.root / "private.txt"
        victim.write_text("PRIVATE", encoding="utf-8")
        original = FILES.regular

        def swapped(fd, name, optional=False):
            result = original(fd, name, optional)
            self.source.unlink()
            self.source.symlink_to(victim)
            return result

        with patch.object(FILES, "regular", side_effect=swapped):
            with self.assertRaises(OSError) as caught:
                FILES.dispatch({"op": "read", "root": str(self.root), "id": "arch"})
        self.assertEqual(caught.exception.errno, errno.ELOOP)
        self.assertEqual(victim.read_text(encoding="utf-8"), "PRIVATE")

    def test_symlink_swap_before_replace_does_not_touch_target(self):
        victim = self.root / "private.txt"
        victim.write_text("PRIVATE", encoding="utf-8")
        original = FILES.regular
        checks = 0

        def swapped(fd, name, optional=False):
            nonlocal checks
            checks += 1
            if checks == 2:
                self.answers.symlink_to(victim)
            return original(fd, name, optional)

        with patch.object(FILES, "regular", side_effect=swapped):
            with self.assertRaisesRegex(FILES.Refused, "symlink"):
                FILES.dispatch({"op": "write", "root": str(self.root), "id": "arch", "text": "new"})
        self.assertEqual(victim.read_text(encoding="utf-8"), "PRIVATE")
        self.assertEqual(list(self.folder.glob(".survey-*.tmp")), [])

    def test_file_size_id_and_non_regular_file(self):
        self.source.write_bytes(b"x" * (FILES.MAX_BYTES + 1))
        self.assertEqual(self.call("read"), {"error": "size"})
        self.assertEqual(self.call("write", text="🙂" * (FILES.MAX_BYTES // 4 + 1)), {"error": "size"})
        self.assertEqual(self.call("read", id="../private"), {"error": "id"})
        self.assertEqual(self.call("write", id="Bad", text="PRIVATE"), {"error": "id"})
        self.source.unlink()
        os.mkfifo(self.source)
        self.assertEqual(self.call("read"), {"error": "file"})

    def test_listing_ignores_answers_temporary_and_invalid_ids(self):
        self.answers.write_text("answers", encoding="utf-8")
        (self.folder / ".survey-tmp.tmp").write_text("tmp", encoding="utf-8")
        (self.folder / "Bad.json").write_text("bad", encoding="utf-8")
        (self.folder / "linked.json").symlink_to(self.source)
        entries = self.call("list")["entries"]
        self.assertEqual({entry["id"] for entry in entries}, {"arch", "linked"})
        self.assertTrue(next(entry for entry in entries if entry["id"] == "linked")["isLink"])

    def test_missing_directory_and_invalid_utf8_are_short_errors(self):
        self.source.write_bytes(b"\xffPRIVATE")
        self.assertEqual(self.call("read"), {"error": "request"})
        self.assertEqual(self.call("list", root=str(self.root / "missing")), {"entries": []})
        self.assertEqual(self.call("read", root=str(self.root / "missing")), {"error": "missing"})


if __name__ == "__main__":
    unittest.main()
