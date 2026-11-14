#!/usr/bin/env python3
"""공통 처리가 들어간 새 웹앱 뼈대 만들기.

  python3 new_app.py --name "우리집 가계부" --short "가계부" --slug budget --out ./budget \
      [--accent "#3b6cf6"] [--bg-light "#f3f5f8"] [--bg-dark "#10141b"] [--icon icon.svg]

만드는 것: index.html (app-kit CSS·JS 포함, 파일 하나로 동작) · manifest.webmanifest · sw.js · version.txt · 아이콘 4종
--widget 을 주면 위젯 파일 3개(widget-loader.txt · widget-core.js · widget.html)도 만든다.
--icon 이 없으면 임시 아이콘(색 바탕 + 흰 원)을 넣는다. 나중에 make_icons.py 로 바꾼다.
"""
import argparse, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', required=True); ap.add_argument('--short')
    ap.add_argument('--slug', required=True, help='영문 소문자 (캐시 이름·저장소 이름)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--accent', default='#3b6cf6')
    ap.add_argument('--bg-light', default='#f3f5f8'); ap.add_argument('--bg-dark', default='#10141b')
    ap.add_argument('--icon')
    ap.add_argument('--widget', action='store_true', help='아이폰 위젯(Scriptable) 파일도 만든다')
    ap.add_argument('--app-url', default='', help='배포 주소 (예: https://계정.github.io/slug/) — 위젯에 필요')
    ap.add_argument('--data-url', default='', help='위젯이 읽을 JSON 주소')
    a = ap.parse_args()

    build = str(int(time.time()))
    rep = {'{{NAME}}': a.name, '{{SHORT}}': a.short or a.name, '{{SLUG}}': a.slug, '{{ACCENT}}': a.accent,
           '{{BG_LIGHT}}': a.bg_light, '{{BG_DARK}}': a.bg_dark, '{{BUILD}}': build}
    os.makedirs(a.out, exist_ok=True)
    for fn in ('index.html', 'manifest.webmanifest', 'sw.js'):
        s = read(os.path.join(SKILL, 'assets', 'template', fn))
        for k, v in rep.items():
            s = s.replace(k, v)
        if fn == 'index.html':
            s = s.replace('/*KIT_CSS*/', read(os.path.join(SKILL, 'assets', 'kit', 'app-kit.css')).rstrip())
            s = s.replace('/*KIT_JS*/', read(os.path.join(SKILL, 'assets', 'kit', 'app-kit.js')).rstrip())
        with open(os.path.join(a.out, fn), 'w', encoding='utf-8') as f:
            f.write(s)
    with open(os.path.join(a.out, 'version.txt'), 'w') as f:
        f.write(build + '\n')

    if a.widget:
        rep.update({'{{APP_URL}}': a.app_url, '{{DATA_URL}}': a.data_url, '{{MARK}}': a.slug.upper().replace('-', '_') + '_WIDGET'})
        for src, dst in (('widget-loader.js', 'widget-loader.txt'), ('widget-core.js', 'widget-core.js'), ('widget.html', 'widget.html')):
            s = read(os.path.join(SKILL, 'assets', 'widget', src))
            for k, v in rep.items():
                s = s.replace(k, v)
            with open(os.path.join(a.out, dst), 'w', encoding='utf-8') as f:
                f.write(s)

    icon = a.icon
    if not icon:
        icon = os.path.join(a.out, 'icon.svg')
        with open(icon, 'w', encoding='utf-8') as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="{a.accent}"/>'
                    '<circle cx="256" cy="256" r="120" fill="#fff"/></svg>\n')
    subprocess.run([sys.executable, os.path.join(HERE, 'make_icons.py'), icon, a.out, '--v', '1'], check=True)
    print(f'✓ {a.out} 에 새 앱을 만들었어요 (build {build})')


if __name__ == '__main__':
    main()
