# Usabilidade — Barra livre (`bar`) · Issue #177

Relatório de ensaio de usabilidade do lançamento de **Barra livre**. Esta entrega
contém **testes e relatório**; nenhuma alteração de código foi feita.

## 1. Condições do ensaio

| Item                 | Valor                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Versão / SHA         | `0.6.1` · `master` em `3ab67ea` (13/11/2026), revalidado no início do ensaio                                                 |
| Execução             | `npm run dev` (Vite) em `127.0.0.1:5173`                                                                                     |
| Sistema operacional  | Windows 11 Pro 23H2. **Linux não testado** (sem ambiente disponível)                                                         |
| Navegador            | Painel de navegador embutido do aplicativo Claude (Chromium), viewport emulado de 1366 × 768                                 |
| Operador / entrada   | Agente de IA (Claude) com mouse e teclado automatizados. Não houve participante humano                                       |
| Arquivo de teste     | [`forma-viga-bloco.dxf`](forma-viga-bloco.dxf): mm, 16 linhas na camada `FORMA`                                              |
| Geometria do arquivo | Viga isolada: elevação 4000 × 500 mm e seção 200 × 500 mm. Bloco de fundação: elevação 1000 × 600 mm e planta 1000 × 1000 mm |

Limitações que afetam a leitura dos resultados:

- **Tempo:** não foi medido tempo humano. O operador automatizado não representa a velocidade de uma pessoa. Por isso o esforço é dado em **número de ações** (cliques, teclas e entradas digitadas).
- **"Primeira utilização":** o operador não tinha usado o comando antes e partiu só da interface (tooltip e mensagens). Mesmo assim, não equivale a um usuário humano iniciante.
- **PAN transparente (Espaço + arrastar e botão do meio):** **não executado**. A ferramenta de automação não consegue manter Espaço nem o botão do meio pressionados. Uma tentativa com evento sintético foi descartada como inválida (ver §6).
- **Capturas de tela:** o painel às vezes devolveu imagens defasadas. Todos os resultados abaixo foram conferidos pelo texto/DOM da página (rótulos `Nn - q x Øb - C=…`, contador de pontos, campos de vértices), não apenas pela imagem.
- A importação do DXF foi feita injetando o arquivo no `input` de máscaras, porque o painel não abre o diálogo de arquivos do sistema. O restante do fluxo foi feito pela interface.

## 2. Cenários e evidências

Evidências: `01`…`06` nesta pasta. Os valores de C são os rótulos da própria barra no desenho.

