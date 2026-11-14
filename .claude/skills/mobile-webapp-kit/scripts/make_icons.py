#!/usr/bin/env python3
"""홈 화면 아이콘 세트 만들기.

  python3 make_icons.py 원본.svg|png|jpg  출력폴더  [--v 1] [--bg "#10141b"]

만드는 파일 (v = 버전 번호, 아이콘을 바꿀 때마다 올린다 — 아이폰이 예전 아이콘을 붙잡지 않게):
  icon-180-v{v}.png            아이폰 홈 화면 (apple-touch-icon) — 투명 없음, 모서리는 아이폰이 깎는다
  icon-192-v{v}.png            안드로이드
  icon-512-v{v}.png            안드로이드·스플래시
  icon-512-maskable-v{v}.png   안드로이드 적응형 — 그림을 80% 로 줄여 배경색 위에 올린다
원본은 정사각형, 512px 이상, 배경이 꽉 찬 그림이어야 한다 (모서리를 둥글게 그리지 말 것).
"""
import argparse, io, os, shutil, subprocess, sys, tempfile
from PIL import Image


def render_svg(svg_path, size=1024):
    """SVG → PNG. cairosvg → rsvg-convert → Playwright(Chromium) 순서로 시도."""
    try:
        import cairosvg
        return Image.open(io.BytesIO(cairosvg.svg2png(url=svg_path, output_width=size, output_height=size)))
    except ImportError:
        pass
    out = os.path.join(tempfile.mkdtemp(), 'icon.png')
    if shutil.which('rsvg-convert'):
        subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), svg_path, '-o', out], check=True)
        return Image.open(out)
    if shutil.which('node'):
        js = ("const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();"
              "const p=await b.newPage({viewport:{width:%d,height:%d}});"
              "const svg=require('fs').readFileSync(process.argv[1],'utf8');"
              "await p.setContent('<style>html,body{margin:0}svg{width:100vw;height:100vh;display:block}</style>'+svg);"
              "await p.screenshot({path:process.argv[2]});await b.close()})()") % (size, size)
        r = subprocess.run(['node', '-e', js, os.path.abspath(svg_path), out], capture_output=True, text=True)
        if r.returncode == 0:
            return Image.open(out)
    sys.exit('SVG 를 그릴 도구가 없어요:  pip install cairosvg  후 다시 실행하세요.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--v', default='1'); ap.add_argument('--bg', default=None, help='maskable 여백·투명 부분을 채울 색')
    a = ap.parse_args()

    im = render_svg(a.src) if a.src.lower().endswith('.svg') else Image.open(a.src)
    im = im.convert('RGBA')
    w, h = im.size
    if w != h:  # 가운데를 정사각형으로 자른다
        s = min(w, h); im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    if im.size[0] < 512:
        print(f'⚠ 원본이 {im.size[0]}px 로 작아요. 512px 이상을 권장합니다.')
    bg = a.bg or '#%02x%02x%02x' % im.getpixel((2, 2))[:3]   # 지정이 없으면 왼쪽 위 색

    def flat(img):  # 투명 제거 (아이폰은 투명을 검게 칠한다)
        base = Image.new('RGBA', img.size, bg); base.alpha_composite(img); return base.convert('RGB')

    os.makedirs(a.out, exist_ok=True)
    full = flat(im)
    for size in (180, 192, 512):
        full.resize((size, size), Image.LANCZOS).save(os.path.join(a.out, f'icon-{size}-v{a.v}.png'), optimize=True)
    mask = Image.new('RGBA', (512, 512), bg)
    inner = im.resize((410, 410), Image.LANCZOS)
    mask.alpha_composite(inner, (51, 51))
    mask.convert('RGB').save(os.path.join(a.out, f'icon-512-maskable-v{a.v}.png'), optimize=True)
    print(f'✓ {a.out}: icon-180/192/512/512-maskable -v{a.v}.png  (배경 {bg})')


if __name__ == '__main__':
    main()
