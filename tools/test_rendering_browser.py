"""Fail-closed selection of the distinct Playwright headed/headless binaries."""
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from rendering_browser import select_browser


class BrowserSelectionTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(); self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.shell = self.binary('chrome-headless-shell')
        self.full = self.binary('chrome')
        self.command = [str(self.shell), '--enable-automation', '--headless']
        self.calls, self.closed = [], 0

    def binary(self, name):
        path = self.root / name; path.write_bytes(b'fixture'); path.chmod(0o755)
        return path

    def playwright(self, command_error=False, launch_error=False):
        def send(method):
            self.assertEqual(method, 'Browser.getBrowserCommandLine')
            if command_error: raise RuntimeError('CDP probe failed')
            return {'arguments': self.command}
        def close(): self.closed += 1
        def launch(**options):
            self.calls.append(options)
            if launch_error: raise RuntimeError('shell missing')
            return SimpleNamespace(version='fixture-version', close=close,
                                   new_browser_cdp_session=lambda: SimpleNamespace(send=send))
        return SimpleNamespace(chromium=SimpleNamespace(executable_path=str(self.full), launch=launch))

    def test_headless_path_comes_from_real_probe_without_override(self):
        result = select_browser(self.playwright(), 'headless')
        self.assertEqual(result['executable'], str(self.shell))
        self.assertEqual(result['binaryKind'], 'chromium-headless-shell')
        self.assertEqual(self.calls, [{'headless': True, 'timeout': 15000, 'args': ['--enable-automation']}])
        self.assertEqual(self.closed, 1)
        self.assertFalse(result['gpuQualification'])

    def test_headed_uses_full_browser_without_launching_shell(self):
        result = select_browser(self.playwright(), 'headed')
        self.assertEqual(result['executable'], str(self.full))
        self.assertEqual(result['binaryKind'], 'chromium')
        self.assertEqual(self.calls, [])

    def test_missing_shell_does_not_fall_back(self):
        with self.assertRaisesRegex(RuntimeError, 'shell missing'):
            select_browser(self.playwright(launch_error=True), 'headless')
        self.assertEqual(len(self.calls), 1)

    def test_probe_failure_closes_browser(self):
        with self.assertRaisesRegex(RuntimeError, 'CDP probe failed'):
            select_browser(self.playwright(command_error=True), 'headless')
        self.assertEqual(self.closed, 1)

    def test_wrong_browser_and_missing_headless_flag_fail_closed(self):
        for command in [[str(self.full), '--headless'], [str(self.shell), '--enable-automation']]:
            self.command = command
            with self.assertRaises(ValueError): select_browser(self.playwright(), 'headless')
        self.assertEqual(self.closed, 2)

    def test_invalid_command_and_nonexistent_executable_fail(self):
        for command in [None, [], [3], [str(self.root/'absent'/'headless_shell'), '--headless']]:
            self.command = command
            with self.assertRaises(ValueError): select_browser(self.playwright(), 'headless')
        self.assertEqual(self.closed, 4)

    def test_unknown_display_and_injected_paths_fail(self):
        with self.assertRaises(ValueError): select_browser(self.playwright(), 'unknown')
        p = self.playwright(); p.chromium.executable_path = str(self.full)+'\nINJECTED=value'
        with self.assertRaises(ValueError): select_browser(p, 'headed')
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
