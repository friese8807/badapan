#!/usr/bin/env python3
"""배포 전에 버전 숫자를 올린다 — 휴대폰이 예전 화면을 붙잡지 않게.

  python3 bump_version.py 앱폴더

바꾸는 곳: version.txt · index.html 의  const BUILD = '숫자'  · sw.js 의  const CACHE = '이름-숫자'
"""
import os, re, sys, time

d = sys.argv[1] if len(sys.argv) > 1 else '.'
build = str(int(time.time()))


def sub(fn, pat, repl):
    p = os.path.join(d, fn)
    if not os.path.exists(p):
        return
    s = open(p, encoding='utf-8').read()
    s2, n = re.subn(pat, repl, s, count=1)
    if n:
        open(p, 'w', encoding='utf-8').write(s2)
    print(('✓ ' if n else '– 못 찾음: ') + fn)


sub('index.html', r"(const BUILD\s*=\s*')[0-9]+(')", r'\g<1>' + build + r'\g<2>')
sub('sw.js', r"(const CACHE\s*=\s*'[^']*?-)[0-9]+(')", r'\g<1>' + build + r'\g<2>')
open(os.path.join(d, 'version.txt'), 'w').write(build + '\n')
print('✓ version.txt →', build)
