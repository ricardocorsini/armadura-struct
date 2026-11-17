# Usabilidade: Faixa ortogonal e Distribuir armadura (#182)

Relatório de ensaio da issue [#182](https://github.com/ricardocorsini/armadura-struct/issues/182). Os dois comandos foram executados separadamente na interface, de ponta a ponta, num bloco de fundação e numa viga. Este documento traz constatações e propostas; **nenhuma alteração de código foi feita** nesta entrega.

## Condições do ensaio

| Item              | Valor                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versão            | ArmaduraStruct 0.6.1. Ensaio iniciado em `3ab67ea` e revalidado em `a814d6f` (master de 13/11/2026, após o PR #199). Os achados abaixo foram reconferidos na `a814d6f`.                                            |
| Sistema           | Windows 11 Pro 10.0.22631                                                                                                                                                                                          |
| Execução          | Interface web (`npm run dev`, Vite) num navegador Chromium 156 embutido. **Não** foi testado o app desktop (Tauri).                                                                                                |
| Linux             | **Não testado.** Não havia ambiente Linux disponível; nada aqui deve ser generalizado para Linux.                                                                                                                  |
| Entrada           | Mouse e teclado acionados por um agente de automação (Claude Code), com cliques, roda do mouse, teclas e a linha **Comando CAD**. Não houve participante humano.                                                   |
| Janela            | 1440 × 900 e 1024 × 768 px                                                                                                                                                                                         |
| Arquivo de teste  | [`forma-bloco-viga.dxf`](forma-bloco-viga.dxf), em mm: bloco 1600 × 1600 com pilar 400 × 400 em planta, e viga em elevação com vão de 4000 mm, altura de 500 mm e pilares de 200 mm.                               |
| Barras de partida | N1 Ø10, de (50,50) a (1550,50), no bloco. N2 Ø10, de (50,50) a (50,1550), no bloco. N3 e N4 Ø8, verticais de Y 730 a 1170, em X 2750 e 2800, na viga. O cobrimento de 50 mm no bloco e 30 mm na viga é proposital. |

### Limites do método

- **Tempo não medido.** A automação não representa o tempo de uma pessoa, então nenhum tempo é declarado. Em vez disso, foram registrados o número de interações e os retornos necessários.
- **Primeira utilização x familiaridade.** O agente leu o roteiro da issue e partes do código antes de testar, então não havia uma "primeira utilização" real. Os pontos de descoberta abaixo vêm do que a interface mostra (Ribbon, dicas, mensagens). Eles não medem o aprendizado de uma pessoa.
- **Importação do DXF.** O seletor nativo de arquivos não é acessível pela automação. O arquivo foi entregue ao campo de importação da máscara, que equivale a escolher o arquivo, e o restante do fluxo de importação foi feito pela interface.
- **Pan transparente não executado.** O código prevê pan com o botão do meio e com Espaço + arrastar (`CadCanvas.tsx`). A automação não consegue reproduzir esses gestos, então eles **não foram testados**. Foram testados apenas a roda do mouse (zoom) e o botão **Pan** no meio do comando.
- Em pontos isolados, a geometria resultante foi lida do SVG do desenho e do painel de propriedades, para conferir coordenadas e quantitativos com precisão. Isso complementa os testes de interface; não os substitui.

## Cenário A: Faixa ortogonal

**Descoberta.** Há o botão **Faixa ortogonal** na Ribbon (Armaduras › Faixas e telas) e o alias `FAIXA`. Sem seleção, o botão fica desabilitado e a dica diz _"Faixa ortogonal · FAIXA + Enter · Selecione um objeto antes."_ ([captura 03](03-faixa-dica-sem-selecao.jpg)). O alias `FAIXA` sem seleção responde _"Selecione um objeto antes."_ e não abre o comando.

**Quem determina quantidade e espaçamento.** O campo **Espaçamento** da Ribbon (Próximas criações) é lido no momento do 2º ponto. O resultado é a quantidade `ceil(L/s)+1`, com origem "Faixa · espaçamento máximo". Depois disso, o ajuste é feito no painel (Distribuição vinculada › Espaçamento máximo).

### A1. Bloco: sequência observada (mouse e encaixes)

1. Selecionar N1 (1 clique) e clicar em **Faixa ortogonal** (1 clique). O prompt diz _"Indique o início e o fim da faixa ortogonal. A quantidade será vinculada ao espaçamento."_
2. Clicar no início, com encaixe **Ponto médio** de N1 em (800, 50) (1 clique).
3. Clicar no fim, com encaixe **Ponto médio** da face superior do bloco em (800, 1600) (1 clique). Durante esse passo, a prévia mostra **apenas uma linha tracejada**, sem traços das barras, quantidade ou espaçamento ([captura 01](01-faixa-previa-encaixe-face.jpg)).
4. Resultado: **12 N1 c/14,1** ([captura 02](02-faixa-resultado-sem-cobrimento.jpg)), ou seja, ceil(1550/150)+1 = 12, com espaçamento real de 140,9 mm. O aviso é _"Faixa vinculada à posição; a quantidade inclui as duas extremidades."_

São **4 interações**, mas o encaixe disponível é a **face da fôrma**. A última barra fica em Y = 1600, **sem cobrimento**, e o resultado tem 1 barra a mais do que a faixa correta de 50 a 1550. A interface não alerta sobre isso. Para respeitar o cobrimento, foi preciso calcular e digitar os pontos.

### A2. Bloco: faixa precisa por coordenadas

- Os pontos `800,50` e depois `@30,1500` (com um desvio proposital de 30 mm em X) geraram **11 N1 c/15,0**, com eixo exato de (800,50) a (800,1550). Peso: 11 × 1,50 m × 0,617 kg/m = 10,18 kg.
- O desvio em X foi descartado pela projeção ortogonal. O comportamento está correto, mas é **silencioso**.

### A3. Viga

- Os pontos `2750,950` e depois `@3900,0` geraram **27 N3 c/15,0** (3900/150 + 1 = 27). ✔
- **Zoom com a roda** depois do 1º ponto: o ponto pendente é mantido (_"1 ponto(s) · …"_). ✔
- **Botão Pan** depois do 1º ponto: troca a ferramenta. Ao sair do Pan com Esc, a Faixa e o ponto pendente **foram perdidos** e foi preciso reiniciar o comando. O pan transparente (botão do meio ou Espaço) não foi testado; veja os limites do método.

### A4. Ajustes, cancelamento e histórico

| Ação                                         | Resultado                                                                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Espaçamento máximo de 150 para 200 no painel | 9 N1 c/19,4 (1550/8 = 193,75 mm), atualizado no desenho e na RA. ✔                                                                                                        |
| Ctrl+Z / Ctrl+Y                              | Um passo cada; o projeto volta a 12 e depois a 9. ✔                                                                                                                       |
| Esc depois do 1º ponto                       | Cancela o comando inteiro, sem deixar resíduo, e a barra continua selecionada. ✔                                                                                          |
| Remover distribuição                         | A faixa some, mas N1 continua com **9 peças**, e a origem passa para "Manual" **sem aviso**. Quem espera voltar a 1 barra fica com aço contado sem representação de faixa. |
| Clique sobre a linha ou os traços da faixa   | **Não seleciona** a posição. Só a barra-base seleciona.                                                                                                                    |
| Recarregar a página                          | O projeto é recuperado, mas o histórico de desfazer não volta.                                                                                                             |

### A5. Representação "Geometria repetida": defeito confirmado

Com a faixa de A2 (início em (800,50), barra com origem em (50,50)), mudar **Representação** para **Geometria repetida** desenha cada cópia com origem no ponto da faixa. As 11 barras vão de X = 800 a 2300, quando deveriam ir de 50 a 1550, e **saem 700 mm da fôrma** ([captura 04](04-faixa-geometria-repetida-deslocada.jpg)). Na viga (A3), as cópias de N3 sobem 220 mm (Y de 950 a 1390) e **ultrapassam o topo da viga** (1200).

- **Causa (inspeção de código):** `distributionOrigins` ([`src/domain/drafting.ts`](../../../src/domain/drafting.ts)) usa `distribution.start` como origem de cada cópia. Quando o início da faixa coincide com a origem da barra (caso do `D` e do Repetir estribo), o resultado está certo. É o que se observou em N2 (cópias de X 50 a 1550). Quando a faixa começa em outro ponto, que é o uso documentado em [`docs/GUIA.md`](../../GUIA.md) (_"início e fim independentes da posição da barra"_), a geometria é transladada.
- **Alcance:** a mesma função alimenta `repeatedGeometry`, usada em `drawingPrimitives.ts` para exportação. Uma sonda Vitest temporária, já removida, retornou a 1ª cópia de (800,50) a (2300,50) na `a814d6f`. **A quantidade e o peso não mudam**; o erro é de representação.
- **Duplicidade:** não foi encontrada issue aberta sobre isso. A #176 (traços de estribos, fechada) e a #199 tratam de outra representação.

### Conclusão: Faixa ortogonal

O comando é **fácil de descobrir e rápido** (4 interações quando o espaçamento da Ribbon já serve), e a quantidade é previsível e bem explicada. Os atritos concretos são três: a **prévia não mostra contagem nem espaçamento**, o **encaixe natural na face ignora o cobrimento** (o que gera +1 barra) e **não há como ajustar os extremos depois**, porque o painel não tem campos de início/fim e não há alças (grips) no desenho. Para corrigir um extremo, é preciso refazer o comando ou usar `D` (ver B4). A "Geometria repetida" tem um defeito que desloca a armadura desenhada e exportada.

## Cenário B: Distribuir armadura

**Descoberta.** **Não há botão na Ribbon.** O comando só é acessível pelo atalho de tecla `D` e pelo alias `D`. Isso é coerente com o inventário mínimo da [#120](https://github.com/ricardocorsini/armadura-struct/issues/120), que não o inclui. Durante o comando, nenhum botão fica destacado; a única indicação é o prompt _"Indique o ponto final da distribuição. Ajuste quantidade e espaçamento no painel."_ O início é **implícito**: a origem da barra, que é o 1º vértice desenhado. A interface não informa isso; está documentado no [GUIA](../../GUIA.md).

**Quem determina quantidade e espaçamento.** O comando cria a distribuição com **quantidade fixa = 2** ("Faixa · quantidade fixa") e **ignora o Espaçamento da Ribbon**. Quantidade e espaçamento são decididos **depois**, no painel.

### B1. Bloco: sequência observada

1. Selecionar N2 (1 clique) e pressionar `D` (1 tecla).
2. Mover o cursor: **não há prévia nenhuma**, nem linha elástica nem marcas ([captura 05](05-distribuir-sem-previa.jpg)).
3. Clicar num ponto "à direita" (1 clique). Como ORTO vem desligado por padrão, a distribuição saiu **diagonal**, com **2 N2 c/133,8**. O campo **Espaçamento máximo** exibiu o valor sem formatação `1338.1254603102352` ([captura 06](06-distribuir-diagonal-espacamento-cru.jpg)).
4. Desfazer (1 passo) e repetir com `1550,50` digitado: o resultado foi **2 N2 c/150,0**, isto é, 1500 mm entre as duas barras, em cm.
5. No painel, rolar até Distribuição vinculada, digitar 150 e sair do campo (cerca de 3 interações). O resultado foi **11 N2 c/15,0** ([captura 07](07-distribuir-apos-ajuste.jpg)). ✔ Ao sair do campo com Tab, o foco cai em **Remover distribuição**; um Enter a seguir removeria a distribuição.

São cerca de **6 interações** até o resultado desejado, contra 4 na Faixa. Há também o risco de distribuição oblíqua se o ponto final não for digitado ou encaixado.

### B2. Viga

- N4 com `D` e `6650,730` gerou **2 N4 c/385,0**, o mesmo padrão do bloco.
- Digitando **Peças por grupo = 27**, o resultado foi **27 N4 c/14,8**, com espaçamento de 3850/26 = 148,08 mm. ✔ O campo de espaçamento voltou a exibir `148.07692307692307`.

### B3. Geometria repetida

Em N2 (início = origem), as cópias ficaram corretas, em X = 50, 200, …, 1550. Isso confirma que o defeito de A5 é específico da Faixa ortogonal com início diferente da origem.

### B4. `D` sobre uma barra que já tem faixa

Em N1, com a faixa de (800,50) a (800,1550), `D` seguido de `800,1300` **manteve o início da faixa e trocou só o fim**, com resultado **10 N1 c/13,9**. Na prática, isso serve para corrigir o extremo de uma faixa, mas não é documentado. A mensagem diz _"Distribuição criada"_, embora a distribuição tenha sido editada.

### Conclusão: Distribuir armadura

O comando funciona, a quantidade final é correta e Ctrl+Z desfaz em um passo. Ainda assim, é **mais trabalhoso e menos previsível** que a Faixa: ele é pouco descobrível (só atalho), tem início implícito, não mostra prévia, não restringe a direção, sempre cria 2 barras e obriga a uma segunda etapa no painel, onde o espaçamento aparece sem formatação.

## Diferenças entre os dois comandos

| Aspecto            | Faixa ortogonal                           | Distribuir armadura                    |
| ------------------ | ----------------------------------------- | -------------------------------------- |
| Acesso             | Ribbon + `FAIXA`                          | Só `D` (tecla ou alias)                |
| Pontos             | Início e fim, ambos indicados             | Só o fim; o início é a origem da barra |
| Direção            | Sempre horizontal ou vertical (projeção)  | Livre; segue ORTO se ligado            |
| Quantidade inicial | `ceil(L/s)+1` com o Espaçamento da Ribbon | Sempre 2 (quantidade fixa)             |
| Prévia             | Linha tracejada, sem contagem             | Nenhuma                                |
| Mensagem final     | Explica as extremidades                   | Manda ajustar no painel                |
| Geometria repetida | **Desloca** se início ≠ origem (A5)       | Correta                                |

## Comparação com software similar

**Produto:** Autodesk Revit 2023 (Structure), comando _Rebar Set_. **Fonte:** documentação oficial, [Place a Rebar Set](https://help.autodesk.com/view/RVT/2023/ENU/?guid=GUID-7275163F-54C6-4684-99A5-7A61D7B1D061), consultada em 13/11/2026. **Não houve ensaio direto**, porque não havia acesso ou licença. Não há tempos nem passos medidos; o que segue é apenas o que a documentação descreve.

O que a documentação diz:

- A **regra de distribuição** (_Layout_) é escolhida **antes** de posicionar: _Fixed Number_ (quantidade fixa, espaçamento variável), _Maximum Spacing_ (espaçamento máximo, quantidade variável), _Number with Spacing_ e _Minimum Clear Spacing_. Quantidade e/ou espaçamento são informados na mesma barra de opções.
- Depois de colocado, o conjunto é editado pelas propriedades **ou por alças nas extremidades do conjunto**. Arrastar uma alça recalcula a quantidade em _Maximum Spacing_ e o espaçamento em _Fixed Number_.
- A primeira e a última barra podem ser suprimidas por caixas de seleção, e a direção do conjunto pode ser invertida.

Limites de comparabilidade: o Revit é BIM 3D, com barras hospedadas num elemento e cobrimento do hospedeiro. O ArmaduraStruct é CAD 2D sobre máscara, sem hospedeiro. A comparação vale apenas para o **fluxo**: o Revit escolhe a regra antes do lançamento e ajusta os extremos diretamente no desenho. No ArmaduraStruct, a Faixa define a regra antes, pelo espaçamento da Ribbon; o `D` a define depois, no painel; e nenhum dos dois tem alças nos extremos.

## Propostas de melhoria

Propostas separadas de implementação: cada uma deve virar issue ou PR própria, se aprovada. A prioridade considera o efeito sobre a informação estrutural.

| #   | Prioridade | Proposta                                                                                                                                                                                                          | Constatação ou hipótese                                                                                                       | Riscos / dependências                                                                                                                                          |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Alta**   | Corrigir "Geometria repetida" da Faixa: cada cópia deve partir da **origem da barra** deslocada ao longo da faixa (`origin + k·passo·u`), e não do ponto de início. O traço da faixa continua no início indicado. | **Constatação** (A5), reproduzida no desenho e no gerador de exportação.                                                      | Muda o desenho e a exportação de projetos que já usam essa representação; precisa de teste Vitest com referência analítica e conferência do DXF/PDF exportado. |
| P2  | Média      | Faixa: mostrar na prévia do 2º ponto os traços e o texto `n Nx c/s` antes de confirmar.                                                                                                                           | **Constatação**: a prévia atual é só uma linha (A1).                                                                          | Custo de renderização em faixas grandes; ver [#175](https://github.com/ricardocorsini/armadura-struct/issues/175).                                             |
| P3  | Média      | Faixa: oferecer um recuo opcional dos extremos (por exemplo, "descontar cobrimento", usando o Cobrimento da Ribbon) ou avisar quando um extremo cai sobre a face da máscara.                                      | **Constatação**: encaixe na face gerou +1 barra sem cobrimento (A1). **Hipótese**: o recuo reduz a digitação de coordenadas.  | Não pode aumentar o aço sem o usuário ver; o padrão deve continuar sendo o ponto clicado.                                                                      |
| P4  | Média      | Distribuir: mostrar uma prévia (linha elástica e traços) e respeitar a direção ortogonal, ou ao menos avisar quando a direção é oblíqua.                                                                          | **Constatação**: sem prévia e com resultado diagonal (B1).                                                                    | Distribuição oblíqua pode ser intencional; não proibir.                                                                                                        |
| P5  | Média      | Distribuir: criar a distribuição já com o Espaçamento da Ribbon, como a Faixa, em vez de quantidade fixa 2; ou perguntar quantidade/espaçamento no próprio comando.                                               | **Constatação**: sempre cria 2 e obriga à etapa no painel (B1). **Hipótese**: reduz de cerca de 6 para cerca de 3 interações. | Muda o resultado padrão do comando; testes existentes podem fixar o valor 2.                                                                                   |
| P6  | Baixa      | Formatar o campo **Espaçamento máximo** com precisão de exibição (por exemplo, 1 casa) quando o valor for derivado.                                                                                               | **Constatação**: `1338.1254603102352` e `148.07692307692307` (B1, B2).                                                        | Não arredondar o valor guardado.                                                                                                                               |
| P7  | Baixa      | Avisar ao **Remover distribuição** que a quantidade continua N (manual), ou oferecer voltar a 1.                                                                                                                  | **Constatação** (A4).                                                                                                         | Não alterar o quantitativo sem a escolha do usuário.                                                                                                           |
| P8  | Baixa      | Permitir ajustar os extremos da faixa no painel (início/fim) ou por alças. Hoje o caminho não documentado é `D` sobre a faixa (B4), cuja mensagem também poderia dizer "Distribuição atualizada".                 | **Constatação** (A4, B4); a referência é o Revit (alças nos extremos).                                                        | Precisa de validação de extremos e de histórico atômico (uma entrada de desfazer).                                                                             |
| P9  | Baixa      | Tornar a linha da faixa selecionável (seleciona a posição) e indicar visualmente o comando `D` ativo (status ou destaque).                                                                                        | **Constatação** (A4, B1).                                                                                                     | A seleção por traço pode conflitar com o clique sobre a máscara.                                                                                               |

Sobre a descoberta do `D`, não se propõe aqui recolocá-lo na Ribbon, porque isso seria rever a decisão da #120. A proposta é apenas registrar a dificuldade observada. Sobre ícones, ver [#174](https://github.com/ricardocorsini/armadura-struct/issues/174).

## Resumo

**Passou**

- Faixa: descoberta (botão, alias, dica), cálculo `ceil(L/s)+1` no bloco e na viga, precisão por coordenadas, projeção ortogonal, edição do espaçamento, Esc, Ctrl+Z/Ctrl+Y e zoom com a roda no meio do comando.
- Distribuir: quantidade final correta por espaçamento e por quantidade, Ctrl+Z e geometria repetida com início na origem.
- Quantitativos coerentes com as contas manuais em todos os casos (por exemplo, 12 × 1,5 m × 0,617 = 11,10 kg).

**Falhou**

- **Geometria repetida da Faixa desloca a armadura** quando o início difere da origem da barra (desenho e exportação).

**Atritos**

- Faixa: prévia sem contagem; encaixe na face ignora o cobrimento (+1 barra); extremos não editáveis; Pan pelo botão perde o comando; remover distribuição mantém a quantidade em silêncio; traço da faixa não selecionável.
- Distribuir: só por atalho; início implícito; sem prévia; direção livre; quantidade inicial 2; espaçamento exibido sem formatação; foco cai em "Remover distribuição" após o Tab.

**Não executado**

- Linux.
- App desktop (Tauri).
- Pan pelo botão do meio e por Espaço.
- Tempos de uma pessoa (primeira utilização e com familiaridade).
- Ensaio direto em outro software (só documentação).
- Conferência visual de um DXF/PDF exportado: o efeito na exportação foi verificado apenas na função que gera as primitivas.

## Evidências

| Captura                                                                                  | Mostra                                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [01-faixa-previa-encaixe-face.jpg](01-faixa-previa-encaixe-face.jpg)                     | Prévia da Faixa (linha tracejada) e encaixe na face |
| [02-faixa-resultado-sem-cobrimento.jpg](02-faixa-resultado-sem-cobrimento.jpg)           | 12 N1 c/14,1 com a última barra na face             |
| [03-faixa-dica-sem-selecao.jpg](03-faixa-dica-sem-selecao.jpg)                           | Dica do botão desabilitado                          |
| [04-faixa-geometria-repetida-deslocada.jpg](04-faixa-geometria-repetida-deslocada.jpg)   | Cópias deslocadas para fora do bloco                |
| [05-distribuir-sem-previa.jpg](05-distribuir-sem-previa.jpg)                             | `D` ativo, sem prévia                               |
| [06-distribuir-diagonal-espacamento-cru.jpg](06-distribuir-diagonal-espacamento-cru.jpg) | Distribuição oblíqua e espaçamento sem formatação   |
| [07-distribuir-apos-ajuste.jpg](07-distribuir-apos-ajuste.jpg)                           | 11 N2 c/15,0 após o ajuste no painel                |

As capturas foram feitas durante a execução na `3ab67ea`. Os achados que elas mostram foram reconferidos na `a814d6f` por leitura do desenho e do painel.
