# Usabilidade · Estribo helicoidal (issue #181)

Relatório de ensaio de execução do comando **Estribo helicoidal** (`HELICOIDAL` / `ESTRIBOHELICOIDAL`), com critérios em `CRITERIOSHELICOIDAL`. Esta entrega traz **testes e relatório**. Nenhum código de produto foi alterado. As propostas ficam separadas para futuras issues ou PRs.

## 1. Condições do ensaio

| Item                | Valor                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versão              | Ensaio na `master` em `3ab67ea` (13/11/2026), app 0.6.1, formato `armadurastruct/35`. Durante a redação, a `master` avançou para `a814d6f` (PR #199, faixa de estribos sem traços). Pelo diff, `src/App.tsx` e os arquivos `helix*` não mudaram, mas o ensaio **não foi re-executado** em `a814d6f`. |
| Execução            | `npm run dev` (Vite) em `127.0.0.1`, aberto no navegador embutido (Chromium) do aplicativo Claude desktop                                                                                                                                                                                            |
| Sistema             | Windows 11 Pro 23H2 (10.0.22631). **Linux não estava disponível**, e o aplicativo desktop (Tauri) não foi exercitado. Nada aqui generaliza para essas plataformas.                                                                                                                                   |
| Janela              | Viewport emulado de 1366 × 768 px (notebook), tema escuro do canvas                                                                                                                                                                                                                                  |
| Entrada             | Mouse e teclado sintéticos (cliques, digitação, roda e arrasto) enviados por um **agente automatizado (Claude)** que dirigiu a interface. Em alguns campos dos critérios da 2ª execução, o valor foi preenchido direto no campo (equivalente a digitar).                                             |
| Arquivo de teste    | [`estaca-d500-l3200.dxf`](estaca-d500-l3200.dxf), estaca em elevação Ø500 × 3.200 mm com eixo (layer `EIXO`) e seção circular ao lado (centro em x = 4.200). Importada por _Máscaras → Adicionar DXF/DWG → Ler arquivos → Aplicar lote_.                                                             |
| Dimensão do projeto | 1 detalhamento, 1 máscara (8 entidades) e até 2 posições helicoidais                                                                                                                                                                                                                                 |

**Limites de método:**

- O operador foi um agente, não um usuário humano. Por isso **não há tempos humanos medidos**: o tempo de parede do agente reflete a latência da ferramenta, não a fluidez da interface. Em lugar de tempo, registro a **contagem de interações** e os pontos de dúvida que a interface provoca.
- "Primeiro uso" e "repetição com familiaridade" são distinguidos pelo estado do aplicativo (critérios ainda não confirmados × lembrados), não pela memória do operador.
- O painel do navegador foi fechado no meio da 1ª execução e a sessão do app foi perdida. A 2ª execução refez o cenário do zero, e os resultados coincidiram.

## 2. Cenários e sequência observada

Cenário-base: hélice em estaca circular Ø500, cobrimento 25 mm até a face externa da hélice, φ8 CA-50, passo 100 mm e afastamentos a = b = 50 mm, entre os centros das faces da estaca (A = 0,0 e B = 3.200,0).

### C1 · Primeiro uso, dois pontos com encaixe

1. Faixa **Armaduras → Helicoidal → Estribo helicoidal**. A dica mostra o nome e os aliases ([01](01-faixa-dica-helicoidal.jpg)). Sem tecla curta, como documentado.
2. Abre **Critérios do helicoidal** porque é o primeiro uso ([02](02-criterios-primeiro-uso.jpg)). Padrões: D no eixo = 400, p = 150 e Hbruto = 3.000.
3. Em _Referência do diâmetro_, escolhi **Seção de concreto + cobrimento**. O valor 400 foi mantido e passou a significar Dconc, com c = 0. A prévia mudou para D = 392 sem nenhum aviso ([03](03-troca-referencia-reinterpreta-valor.jpg)).
4. Dconc = 500, c = 25, p = 100. A memória mostrou **D = 442,000 mm** (500 − 2·25 − 8 ✔).
5. Aba **Trecho**: a = b = 50. A memória mostrou Hbruto = 3.000 → H = 2.900, **N = 29** e L = 40.373 mm. Esses números **não serão os do lançamento**, porque no modo por pontos o Hbruto vem de A–B.
6. **Indicar o eixo da hélice**. O painel pede A, e o encaixe **Ponto médio** aparece na face esquerda da estaca.
7. Clique em A. Ao mover para B, a prévia segue o cursor, com hélice, cotas e seção. O painel passa a mostrar a memória completa e **cresce até cobrir cerca de 40% da largura útil do canvas, inclusive o ponto A e o início da hélice** ([04](04-indicando-B-painel-cobre-A.jpg)).
8. Clique em B (encaixe _Ponto médio_ na face direita). Prévia pronta: Hbruto = 3.200, H = 3.100, **N = 31**, **L = 43.157,583 mm**, 17,029 kg e "1 hélice(s) × 1 × 1 = 1" ([05](05-previa-pronta.jpg)).
   Conferência manual: √((π·442)² + 100²) = 1.392,18 mm por volta, × 31 = 43.157,6 mm ✔. 0,3946 kg/m × 43,158 m = 17,03 kg ✔.
9. Enter na linha de comando confirma. **Enter repetido não duplicou**: o quadro ficou com 1 posição. O painel lateral vai para _Propriedades_ de N1 ([10](10-N1-confirmada.jpg)).

Interações: 1 comando + 1 seleção de referência + 5 campos + 1 troca de aba + 1 botão + 2 cliques no canvas + 1 confirmação = **12 interações e 5 valores digitados**.

### C2 · Zoom, PAN e Ajustar à tela no meio do fluxo (prévia pronta)

| Ação                           | Resultado                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roda do mouse (afastar)        | ✔ Prévia e etapa preservadas                                                                                                                                                                                                                                                                     |
| **Ajustar à tela**             | ✔ Preserva a sessão, mas o enquadramento ignora o painel flutuante, que continua sobre o início da hélice ([09](09-ajustar-tela-painel-sobrepoe.jpg))                                                                                                                                            |
| **Botão Pan** (barra inferior) | ✘ **Cancela o lançamento sem aviso**. O painel desaparece e a barra de status diz apenas "Arraste para navegar" ([06](06-pan-cancela-lancamento.jpg)). **Os critérios digitados também se perdem**: ao relançar, o diálogo voltou a D = 400 e p = 150 ([07](07-criterios-perdidos-apos-pan.jpg)). |
| PAN com o botão do meio        | Não executado (a ferramenta de automação não envia arrasto com o botão do meio)                                                                                                                                                                                                                   |

Causa verificada no código, depois do teste: `setTool` limpa as sessões de **todos** os comandos (`setHelixSession(null)` e `setHelixDialog(null)`, entre outras) antes de ativar a ferramenta, inclusive `pan` ([`src/App.tsx`](../../../src/App.tsx), função `setTool`). Os critérios só são memorizados ao confirmar uma peça (`helixCriteria.current = …` na confirmação). A investigação geral de travamento/PAN é a #175. Este achado é de fluxo, não de desempenho.

Recuperar exigiu repetir o C1 inteiro (**12 interações**). Além disso, como o PAN deslocou a vista, os cliques seguintes caíram fora da estaca e a prévia mostrou Hbruto = 4.984,9 ([08](08-cliques-fora-apos-pan.jpg)). O erro é visível na memória, mas só para quem a lê.

### C3 · Correção e cancelamento

- **Voltar etapa**: funcionou (pronta → B → A). Porém o painel encolhe a cada volta e **o botão muda de posição** (de y ≈ 577 para y ≈ 304 px), então um segundo clique no mesmo lugar não o atinge.
- **Coordenadas digitadas** `0,0` e `3200,0`: funcionam e produziram o mesmo resultado do encaixe.
- **Esc** com A já indicado cancela o lançamento inteiro, sem resíduo (quadro inalterado), conforme a documentação.
- **Cancelar lançamento**: sem resíduo.
- **Desfazer/Refazer** após confirmar: remove e recoloca N1 como uma única operação (quadro 1 → 0 → 1).
- **Valor inválido** (edição com p = 5 e φ = 8): mensagem clara ("As voltas se sobrepõem… menor que a bitola…"), botão _Aplicar alterações_ desabilitado e prévia substituída por um aviso. Corrigir para 100 libera o botão.

### C4 · Alterar um parâmetro e repetir

1. `HELICOIDAL` + Enter. Os critérios são lembrados e o diálogo **não reabre**. O painel abre direto em "Indique o início A", mas **não mostra quais critérios estão ativos** (p, D, φ) até que A seja indicado e o cursor se mova.
2. _Critérios do helicoidal_ (no painel) → p = 150 → _Indicar o eixo_ → A `0,-1000` → B `3200,-1000`.
3. Prévia: H = 3.100 → **N = 20,667 (20 completas + 0,667)** e **L = 28.864,353 mm**.
   Conferência: √((π·442)² + 150²) = 1.396,66 × 20,6667 = 28.864,4 mm ✔.
4. Confirmar. Quadro: N1 1 × 43,158 m / 17,03 kg e N2 1 × 28,864 m / 11,39 kg. Total de 72,02 m e 28,42 kg ✔ ([11](11-N1-p100-e-N2-p150.jpg)).

Interações: repetição sem mudança = **4** (comando, A, B, Enter). Com mudança de p = **7**.

O rótulo distingue bem quantidade de voltas: `N2 - 1 hélice x Ø8 - 20,667 voltas - p=15,0 cm - C=28,864 m`. Não houve confusão entre o modelo (1 peça) e a representação (voltas desenhadas, frente contínua e fundo tracejado). A quantidade física nunca foi multiplicada por N.

### C5 · Entrada numérica e edição da posição

- **Início, direção e comprimento**: com direção 0°, basta um ponto A para chegar à prévia pronta (**4 interações** na repetição). O comprimento declarado apareceu como **Hbruto = 3.200**, e não os 3.000 digitados no diálogo: a confirmação anterior por pontos gravou o trecho medido nos critérios. Isso ajuda a repetir, mas acontece **sem aviso**.
- **Editar critérios desta posição** (N2, p 150 → 100): mantém o ID N2 e recalcula para N = 31 e 43,158 m. O quadro fica com N1 e N2 idênticas e separadas (comportamento documentado). A edição exige **duas confirmações** (_Aplicar alterações_ e depois _Confirmar lançamento_), e o painel continua usando o verbo "lançamento" numa edição.

### Representação e quantitativo

- **Seção vinculada**: posicionada automaticamente em `x = Hbruto + max(0,75·D; 200) + R` ([`src/domain/helixViews.ts`](../../../src/domain/helixViews.ts), `sectionCenter`). No ensaio, o centro ficou em 3.752,5 com R = 221, **sobrepondo em ~23,5 mm o círculo da seção já existente na fôrma** (centro 4.200, R = 250). Durante o lançamento não há opção para posicioná-la; _Posicionar identificação_ move apenas o texto. O rótulo vertical da seção também fica junto à marca B e às cotas.
- **Quadro de aço (tela)**: os números estão corretos, mas a linha não mostra p, N nem D (a documentação prevê a memória no PDF/DXF, que não foram exportados neste ensaio). O rodapé genérico fala em "arcos de dobra" e "mandris e ganchos informados", o que não se aplica à hélice.
- Nenhum efeito indevido de interação foi detectado no quantitativo: zoom, Enter repetido, Voltar, Esc, Cancelar e Desfazer/Refazer não alteraram aço nem criaram posições.

## 3. Conclusão sobre a facilidade

**O cálculo é correto e transparente, mas o fluxo é frágil diante de interrupções.** Os cálculos conferiram em todos os casos. A memória é completa e a distinção hélice × voltas é clara. A repetição é ágil (4 interações), e Esc, Desfazer e a validação estão bem resolvidos. Os atritos concretos estão no entorno do lançamento:

1. o PAN pelo botão descarta o lançamento **e** os critérios, sem aviso;
2. o painel flutuante cobre o ponto A e o início da prévia durante a indicação de B;
3. o diálogo mostra uma memória (N, L) baseada em um Hbruto que o modo por pontos vai ignorar;
4. a seção vinculada é posicionada automaticamente e pode colidir com a fôrma.

No primeiro uso, o volume de conceitos (três referências de diâmetro, Hbruto × H, sentido e fase) é alto, mas é bem explicado nos textos de ajuda. Para quem domina o assunto, isso é aceitável.

## 4. Comparação (apenas documentação oficial, sem ensaio direto)

Não houve acesso licenciado a nenhum dos produtos. O que segue é **o que a documentação descreve, não um ensaio**. Não há tempos nem cliques medidos.

| Produto / fonte                                                                                                                                                       | Como o fluxo é descrito                                                                                                                                                                                                                                                                                              | Comparabilidade                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tekla Structures 2026**, [Create a circular reinforcing bar group](https://support.tekla.com/doc/tekla-structures/2026/rei_creating_circular_reinforcing_bar_group) | _Rebar → Bar group → Circular group_. Para hélice, Shift + clique abre as propriedades e se define _Rebar group type = Spiral_. Seleciona-se a peça de concreto, **três pontos no contorno** (o raio é calculado) e **dois pontos** para a direção de distribuição. Edição por duplo clique → propriedades → Modify. | Modelo 3D, com o raio derivado da geometria da peça. Não há equivalente a "Dconc + c" digitado. Os parâmetros ficam em um diálogo prévio opcional, não obrigatório no primeiro uso. |
| **Autodesk Revit 2022**, [About Modifying Spiral Rebar](https://help.autodesk.com/view/RVT/2022/ENU/?guid=GUID-DE898449-AF32-4491-94AE-14EE852A6C57)                  | Propriedades de instância exclusivas da espiral: _Height_, _Pitch_, _Base/Top Finishing Turns_. Altura ajustada por **controles triangulares arrastáveis** no topo e na base, que **acrescentam voltas** mantendo o passo. Diâmetro e rotação também por alças no modelo.                                            | Modelo 3D hospedado. As voltas de fechamento existem no Revit e estão explicitamente fora desta entrega do ArmaduraStruct. A edição direta por alças não existe aqui.               |

O que se pode afirmar das fontes: nos dois produtos, a geometria vem da **peça hospedeira** (contorno ou hospedeiro), e os parâmetros ficam num painel de propriedades persistente, não num passo modal obrigatório. Não se pode afirmar que sejam mais rápidos ou mais fáceis, porque não houve ensaio. Também não se copiou nenhum recurso nem código.

## 5. Melhorias propostas

Cada item separa **constatação** (observada no ensaio) de **hipótese** (benefício esperado, não verificado).

| #   | Prioridade | Constatação                                                                                                                                                           | Proposta                                                                                                                                                                                                                              | Benefício esperado (hipótese)                              | Riscos e dependências                                                                                                                                                                        |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Alta**   | O botão Pan cancela o lançamento e descarta os critérios, sem aviso (C2)                                                                                              | Tratar Pan, zoom e ajustar como **navegação transparente** que não passa por `setTool`, ou suspender e retomar a sessão ativa. No mínimo, avisar o cancelamento e memorizar os critérios aceitos no diálogo, e não só na confirmação. | Elimina o retrabalho de 12 interações após um clique comum | `setTool` é compartilhado por estribo, grampo, telas etc. A mudança é transversal e deve ser coordenada com #175 e as issues de usabilidade irmãs (#178–#187). Precisa de teste e2e próprio. |
| P2  | Alta       | O painel cobre A e o início da prévia; _Ajustar à tela_ o ignora (C1-7, C2)                                                                                           | Memória recolhível (resumo de uma linha com N, L e massa, expandindo sob demanda) **ou** enquadramento que desconte a área do painel                                                                                                  | Ver A ao indicar B e conferir a prévia inteira             | Ver o mesmo painel nos outros lançamentos. Não esconder informação estrutural (manter acesso à memória completa).                                                                            |
| P3  | Média      | No modo por pontos, o diálogo mostra N e L para um Hbruto que será ignorado (C1-5)                                                                                    | No diálogo, rotular a memória como "exemplo com Hbruto declarado" ou mostrar "N e L serão medidos entre A e B" quando o modo for por pontos                                                                                           | Evita esperar N = 29 e obter 31                            | O modo de entrada é escolhido depois, no painel. Talvez trazer a escolha para o diálogo.                                                                                                     |
| P4  | Média      | A seção vinculada tem posição fixa e pode colidir com a fôrma (Representação)                                                                                         | Etapa opcional "Posicionar seção", análoga a _Posicionar identificação_, ou permitir mover a seção depois como representação                                                                                                          | Desenho limpo sem edição posterior                         | Não pode criar aço. Manter o vínculo da seção com a peça.                                                                                                                                    |
| P5  | Baixa      | Na repetição, o painel não mostra os critérios ativos antes de A (C4-1)                                                                                               | Linha-resumo fixa no painel desde o início: `Ø8 · D 442 · p 100 · a/b 50`                                                                                                                                                             | Evita lançar com o passo errado                            | Nenhum relevante                                                                                                                                                                             |
| P6  | Baixa      | Trocar a referência do diâmetro reinterpreta o valor digitado (400 passa a ser Dconc, c = 0) (C1-3); Hbruto declarado muda sozinho após um lançamento por pontos (C5) | Ao trocar a referência, converter o valor para manter o mesmo D ou destacar o campo. Informar quando o trecho declarado for atualizado pelo medido.                                                                                   | Menos surpresas silenciosas                                | Converter pode mascarar uma escolha intencional. Avaliar com o autor.                                                                                                                        |
| P7  | Baixa      | "Voltar etapa" muda de posição a cada clique (C3); a edição exige duas confirmações e usa "lançamento" (C5)                                                           | Ações fixas no rodapé do painel. Na edição, rótulo "Confirmar alteração".                                                                                                                                                             | Correções mais rápidas                                     | Cosmético; não deve ultrapassar o escopo de #174                                                                                                                                             |
| P8  | Baixa      | O quadro em tela não mostra p e N; o rodapé cita dobras, mandris e ganchos (Representação)                                                                            | Coluna de observação ou dica com `D · p · N` para a família `helix`; rodapé condicional                                                                                                                                               | Conferência sem abrir as propriedades                      | Conferir o PDF/DXF (não exportados neste ensaio)                                                                                                                                             |

## 6. Resumo

| Item                                                                                      | Situação                                                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Descoberta (faixa, dica, alias)                                                           | ✔ passou                                                                |
| Critérios: referências de diâmetro, unidades, validação                                   | ✔ passou, com ressalvas P3 e P6                                         |
| Lançamento por dois pontos com encaixe e por coordenadas                                  | ✔ passou                                                                |
| Entrada numérica (início, direção, comprimento)                                           | ✔ passou                                                                |
| Prévia, confirmação única e Enter repetido                                                | ✔ passou, com ressalva P2                                               |
| Voltar, Esc, Cancelar, Desfazer/Refazer, erro de valor                                    | ✔ passou, com ressalva P7                                               |
| Zoom (roda) e Ajustar à tela no meio do fluxo                                             | ✔ preserva a sessão, com ressalva P2                                    |
| **Botão Pan no meio do fluxo**                                                            | ✘ **falhou**: cancela e perde os critérios (P1)                          |
| Alterar p e repetir, edição da posição                                                    | ✔ passou                                                                |
| Quantidade × comprimento × voltas (sem confusão modelo/representação)                     | ✔ passou (valores conferidos à mão)                                     |
| Posicionamento da seção vinculada                                                         | ⚠ colisão com a fôrma (P4)                                              |
| PAN pelo botão do meio, exportação PDF/DXF, Linux, desktop Tauri, usuário humano e tempos | **Não executado** (limites da seção 1)                                   |
| Comparação                                                                                | Somente documentação oficial (Tekla 2026, Revit 2022), sem ensaio direto |

Relacionadas: #155 (implementação, apenas referenciada), #175 (PAN e travamentos: o P1 é um achado de fluxo, a coordenar com ela) e #174 (ícones, sem achados aqui).
