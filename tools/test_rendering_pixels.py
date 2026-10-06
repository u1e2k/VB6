"""Differentially verify histogram comparison against the original scalar gate."""
import io, random, unittest
from PIL import Image, ImageChops
from rendering_pixels import compare_pixels

def png(image):
    data=io.BytesIO();image.save(data,format='PNG');return data.getvalue()
class PixelTests(unittest.TestCase):
    def test_equivalent_statistics(self):
        rng=random.Random(437)
        for width,height in [(1,1),(3,7),(31,27)]:
            for same in [False,True]:
                first=Image.frombytes('RGB',(width,height),rng.randbytes(width*height*3))
                second=first if same else Image.frombytes('RGB',first.size,rng.randbytes(width*height*3))
                scalar=list(ImageChops.difference(first,second).getdata())
                count=len(scalar);changed=sum(any(p) for p in scalar)
                expected={'changedPixels':changed,'pixels':count,'fraction':changed/count,'maxChannelError':max(max(p) for p in scalar),'meanChannelError':sum(sum(p) for p in scalar)/(count*3)}
                self.assertEqual(compare_pixels(png(first),png(second)),expected)
    def test_one_channel_difference_is_not_lost(self):
        a=Image.new('RGB',(5,5));b=a.copy();b.putpixel((3,3),(0,0,1))
        self.assertEqual(compare_pixels(png(a),png(b))['changedPixels'],1)
    def test_mismatched_dimensions_fail(self):
        with self.assertRaisesRegex(AssertionError,'Framebuffer dimensions differ'):
            compare_pixels(png(Image.new('RGB',(1,1))),png(Image.new('RGB',(2,1))))
if __name__=='__main__':unittest.main()