| #   | Cenário                                                               | Sequência executada                                                                                   | Ações | Resultado                                                                                              |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| V1  | Viga, barra reta, 1ª tentativa, só mouse                              | Ícone "Barra livre" → clique no canto (encaixe _Extremidade_) → clique no outro canto → botão direito | 4     | N1, Ø8, **C = 400,0 cm**. Barra sobre a face da fôrma, sem cobrimento ([03](03-barra-reta-criada.jpg)) |
| V2  | Viga, barra reta, repetição com coordenadas                           | `34,34` ↵ `@3932,0` ↵ ↵                                                                               | 3     | N2, **C = 393,2 cm** (exato)                                                                           |
| V3  | Viga, barra com dobras (U), com erro proposital                       | `34,466` ↵ `@0,-432` ↵ `@3932,0` ↵ `@0,342` ↵ ↵ (deveria ser 432)                                     | 5     | N4, C = 468,5 cm com o ramo errado                                                                     |
| V4  | Corrigir o vértice errado depois de concluir                          | Selecionar N4 → "Geometria e dobras › Vértices locais" → Y do vértice 4 = `0`                         | 3     | **C = 477,5 cm** (esperado: 4796 − 2 × 10,3 = 4775 mm) ([04](04-correcao-vertices.jpg))                |
| V5  | Corrigir vértice errado **durante** o traçado                         | 4 pontos, sendo o último errado → Backspace → Ctrl+Z → Ctrl+Y                                         | —     | Não há como desfazer só o último ponto. Ver C1                                                         |
| B1  | Bloco, barra reta, Ø12,5 × 5 (definidos na faixa "Próximas criações") | `B` ↵ `50,-1943.75` ↵ `@900,0` ↵ ↵                                                                    | 4     | N5, **5 × Ø12,5, C = 90,0 cm** ([05](05-bloco-barras.jpg))                                             |
| B2  | Bloco, barra em U                                                     | 4 coordenadas absolutas ↵ e Enter final                                                               | 5     | N6, **C = 185,5 cm** (esperado: 1887,5 − 2 × 16,1 = 1855 mm). Mandril passou sozinho para 62,5 mm (5φ) |
| B3  | Zoom pela roda no meio do traçado                                     | 1º ponto → roda do mouse → continuar                                                                  | —     | Ponto preservado e traçado continua                                                                    |
| B4  | PAN pelo botão "mão" no meio do traçado                               | 1º ponto → clique na mão                                                                              | —     | **Traçado descartado e comando encerrado**. Ver C3                                                     |
| S1  | Encerrar a poligonal na seção da viga                                 | 4 vértices + volta ao 1º → `C` ↵ (hábito de CAD)                                                      | —     | `C` executou **Copiar elementos** e o traçado de 5 pontos foi perdido. Ver C4                          |
| S2  | Encerrar a poligonal (repetição)                                      | 4 vértices + volta ao 1º → ↵                                                                          | 6     | N7 **aberta**, com 5 vértices e extremos coincidentes. C = 112,9 cm (1160 − 3 × 10,3). Sem aviso       |
| P1  | Mudar bitola/quantidade na faixa com uma barra selecionada            | N4 selecionada → faixa: Ø12,5, qtd. 5                                                                 | —     | N4 continua Ø8. A faixa vale só para as próximas criações, como diz o rótulo. Previsível               |
| R1  | Recuperação depois de fechar o navegador                              | O painel do navegador foi fechado no meio do ensaio e reaberto                                        | —     | Projeto (N1–N6) recuperado automaticamente                                                             |

Conferência geométrica: todos os comprimentos bateram com o cálculo manual pelo eixo, descontando os
trechos retos trocados por arcos (raio no eixo = mandril/2 + φ/2). Não houve aço a mais nem informação
perdida, **exceto** no efeito indevido descrito em C2.

## 3. Atual: atritos observados (constatações)

