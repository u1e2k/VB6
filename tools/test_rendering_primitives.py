"""Ensure diagnostic readback cannot replace or repair a presentation oracle."""
import ast
import base64
import io
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from rendering_pixels import compare_pixels

class PrimitiveCaptureTests(unittest.TestCase):
    def run_case(self, *, blank_presentation=False, wrong_readback=False):
        source = Path(__file__).with_name('browser-rendering-tests.py').read_text()
        functions = [n for n in ast.walk(ast.parse(source))
                     if isinstance(n, ast.FunctionDef) and n.name == 'primitive_parity']
        self.assertEqual(len(functions), 1)
        image = Image.new('RGBA', (256, 128), (255, 0, 0, 255))
        encoded = io.BytesIO(); image.convert('RGB').save(encoded, format='PNG')
        white = io.BytesIO(); Image.new('RGB', image.size, 'white').save(white, format='PNG')
        events = []
        class Page:
            errors = []
            backend = None
            def evaluate(page, script, arg=None):
                if arg is not None:
                    page.backend = arg['backend']; events.append(('draw', page.backend, script))
                    return dict(name=page.backend, width=256, height=128, stats={})
                if 'painter.render(primitiveScene' in script:
                    events.append(('readback', page.backend))
                    raw = bytes([0, 0, 255, 255]) * (256*128) if wrong_readback else image.tobytes()
                    return base64.b64encode(raw).decode('ascii')
            def screenshot(page, **kwargs):
                events.append(('screenshot', page.backend, kwargs))
                return white.getvalue() if blank_presentation and page.backend == 'webgpu' else encoded.getvalue()
            def close(page):
                pass
        def check(ok, message):
            if not ok: raise AssertionError(message)
        with tempfile.TemporaryDirectory() as temporary:
            namespace = dict(dpr=1, browser=None, new_page=lambda *a: Page(),
                             METRICS={'backends': {'canvas2d': {'available': True}, 'webgpu': {'available': True}}},
                             REQUIRED=['webgpu'], OUT=Path(temporary), check=check,
                             Image=Image, io=io, base64=base64, pixels=compare_pixels)
            exec(compile(ast.Module(body=functions, type_ignores=[]), 'primitive_parity', 'exec'), namespace)
            result = namespace['primitive_parity']()
        return events, result

    def test_presentation_precedes_diagnostic_readback(self):
        events, result = self.run_case()
        self.assertEqual([(e[0],e[1]) for e in events], [
            ('draw','canvas2d'), ('screenshot','canvas2d'),
            ('draw','webgpu'), ('screenshot','webgpu'), ('readback','webgpu')])
        for event in events:
            if event[0] == 'draw':
                self.assertIn('requestAnimationFrame', event[2])
                self.assertIn('p.render(s)', event[2])
                self.assertNotIn('readback:true', event[2])
        self.assertEqual(result['comparisons']['webgpu']['changedPixels'], 0)

    def test_correct_framebuffer_does_not_rescue_blank_presentation(self):
        with self.assertRaisesRegex(AssertionError, 'pixel mismatch'):
            self.run_case(blank_presentation=True)

    def test_correct_presentation_does_not_rescue_wrong_framebuffer(self):
        with self.assertRaisesRegex(AssertionError, 'diagnostic framebuffer differs'):
            self.run_case(wrong_readback=True)

if __name__ == '__main__':
    unittest.main()
