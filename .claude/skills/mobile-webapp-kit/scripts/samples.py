#!/usr/bin/env python3
"""디자인 시안을 아이폰 크기로 찍어 한 장으로 나란히 붙인다.

  python3 samples.py 출력폴더 시안A.html 시안B.html 시안C.html [--hash "#demo"] [--dark] [--labels "A 카드형,B 목록형,C 큰 숫자"]

만드는 것: 출력폴더/sample-A.png … (각 시안)  +  출력폴더/compare.png (나란히 붙인 한 장, 위에 A·B·C 표시)
--dark 를 주면 어두운 화면도 함께 찍어 compare-dark.png 를 만든다.
시안은 예시 모드(#demo)로 열려 서버 없이 그려져야 한다. Playwright(Chromium)가 필요하다.
"""
import argparse, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

JS = r"""
const {chromium,devices}=require('playwright');
const [out,hash,scheme,...files]=process.argv.slice(1);
(async()=>{const b=await chromium.launch();
 for(let i=0;i<files.length;i++){
  const c=await b.newContext({...devices['iPhone 14'],colorScheme:scheme});const p=await c.newPage();
  await p.goto('file://'+files[i]+hash);await p.waitForTimeout(1500);
  await p.screenshot({path:`${out}/sample-${String.fromCharCode(65+i)}${scheme==='dark'?'-dark':''}.png`});await c.close();}
 await b.close()})().catch(e=>{console.error(e);process.exit(1)});
"""


def font(size):
    for p in ('/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
              '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/System/Library/Fonts/AppleSDGothicNeo.ttc',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def stitch(out, n, labels, suffix):
    ims = [Image.open(os.path.join(out, f'sample-{chr(65 + i)}{suffix}.png')).convert('RGB') for i in range(n)]
    w, h = ims[0].size
    gap, top = round(w * .06), round(w * .16)
    sheet = Image.new('RGB', (n * w + (n + 1) * gap, h + top + gap), '#e9ebef' if not suffix else '#2a2d34')
    d = ImageDraw.Draw(sheet); f = font(round(w * .07))
    for i, im in enumerate(ims):
        x = gap + i * (w + gap)
        d.text((x, round(top * .22)), labels[i] if i < len(labels) else chr(65 + i), fill='#111318' if not suffix else '#eef0f4', font=f)
        sheet.paste(im, (x, top))
    p = os.path.join(out, f'compare{suffix}.png'); sheet.save(p, optimize=True); print('✓', p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('files', nargs='+')
    ap.add_argument('--hash', default='#demo'); ap.add_argument('--dark', action='store_true'); ap.add_argument('--labels', default='')
    a = ap.parse_args()
    if len(a.files) < 3:
        sys.exit('시안은 3개 이상이어야 해요.')
    os.makedirs(a.out, exist_ok=True)
    files = [os.path.abspath(f) for f in a.files]
    labels = [s.strip() for s in a.labels.split(',') if s.strip()]
    for scheme in (['light', 'dark'] if a.dark else ['light']):
        subprocess.run(['node', '-e', JS, os.path.abspath(a.out), a.hash, scheme, *files], check=True)
        stitch(a.out, len(files), labels, '-dark' if scheme == 'dark' else '')


if __name__ == '__main__':
    main()
