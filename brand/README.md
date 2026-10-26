# Marca · Exchange Tracker

## Logo oficial: EXC (v3)

As letras E, X e C com o skyline de barras na parte de baixo, na paleta do app
(Action Amber `#F59E0B` com degradê até o Soft Yellow `#FDE68A`, letras em
Productivity Black `#1F1F1D` no claro e `#FFFBEB` no escuro).

Paleta do app: Productivity Black `#1F1F1D`, Action Amber `#F59E0B`,
Soft Yellow `#FDE68A`, Warm Background `#FFFBEB`, Cool White `#F8FAFC`.

| Arquivo | Uso |
|---|---|
| `exchange-tracker-exc3-full.svg` / `-full-dark.svg` | logo completo (símbolo + EXCHANGE TRACKER), fundo claro / escuro |
| `exchange-tracker-exc3-sm.svg` / `-sm-dark.svg` | só o símbolo — é o da sidebar (`static/img/brand/`) |
| `exchange-tracker-exc3-favicon.svg` | o sm black estreitado para caber maior no quadrado — ícone da aba (`static/img/favicon.svg` e `static/favicon.ico`) |
| `exchange-tracker-exc3-notify.svg` | ícone de app — vira `static/img/logo.svg` e `logo-512.png` (atalho, celular) |
| `paletas/` | o logo completo nas 9 paletas avaliadas antes do âmbar (a 1 é o lime anterior), claro e escuro; `paletas/preview.html` mostra todas |

Fundo transparente em todos. Para impressão, os arquivos já são só formas
(nada depende de fonte instalada).

## Gerar de novo

```
python3 gerar/gen_exc3.py           # exc3: full, sm e notify
python3 gerar/gen_exc3_paletas.py   # paletas/ (18 arquivos + preview.html)
```

Cores, colunas do skyline e degradês ficam no topo de cada script. Depois de
mudar o notify, atualize no app: `static/img/logo.svg` (cópia direta) e o
`logo-512.png`/`favicon.ico` (rasterizar o SVG, ex.: `qlmanage -t -s 1024`).

## Explorações anteriores

`exchange-tracker-a…f`, `-skyline-*`, `-exc*` (v1/v2): rodadas de conceito que
não foram escolhidas, mantidas como referência.
