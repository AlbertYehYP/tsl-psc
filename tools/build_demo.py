#!/usr/bin/env python3
"""
把整個前端（index.html 內容、app.css、core.js、app.js、世界地圖、示範資料）包成一個可單獨開啟的 HTML 示範檔。

用法（在 repo 根目錄）：
  python3 tools/build_demo.py                 # 讀 data/seed.json，輸出 dist/TSL_PSC_System_Demo.html 與 dist/local_demo.html
  python3 tools/build_demo.py --seed 路徑.json --out 輸出資料夾
沒有 seed 時用空資料庫（畫面可開，但沒有紀錄）。
data/ 與 dist/ 已列在 .gitignore：示範資料是公司實際資料，不要提交到 GitHub。
d3 由 cdn.jsdelivr.net 載入，字型由 Google Fonts 載入；離線時圖表不會出現。
"""
import argparse, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--seed', default=os.path.join(ROOT, 'data', 'seed.json'))
ap.add_argument('--out', default=os.path.join(ROOT, 'dist'))
a = ap.parse_args()

rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
idx = rd('index.html')
body = idx[idx.index('<!--APP-->') + 10:idx.index('<!--/APP-->')]
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)
seed = open(a.seed, encoding='utf-8').read() if os.path.exists(a.seed) else '{}'
seed = seed.replace('</', '<\\/')
fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&family=Noto+Sans+TC:wght@400;500;700&display=swap">')
cfg = "window.PSC_CONFIG={apiUrl:'',googleClientId:'',demo:true,orgName:'德翔海技 TSL MARTEC'};"
out = f'''<title>TSL 船隊事故追蹤系統</title>
<style>{rd('assets/app.css')}</style>
{fonts}
{body}
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script>{cfg}</script>
<script>window.PSC_WORLD={rd('assets/world-110m.json')};</script>
<script>window.PSC_DEMO_SEED={seed};</script>
<script>{rd('assets/core.js')}</script>
<script>{rd('assets/app.js')}</script>
'''
os.makedirs(a.out, exist_ok=True)
open(os.path.join(a.out, 'TSL_PSC_System_Demo.html'), 'w', encoding='utf-8').write(out)
open(os.path.join(a.out, 'local_demo.html'), 'w', encoding='utf-8').write(
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    '<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>' + out + '</body></html>')
print('demo built:', os.path.join(a.out, 'local_demo.html'), f'({len(out):,} bytes, seed {"found" if seed != "{}" else "missing → empty"})')
