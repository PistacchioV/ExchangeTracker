# Exchange Tracker

Ferramenta interna (Python/Flask, HTML, JS), navegável pela sidebar:

1. **e-Financeira Recon** — batimento entre os arquivos `MMAA_TRD` e `MMAA_PTP`.
2. **Fatos Relevantes** — importa os fatos relevantes do Plantão de Notícias da B3, com o documento na íntegra, em cards pesquisáveis.
3. **Workspace** — Initiatives, Tasks, Calendar, Team e Settings.

A barra do topo tem a busca (`Ctrl K` / `⌘K`: páginas, initiatives, tasks, pessoas e fatos), o
**+** (nova initiative, task, evento ou pessoa), o tema e o sino de avisos. A sidebar mostra o
contador de tasks vencendo hoje ou atrasadas e as initiatives fixadas (**Pinned**).

## Rodar

- **Windows:** dois cliques em `iniciar.bat` — instala o `requirements.txt`, sobe o servidor (waitress, porta 5070) e abre o navegador. `iniciar.bat noinstall` pula a instalação.
- **Manual:** `pip install -r requirements.txt` e `python app.py` → http://127.0.0.1:5070

## e-Financeira Recon

- **IDs:** coluna J do TRD (`INOA-1310004198`) × coluna A do PTP, casados pelo miolo numérico.
  - só no TRD → `Missing PTP`
  - só no PTP → `Missing TRD`
- **Diferenças (TRD − PTP):** N−B, P−C, Q−D, T−E, U−F, V−G. Datas em dias; vazio em coluna de valor conta como zero; códigos diferentes → `DIVERGENTE`.
- **Tolerâncias:** diferença de data (`conta_dtencerr`) de até 3 dias não diverge e recebe a observação `Gap between fixing and maturity date` (última coluna); as demais diferenças até 0,5 não divergem.
- **Saída:** `MMAA_e-financeira_recon.xlsx` com as colunas A–T da especificação, status em U–V, observação em W e aba `Resumo`.

`exemplos/` traz planilhas sintéticas para teste.

## Fatos Relevantes

Escolha o período e o termo (padrão `fato relevante`) e clique em **Importar fatos**. Cada notícia
vira um card com empresa, ticker, assunto, resumo, protocolo, link da fonte e o texto integral do
documento. A busca da tela filtra por texto e pela **data de referência** do fato — a data que
aparece no título da notícia, não a data da publicação.

O caminho é só HTTP, sem Selenium nem ChromeDriver:

| # | Etapa | Endpoint |
|---|-------|----------|
| 1 | lista do período | `sistemasweb.b3.com.br/PlantaoNoticias/Noticias/ListarTitulosNoticias` |
| 2 | notícia + link do documento | `.../Noticias/Detail?idNoticia=…` |
| 3 | documento na íntegra | `rad.cvm.gov.br/ENETWEB/frmExibirArquivoIPEExterno.aspx/ExibirPDF` (companhias) e `fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento` (fundos) |
| 4 | texto | extraído do PDF com `pypdf` |

Observações:

- A B3 aceita **no máximo 30 dias** por consulta.
- PDFs e textos ficam em cache em `data/fatos/` (fora do git). Reimportar o mesmo período não baixa
  de novo; documentos que falharam são tentados outra vez na importação seguinte. Para mudar o
  destino do cache: `set EDG_DATA=C:\caminho`.
- Se a CVM voltar a exigir captcha, o card é gravado só com o texto da B3 e o link da fonte.

## Workspace

Regras das Initiatives:

- **Classificações:** status `On going` · `On hold` · `Concluded`; categoria obrigatória
  `Process Review` · `Tech Issue` · `Projects` · `B3 - Improvements` · `Stomp/Red`; task
  `To do` · `In progress` · `In review` · `Done`; prioridade `Low` · `Medium` · `High` · `Urgent`.
- **Pessoas:** Lead e time saem das pessoas **ativas** do Team; o responsável de cada task sai dos
  **envolvidos** na initiative (Lead, time e quem já tem task) — fora deles a API recusa.
- **Marco = evento da initiative** (`Novo evento`, com hora, duração, tipo e local). O card
  Milestones só mostra; o clique abre o evento para editar, dar por atingido ou excluir.
- Progresso, próximo marco, dias restantes, burn-up e atividade são calculados na leitura.
- **Calendar** junta os eventos avulsos com as datas das initiatives (marcos, data-alvo e prazo
  das tasks em aberto), lidas ao vivo — nunca guarda cópia.
- **Team** — adicionar é direto, sem convite: o **SID** busca nome, e-mail, cargo e equipe no
  phonebook interno pela `awmpy` (`get_phonebook_data`, instalada do Artifactory pelo
  `iniciar.bat`). Se ela não responder, tenta o Active Directory e o Outlook. Quem usa a
  ferramenta é a pessoa do SID da máquina; enquanto o nome for só o SID, o Exchange Tracker busca de novo, e
  **Atualizar do cadastro** força a busca.
- **Excluir usuário** (lixeira no cartão ou no modal): a pessoa sai do time das initiatives e as
  tasks em aberto dela ficam sem responsável; as concluídas guardam o nome. Quem é Lead precisa
  ser trocado antes, e o próprio usuário não se exclui.
- **Fotos:** `static/img/users/<sid>.jpg` (fora do git).
- **Settings:** perfil, avisos do sino, tema (claro, escuro, auto) e exportação das tasks em CSV.

Os dados ficam em `data/workspace/` (`initiatives.json`, `calendar.json`, `settings.json`), fora
do git; `EDG_WORKSPACE` muda a pasta.
