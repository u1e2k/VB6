"""Resolve pinned Playwright binaries without changing rendering acceptance.

Playwright ships separate headed Chromium and headless shell binaries:
https://playwright.dev/python/docs/browsers#chromium-headless-shell
The shell path is reported by a real browser, not guessed from install paths:
https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-getBrowserCommandLine
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path


def select_browser(playwright, display: str) -> dict:
    if display not in ('headed', 'headless'):
        raise ValueError('display must be headed or headless')
    command, version = [], None
    if display == 'headed':
        executable = playwright.chromium.executable_path
        kind = 'chromium'
    else:
        # No channel or executable override: Playwright selects its own shell.
        # A missing shell or failed probe is fatal; do not try another browser.
        # CDP exposes its command line only with this explicit opt-in.
        browser = playwright.chromium.launch(headless=True, timeout=15000, args=['--enable-automation'])
        try:
            version = browser.version
            command = browser.new_browser_cdp_session().send('Browser.getBrowserCommandLine')['arguments']
            if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
                raise ValueError('Browser did not report a valid command line')
            executable = command[0]
            name = Path(executable).name.lower().removesuffix('.exe')
            if name not in ('headless_shell', 'chrome-headless-shell') or not any(x == '--headless' or x.startswith('--headless=') for x in command[1:]):
                raise ValueError('Playwright did not launch the requested headless shell')
            kind = 'chromium-headless-shell'
        finally:
            browser.close()
    if not isinstance(executable, str) or any(x in executable for x in ('\r', '\n', '\x00')):
        raise ValueError('Invalid browser executable path')
    path = Path(executable)
    if not path.is_absolute() or not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError('Selected browser executable is missing or not executable')
    return {'display': display, 'binaryKind': kind, 'executable': executable,
            'probeVersion': version, 'probeCommand': command,
            'selectionOnly': True, 'gpuQualification': False}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--display', choices=['headed', 'headless'], required=True)
    args = parser.parse_args()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        result = select_browser(playwright, args.display)
    output = Path(__file__).resolve().parents[1] / 'reports/rendering/browser-selection.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    # Intended for GITHUB_ENV. Selection is not a graphics pass; the following
    # unmodified 40-case suite still requires actual API/presentation/readback.
    print('CHROMIUM_PATH=' + result['executable'])


if __name__ == '__main__':
    main()
