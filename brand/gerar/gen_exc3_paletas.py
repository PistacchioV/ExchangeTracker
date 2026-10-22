"""EXC v3: letras inteiras (E redondo, X, C) cortadas por um skyline de barras.
Acima do skyline = cor principal; abaixo = barras de destaque com topos curvos,
em seta e diagonais, separadas por vãos de 22-24."""
import math, os
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAP = 22

def bez(p0, p1, p2, p3, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        x = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t**2*p2[0] + t**3*p3[0]
        y = (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t**2*p2[1] + t**3*p3[1]
        out.append((x, y))
    return out

def line(a, b, n=8):
    return [(a[0] + (b[0]-a[0])*i/n, a[1] + (b[1]-a[1])*i/n) for i in range(n + 1)]

# topo de cada coluna (da esquerda para a direita), sem sobrepor em x
COLS = [
    bez((7, 446), (60, 470), (110, 482), (170, 482)),                       # E · curva côncava
    line((194, 474), (262, 434), 6) + line((262, 434), (330, 474), 6)[1:],   # E · seta
    bez((354, 512), (400, 508), (440, 490), (470, 446)),                     # E · sobe curvando
    bez((515, 606), (528, 606), (536, 598), (546, 588)) + line((546, 588), (745, 420))[1:],   # X · diagonal
    bez((769, 336), (784, 327), (792, 322), (802, 312)) + line((802, 312), (990, 40))[1:],    # X · barra principal
    bez((1030, 478), (1090, 502), (1160, 502), (1222, 470)) + line((1222, 470), (1608, 296))[1:],  # C · onda
]

def top_at(col, x):
    for (x0, y0), (x1, y1) in zip(col, col[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * ((x - x0) / (x1 - x0) if x1 != x0 else 0), (y1 - y0) / (x1 - x0 or 1)
    return None

def ink_boundary():
    """A borda de baixo da cor principal: o topo de cada coluna recuado o vão
    (na perpendicular); nos vãos entre colunas, a borda mais alta das vizinhas."""
    pts = []
    xs = [c[0][0] for c in COLS] + [c[-1][0] for c in COLS]
    x = -20.0
    while x <= 1640:
        y = None
        for c in COLS:
            r = top_at(c, x)
            if r:
                yt, s = r
                y = yt - GAP * math.sqrt(1 + s * s)
                break
        if y is None:
            # fora das colunas: vizinha da esquerda e da direita
            esq = [c for c in COLS if c[-1][0] < x]
            dir_ = [c for c in COLS if c[0][0] > x]
            cand = []
            if esq: cand.append(esq[-1][-1][1] - GAP * 1.4)
            if dir_: cand.append(dir_[0][0][1] - GAP * 1.4)
            y = min(cand)
        pts.append((x, y))
        x += 2
    return pts

def fmt(pts):
    return " ".join("%.1f %.1f" % p for p in pts)

E_RING = "M468 38A323 323 0 1 0 468 622L468 429.3A170 170 0 1 1 468 230.7Z"
C_RING = "M1593 113.9A323 323 0 1 0 1593 546.1L1479.3 443.8A170 170 0 1 1 1479.3 216.2Z"

def glyphs(p):
    return f'''<path d="{E_RING}"/>
      <rect x="150" y="250" width="320" height="160"/>
      <g clip-path="url(#{p}-xbox)"><path d="M565.9 -80L939.1 740M939.1 -80L565.9 740" stroke-width="164" stroke="inherit"/></g>
      <path d="{C_RING}"/>'''

GRAD = {'dark': ('#F0FF94', '#C6F91F', '#93CF00'), 'light': ('#D9FF45', '#B9EC12', '#86BB00')}

def symbol(p, ink, acc, grad=None):
    cols = "".join("M%s L%.1f 720 L%.1f 720 Z " % (fmt(c), c[-1][0], c[0][0]) for c in COLS)
    inkpoly = "M" + fmt(ink_boundary()) + " L1640 -40 L-20 -40 Z"
    def letra(cor):
        return f'''<g fill="{cor}" stroke="{cor}">
      <path d="{E_RING}" stroke="none"/>
      <rect x="150" y="250" width="320" height="160" stroke="none"/>
      <g clip-path="url(#{p}-xbox)"><path d="M565.9 -80L939.1 740M939.1 -80L565.9 740" fill="none" stroke-width="164"/></g>
      <path d="{C_RING}" stroke="none"/>
    </g>'''
    gdef = ""
    if grad:
        a, b, c = GRAD[grad]
        gdef = (f'<linearGradient id="{p}-lime" gradientUnits="userSpaceOnUse" x1="0" y1="250" x2="0" y2="660">'
                f'<stop offset="0" stop-color="{a}"/><stop offset="0.5" stop-color="{b}"/><stop offset="1" stop-color="{c}"/></linearGradient>')
        acc = f"url(#{p}-lime)"
    return f'''<defs>
    {gdef}
    <clipPath id="{p}-xbox"><rect x="515" y="7" width="475" height="646"/></clipPath>
    <clipPath id="{p}-acc"><path d="{cols}"/></clipPath>
    <clipPath id="{p}-ink"><path d="{inkpoly}"/></clipPath>
  </defs>
  <g clip-path="url(#{p}-ink)">{letra(ink)}</g>
  <g clip-path="url(#{p}-acc)">{letra(acc)}</g>'''

W = {
 "E": "M69.5 8.5H8.5V91.5H69.5M8.5 50H63", "X": "M2 0L76 100M76 0L2 100",
 "C": "M69.5 36V24.5A16 16 0 0 0 53.5 8.5H24.5A16 16 0 0 0 8.5 24.5V75.5A16 16 0 0 0 24.5 91.5H53.5A16 16 0 0 0 69.5 75.5V64",
 "H": "M8.5 0V100M69.5 0V100M8.5 50H69.5", "A": "M2 100L32 8.5H46L76 100M11 72H67",
 "N": "M8.5 100V8.5L69.5 91.5V0",
 "G": "M69.5 36V24.5A16 16 0 0 0 53.5 8.5H24.5A16 16 0 0 0 8.5 24.5V75.5A16 16 0 0 0 24.5 91.5H53.5A16 16 0 0 0 69.5 75.5V54H42",
 "T": "M0 8.5H78M39 8.5V100",
 "R": "M8.5 100V8.5H53.5A16 16 0 0 1 69.5 24.5V36A16 16 0 0 1 53.5 52H8.5M40 52L72 100",
 "K": "M8.5 0V100M8.5 58L74 2M34 37L74 100",
}
WMG = {'light': ('#8CC000', '#6A9400', '#4F6D00'), 'dark': ('#F0FF94', '#C6F91F', '#93CF00')}

def wordmark(p, ink, acc, acc_txt=None, grad=None):
    def word(w, x0, cor):
        return '<g stroke="%s">%s</g>' % (cor, "".join(
            '<path transform="translate(%d 0)" d="%s"/>' % (x0 + i * 90, W[ch]) for i, ch in enumerate(w)))
    gdef = ""
    if grad:
        a, b, c = WMG[grad]
        gdef = (f'<linearGradient id="{p}-wm" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">'
                f'<stop offset="0" stop-color="{a}"/><stop offset="0.5" stop-color="{b}"/><stop offset="1" stop-color="{c}"/></linearGradient>')
        acc_txt = f"url(#{p}-wm)"
    return f'''<defs>{gdef}<clipPath id="{p}-band"><rect x="-20" y="0" width="1460" height="100"/></clipPath></defs>
  <g transform="translate(8 742) scale(1.16)" fill="none" stroke-width="17" clip-path="url(#{p}-band)">
    {word("EXCHANGE", 0, acc_txt or acc)}
    {word("TRACKER", 752, ink)}
  </g>'''

def svg(nome, vb, corpo, titulo="EXC · Exchange Tracker"):
    p = nome.replace(".svg", "")
    open(os.path.join(OUT, nome), "w").write(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-labelledby="{p}-t">
  <title id="{p}-t">{titulo}</title>
  {corpo}
</svg>
''')

OUT = os.path.join(OUT, "paletas")
os.makedirs(OUT, exist_ok=True)
PALETAS = [
    ("1-lime",      "#F3F4F0", "#05080A", "#C6F91F", "#05080A", "#FFFFFF", "#C6F91F"),
    ("2-esmeralda", "#FFFFFF", "#14171C", "#0E9F7E", "#0D1114", "#FFFFFF", "#2BD4A4"),
    ("3-ouro",      "#FFFFFF", "#15171C", "#B8892F", "#0E0F12", "#F5F1E8", "#D9B25F"),
    ("4-ciano",     "#FFFFFF", "#0B1626", "#0891B2", "#0B1626", "#FFFFFF", "#22D3EE"),
    ("5-violeta",   "#FFFFFF", "#17142E", "#5B4BDB", "#110F22", "#FFFFFF", "#9D8CFF"),
    ("6-laranja",   "#FFFFFF", "#1A1B1F", "#E85D04", "#121316", "#FFFFFF", "#FF8A3D"),
    ("7-bordo",     "#FBF8F3", "#241A1C", "#8E1B33", "#1A1214", "#F3E9D8", "#D94A64"),
    ("8-magenta",   "#FFFFFF", "#111114", "#D1146A", "#0E0E11", "#FFFFFF", "#FF4D9A"),
    ("9-grafite",   "#FFFFFF", "#111318", "#6B7280", "#111318", "#FFFFFF", "#9CA3AF"),
]
linhas = []
for nome, bgc, inkc, accc, bge, inke, acce in PALETAS:
    for modo, bg, ink, acc in (("claro", bgc, inkc, accc), ("escuro", bge, inke, acce)):
        arq = f"exchange-tracker-{nome}-{modo}.svg"
        p = "p" + nome.split("-")[0] + modo[0]
        svg(arq, "-14 -10 1640 884", symbol(p, ink, acc, ({"claro": "light", "escuro": "dark"}[modo] if nome == "1-lime" else None)) + "\n  " + wordmark(p, ink, acc, None, ({"claro": "light", "escuro": "dark"}[modo] if nome == "1-lime" else None)))
        linhas.append((nome, modo, bg, arq))
# prévia autocontida (todas inline, ids únicos por arquivo)
cards = []
for nome, modo, bg, arq in linhas:
    corpo = open(os.path.join(OUT, arq)).read().replace("<svg ", '<svg style="width:100%;display:block" ', 1)
    cards.append(f'<figure><div style="background:{bg}">{corpo}</div><figcaption>{nome} · {modo}</figcaption></figure>')
open(os.path.join(OUT, "preview.html"), "w").write('''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EXC · 9 paletas</title>
<style>body{margin:0;padding:24px;background:#E6E7E3;font-family:Inter,system-ui,sans-serif}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;max-width:1300px;margin:auto}
figure{margin:0}figure div{border-radius:12px;padding:20px}figcaption{font-size:13px;color:#444;margin-top:6px;text-align:center}</style></head>
<body><main>''' + "".join(cards) + "</main></body></html>")
print(len(linhas), "arquivos")
