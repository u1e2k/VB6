"""Exact RGB comparison using Pillow's C image operations, not a pixel list.

Keeps the zero-tolerance gate and all prior report statistics. Histogram counts
avoid millions of Python tuples per DPR-4 screenshot on memory-limited CI.
"""
import io
from PIL import Image, ImageChops

def compare_pixels(first_bytes, second_bytes):
    with Image.open(io.BytesIO(first_bytes)) as source:
        first = source.convert('RGB')
    with Image.open(io.BytesIO(second_bytes)) as source:
        second = source.convert('RGB')
    if first.size != second.size:
        raise AssertionError('Framebuffer dimensions differ')
    difference = ImageChops.difference(first, second)
    red, green, blue = difference.split()
    maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue).histogram()
    channels = difference.histogram()
    count = first.width * first.height
    changed = count - maximum[0]
    return {'bounds': difference.getbbox(), 'changedPixels': changed, 'pixels': count, 'fraction': changed / count,
            'maxChannelError': max(i for i, n in enumerate(maximum) if n),
            'meanChannelError': sum((i % 256) * n for i, n in enumerate(channels)) / (count * 3)}