O que funciona bem: o comando é encontrado com facilidade. O tooltip mostra
`B / BARRA + Enter · L + Enter`. O prompt diz "Indique os vértices da barra. Enter ou botão direito
conclui." e tem contador de pontos. A prévia elástica e o encaixe _Extremidade_ funcionam. Digitar
`x,y`, `@dx,dy` e `@L<ângulo` é preciso. O comando continua ativo para repetir ("Continue desenhando ou
pressione Esc"). Numeração, mandril e quantitativo são automáticos e corretos, e Ctrl+Y refaz.

**C1 — Não há como desfazer só o último vértice durante o traçado (alta).**

- **Backspace**, com a linha de comando vazia, não faz nada: continua com 4 pontos. No código, o Backspace só trata a tela soldada (`src/App.tsx`, `e.key === 'Backspace' … meshSession`).
- **Ctrl+Z** descartou o traçado inteiro (5 pontos) **e também desfez a barra criada antes** (N2 sumiu). A mensagem "N2 criada" continuou na tela. No código, o `undo` faz `setDraft([])` e depois desfaz o histórico (`src/App.tsx`, ramo `a === 'undo'`).
- **Esc** descarta o traçado e já encerra o comando.

Na prática, um vértice errado obriga a refazer a barra toda ou a concluir e corrigir pelo painel (V4).

**C2 — Um clique simples perto de um vértice da barra selecionada move esse vértice (alta, precisão).**
A barra recém-criada fica selecionada. Ao clicar na ferramenta Seleção a menos de 9 px de um vértice,
a alça é "pega" e o vértice vai para o ponto clicado ao soltar, **sem precisar arrastar**
(`src/components/CadCanvas.tsx`: `pointerdown` com `distance(...) < 9 / camera.s` e `pointerup` com
`onBarChange`). Isso foi reproduzido duas vezes:

- Vértice 3 da N4 foi de (3932; −432) para (3932; −408), e C passou de 468,5 para 466,1 cm.
- Vértice 2 foi de (0; −432) para (5,99; −423,79), deixando a barra torta, e C passou para 467,2 cm.

Não houve aviso. A mudança só aparece no rótulo. Ctrl+Z desfaz.

**C3 — PAN pelo botão do canvas interrompe o lançamento (média).**
O botão "mão" troca de ferramenta, e o traçado e o comando são perdidos. O PAN transparente existe
(botão do meio ou Espaço + arrastar, em `CadCanvas.tsx`), mas **não aparece no prompt** e não foi testado (§1).
A investigação geral de PAN/travamento está em #175.

**C4 — Encerramento da poligonal (média).**
A barra livre é sempre aberta e não há opção "fechar". Voltar ao 1º ponto cria uma barra aberta com
extremos sobrepostos, sem aviso. Também não há sugestão do comando Estribo para contornos fechados. Digitar
`C` (convenção de "fechar" em CAD) roda **Copiar elementos** (`src/domain/shortcuts.ts`, `copy`) e
descarta o traçado sem confirmação.

**C5 — O cobrimento não é aplicado e o encaixe leva à face da fôrma (baixa/média).**
O campo "Cobrimento 30 mm" fica ao lado na faixa, mas não afeta a barra livre. Com o encaixe _Extremidade_, a
barra nasce na face do concreto (V1). Para ficar na posição correta, foi preciso digitar coordenadas
deslocadas (V2). Quem quer o cobrimento automático tem o comando "Seguir fôrma" (usabilidade em #185).

**C6 — Barras idênticas sobrepostas sem aviso (baixa).**
No ensaio, a mesma barra em U foi lançada duas vezes (N3 e N4) por dúvida do operador. Elas ficaram
exatamente sobrepostas e não dá para distingui-las no desenho, mas o quadro soma as duas.

**C7 — Dicas de sintaxe ficam escondidas (baixa).**
O cartão "Precisão desde o primeiro ponto" explica `1000,500`, `@500,0`, Enter e Esc, mas fica no painel
Propriedades e só aparece quando **nada** está selecionado. Depois de criar a primeira barra, ela fica
selecionada e o cartão some. O prompt não cita a entrada relativa, Esc, a forma de desfazer o ponto nem o PAN transparente.

Fora do escopo, apenas registrado: na importação de DXF em lote, o botão "Aplicar lote" fica
desabilitado até clicar em "Ler arquivos". O ícone da Barra livre aparece só como ícone no grupo
"Lançar" (discussão de ícones em #174).

**Conclusão (atual):** para quem já conhece o fluxo, lançar uma barra reta ou com dobras é **simples e
rápido**: 3 a 5 entradas digitadas, com resultado exato e quantitativo correto. A primeira tentativa só com
mouse também é fácil, mas posiciona a barra na face da fôrma. O ponto fraco é **corrigir erros**: não há
como desfazer o último ponto (C1), o Ctrl+Z tem efeito exagerado (C1) e um clique pode alterar a geometria
sem aviso (C2).

## 4. Comparação

| Produto / fonte                                                                                                                                                                                                                                                                                                          | O que foi observado                                                                                                                                                                                                                                                                                           | Limites                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Autodesk Revit, ajuda oficial [Sketch Planar Rebar (2016)](https://help.autodesk.com/cloudhelp/2016/ENU/Revit-Model/files/GUID-9DEEE195-BF1A-4D0C-871F-E009DC4CC64B.htm) e [Sketch Free Form Rebar (2020)](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-B740C331-72B1-4B50-9898-F588B2513CCB.htm) | Escolhe o hospedeiro, entra num **modo de esboço** com as linhas de cobrimento visíveis e desenha com as ferramentas de desenho. Os comprimentos podem ser ajustados por cotas temporárias. A forma só é criada ao clicar em **Finish / Finish Edit Mode**, e a barra é encaixada na referência de cobrimento | **Só documentação.** Não houve teste nem medição de tempo, e nenhuma licença foi usada. É um BIM 3D com hospedeiro, não detalhamento 2D. A ajuda não descreve cancelamento, regras de fechamento nem como desfazer um segmento |
| TQS, Editor de Armaduras Genéricas                                                                                                                                                                                                                                                                                       | Pesquisa em docs.tqs.com.br não achou guia público do lançamento poligonal de ferro genérico                                                                                                                                                                                                                  | **Comparação bloqueada.** Lacuna registrada                                                                                                                                                                                    |

Leitura para o ArmaduraStruct: o modelo "esboço editável e depois confirmar" do Revit deixa corrigir um
trecho antes de criar a barra e usa o cobrimento como referência. No ArmaduraStruct, cada ponto é
definitivo até o Enter, e o cobrimento não entra no lançamento livre. Esta é uma comparação de conceito, não
de desempenho medido.

## 5. Melhorias propostas (hipóteses, sem implementação)

| Prioridade    | Proposta                                                                                                                                                                                                                    | Benefício esperado                                                              | Riscos / dependências                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Alta** (C1) | Durante o traçado, **Backspace** (ou `D`/`DESFAZER` na linha de comando) remove só o último vértice. Ctrl+Z também remove só o último vértice enquanto houver traçado e só mexe no histórico quando o traçado estiver vazio | Corrigir sem refazer a barra. Evita desfazer, sem perceber, uma barra já criada | Definir a mesma regra para polilinha e estribo de forma livre. A tela soldada já faz isso com Backspace |
| **Alta** (C2) | Só mover o vértice se o arraste passar de alguns pixels, ou usar "clicar na alça → clicar no destino" com prévia e Esc para cancelar                                                                                        | Elimina mudanças de geometria sem aviso                                         | Testes e2e de edição por alças. Mudança de hábito para quem já usa                                      |
| Média (C3/C7) | Citar no prompt "Espaço/botão do meio: mover vista", ou fazer o botão "mão" funcionar sem interromper o traçado                                                                                                             | PAN sem perder o lançamento                                                     | Relaciona-se a #175. Verificar no Linux                                                                 |
| Média (C4)    | Se o último ponto coincidir com o primeiro, avisar e sugerir **Estribo**. Não aceitar comandos de uma letra como `C` com traçado aberto sem confirmação                                                                     | Evita barras "fechadas" sem dobra correta e perda do traçado                    | Atalhos configuráveis (`shortcuts.ts`)                                                                  |
| Baixa (C7)    | Mostrar no prompt o comprimento do segmento atual e "@dx,dy relativo · Esc cancela · Backspace desfaz ponto"                                                                                                                | Aprendizado mais rápido sem depender do painel                                  | Espaço limitado na barra de status                                                                      |
| Baixa (C5/C6) | Avisar ao criar uma barra idêntica a uma existente. Talvez aplicar o cobrimento da faixa como deslocamento opcional                                                                                                         | Menos aço duplicado e menos digitação                                           | O cobrimento automático pode conflitar com o propósito "livre". Depende de decisão de produto e de #185 |

## 6. Resumo

- **Passou:** descoberta do comando, encaixe _Extremidade_, prévia, coordenadas absolutas, relativas e polares, conclusão por Enter e botão direito, repetição, bitola e quantidade previsíveis, geometria e quantitativo exatos (N1–N7), zoom pela roda no meio do fluxo, refazer, correção pelo painel de vértices e recuperação automática.
- **Falhou / atrito:** desfazer o último vértice (C1), clique que move o vértice (C2), PAN pelo botão (C3), encerramento e `C` (C4), cobrimento (C5), duplicatas (C6), dicas escondidas (C7).
- **Não executado:** PAN por Espaço ou botão do meio (limitação da ferramenta), Linux, tempos humanos, comandos auxiliares "Comprimentos e ângulos" e "Estender barra", ensaio direto em software comercial.
- Descartado como artefato do ensaio, e não do app: uma captura que parecia mostrar a barra não criada (a imagem estava defasada; o DOM confirmava a criação) e o teste com Espaço sintético (o evento não tinha `document.body` como alvo, como o app exige).
