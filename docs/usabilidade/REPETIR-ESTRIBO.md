# Usabilidade: Repetir estribo (#179)

Relatório de ensaio de execução do comando **Repetir estribo** (`repeat`). Pedido pela issue [#179](https://github.com/ricardocorsini/armadura-struct/issues/179). É um relatório de testes; não altera código.

## 1. Condições do ensaio

| Item                 | Valor                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versão               | 0.6.1, `master` em `3ab67ea` (merge do PR #193), revalidada no início do ensaio em 13/11/2026. Antes da entrega a `master` avançou para `888371b` (#195), só com documentação: `src/` idêntico ao testado |
| Execução             | Build web de desenvolvimento (`npm run dev`, Vite). **Não** foi testado o desktop Tauri                                                                                                                   |
| Sistema              | Windows 11 Pro 22631. **Linux não foi testado** (ambiente indisponível); nada aqui deve ser generalizado para Linux                                                                                       |
| Navegador            | Painel de navegador Chromium embutido, viewport emulado de 1440×900                                                                                                                                       |
| Entrada              | Mouse e teclado **automatizados** (agente de IA operando cliques, roda e digitação). Não houve usuário humano                                                                                             |
| Tempo                | **Não medido.** A latência do agente não representa o tempo de uma pessoa; o esforço foi registrado como contagem de ações                                                                                |
| Arquivo de teste     | [`repetir-estribo/forma-viga-v1.dxf`](repetir-estribo/forma-viga-v1.dxf): elevação da V1 20×50 entre P1 e P2 (20 cm), vão livre 5.000 mm (faces em x = 200 e x = 5.200), seção 20×50 em x = 6.400         |
| Estribo de partida   | N1, retangular fechado, Ø8 CA-60, seção de concreto 200×500 com cobrimento 30 (eixo 132×432), lançado com **E**, modo "Somente seção", canto em `6400,0`                                                  |
| Espaçamento da faixa | 150 mm (campo **Espaçamento** em _Próximas criações_)                                                                                                                                                     |

"Primeira utilização" e "repetição com familiaridade" foram simuladas pelo mesmo operador: a primeira execução partiu só das dicas da interface; as seguintes já conheciam o fluxo. Sem usuário humano, essa distinção é limitada.

## 2. Cenários e evidências

### C1. Descoberta do comando

- Em **Armaduras › Lançar**, o ícone **Repetir estribo** fica abaixo de Estribo/Critérios. Sem seleção ele aparece desabilitado, e a dica diz "Repetir estribo · REPETIR + Enter · Selecione um objeto antes." ([01](repetir-estribo/01-dica-sem-selecao.png)).
- Digitar `REPETIR` sem seleção não inicia o comando. Aparece "Selecione um objeto antes.", e é preciso selecionar e chamar de novo.
- **Atrito:** a dica fala em "objeto", mas o comando só aceita estribo. Ver C5.

### C2. Fluxo principal: selecionar, repetir e indicar o fim

Sequência observada, com o estribo já lançado: (1) clicar no N1, (2) clicar em Repetir estribo (ou `REPETIR` + Enter), (3) clicar no ponto final. São **3 ações**, mais a edição do campo Espaçamento quando o passo muda.

- Com o comando ativo, a barra de status mostra "Selecione um estribo e indique o fim da repetição. O espaçamento máximo está na faixa de comandos."
- Os encaixes funcionam: "Ponto médio" foi capturado na face do P2 ([02](repetir-estribo/02-repetir-ativo-sem-previa.jpg)).
- **Não há prévia.** Antes do clique não aparece linha de distribuição, quantidade, passo efetivo nem as cópias. O clique já grava o resultado, sem etapa de confirmação.
- **Resultado:** o primeiro clique foi na face do P2 (5200, 250). A distribuição foi criada da origem do estribo (6400, 0) até esse ponto, numa linha **oblíqua**. Resultado: 10 cópias completas da seção sobrepostas à elevação e ao pilar, rotuladas "10 N1 Ø8,0 c/13,6 cm" ([03](repetir-estribo/03-resultado-obliquo-10-pecas.jpg), [03b](repetir-estribo/03b-detalhe-sobreposicao.png)).
  - Conferência: o comprimento oblíquo é √(1200² + 250²) ≈ 1.225,8 mm. ceil(1.225,8/150) + 1 = **10** peças, com passo 1.225,8/9 ≈ 136 mm, igual ao rótulo. Na horizontal (1.200 mm) seriam **9** peças. **Um clique fora do alinhamento acrescentou 1 estribo (+11 %)** sem nenhum aviso.
- O painel Propriedades passou a mostrar "Peças por grupo 10", "Origem da quantidade base: Faixa · espaçamento máximo 150 mm", Representação "Geometria repetida" e "Faixa por traços", Espaçamento máximo editável e "Remover distribuição". Ele **não** mostra campos numéricos de início e fim da faixa.

### C3. Desfazer, refazer e Esc

- Ctrl+Z voltou o N1 para 1 peça e manteve a seleção ([04](repetir-estribo/04-desfazer.jpg)). Ctrl+Y restaurou as 10 peças. **Passou.**
- Esc com o comando ativo cancelou sem alterar o projeto (43 peças antes e depois) e manteve a seleção. **Passou.**

### C4. Repetir em outra região, com ORTO e zoom no meio do fluxo

- Com o N1 já distribuído, ORTO (F8) ligado e o comando ativo, afastei o zoom com a roda e cliquei no encaixe "Ponto médio" da face do P1 (200, 250).
- O zoom pela roda no meio do comando funcionou, e o comando continuou ativo.
- **A nova repetição substituiu a anterior**, sem criar uma segunda região: o N1 passou a 43 peças, "43 N1 Ø8,0 c/14,8 cm" ([05](repetir-estribo/05-segunda-regiao-substitui-43-pecas.jpg)). Não houve aviso de substituição. Uma posição tem uma só distribuição; o mesmo comportamento aparece no E2E `tests/e2e/upgrade.spec.ts`, em que a Faixa ortogonal sobrescreve a repetição.
- **ORTO não restringiu o ponto final.** A faixa continuou oblíqua (desvio de 250 mm em y). O passo de 14,8 cm confere com o comprimento oblíquo: √(6200² + 250²)/42 ≈ 147,7 mm.
- **Correção de extremos:** a faixa começa sempre na origem da própria posição (o canto da seção em x = 6.400). Por isso a repetição atravessou o vazio entre a seção e a elevação, o P2 e todo o vão. Com faces a 5 cm dos pilares, o trecho útil (200 + 50 até 5.200 − 50) pede ceil(4.900/150) + 1 = **34** peças. O comando gerou **43** (+9 peças, +26 %, cerca de 4,5 kg a mais pelo peso unitário mostrado, 21,28 kg/43). O comando não oferece ponto inicial independente: para acertar o início, a seção teria de estar desenhada na posição inicial da faixa.

### C5. Seleção de objeto que não é estribo

- Na retomada após o painel do navegador fechar, um clique no desenho selecionou um objeto que não era armadura (o painel Propriedades continuou em "Selecione uma armadura para editar"). Mesmo assim, o botão Repetir ficou **habilitado** e o comando iniciou. Só no clique final apareceu "Selecione uma armadura antes de usar este comando.", e nada foi gravado.
- Isso confirma a regra de habilitação: ela conta qualquer objeto selecionado (`selection: 1` em `src/domain/shortcuts.ts`). O tipo só é verificado no clique, em `src/App.tsx` ("Repetir estribo exige uma posição do tipo estribo." para armaduras de outro tipo).
- Não identifiquei com certeza qual objeto ficou selecionado (provavelmente a linha da máscara); a causa exata fica como hipótese.

### Não executado

- Linux e desktop Tauri.
- Ponto final digitado no comando CAD (`REPETIR`, depois `5150,0`). A tentativa coincidiu com o caso C5, e o painel do navegador ficou instável depois disso; não houve repetição limpa. O E2E existente cobre `REPETIR` + `1000,0`.
- Troca da representação para "Faixa por traços" e conferência do quadro de aço/PDF. A opção existe nas propriedades, mas não foi acionada.
- Repetição de armadura que não é estribo (barra livre), com seleção válida.
- Pan com arraste no meio do comando (só o zoom pela roda foi testado).

## 3. Atual: conclusão simples

O comando é **rápido de executar** (3 ações) e previsível em histórico e Esc. Em contrapartida, **é fácil errar sem perceber**:

1. Não há prévia nem confirmação: o usuário só vê quantidade e posição depois de gravar.
2. O início da faixa é a origem da seção, sem como definir outro ponto. A seção costuma estar fora da elevação, e a repetição atravessa vazios e pilares.
3. O fim aceita qualquer direção, e ORTO não restringe. Um clique levemente fora gera faixa oblíqua e pode acrescentar peças (+1 no ensaio).
4. Repetir de novo substitui a faixa existente sem avisar. "Repetir em outra região" não é possível com a mesma posição.
5. Habilitação e dica falam em "objeto", e o erro de tipo só aparece no fim.
6. A representação padrão (geometria completa sobreposta) é ilegível na elevação. Ver #176 para a leitura dos traços da faixa.

Para estribos ao longo de uma viga em elevação, o fluxo **E › Seção + faixa** já tem o que falta aqui: duas faces, afastamentos, prévia com quantidade e passo efetivo, confirmação, Voltar etapa (ver [Estribos](../ESTRIBOS.md) e #178). A **Faixa ortogonal** já força direção horizontal ou vertical e tem início independente. A avaliação do fluxo **E** é escopo da #178 e não foi refeita aqui.

**Veredito:** é simples, mas **não é seguro** para o objetivo "distribuir estribos ao longo de uma viga". Uma operação de 3 cliques pode gerar aço a mais e uma representação incorreta sem nenhum sinal antes de gravar.

## 4. Comparação

- **Bloqueada.** Tentei a documentação oficial do Autodesk Revit (tópicos "Place a Rebar Set" e "Rebar Instance Properties", em help.autodesk.com, versões 2025 e 2026). A busca do site lista esses tópicos, e o trecho de "Rebar Instance Properties" cita uma "Rebar Set Layout Rule". Porém as páginas de conteúdo retornaram "Page Not Found" tanto por leitura automática quanto pelo navegador em 13/11/2026. Não li as regras de layout, a prévia nem a edição de extremos; nada disso é afirmado aqui.
- Não houve acesso licenciado a nenhum software de detalhamento, nem ensaio direto. Não há tempos de comparação.
- Referência interna verificada no próprio ensaio e na documentação do repositório: o fluxo **E › Seção + faixa** e a **Faixa ortogonal**. Os dois são do mesmo produto e não substituem a comparação externa pedida.
- **Lacuna:** a comparação externa continua pendente. Sugestão: anexar uma página oficial acessível (Revit, TQS ou Eberick) ou um ensaio autorizado.

## 5. Melhorias propostas (sem implementação)

Constatações (C) vêm do ensaio. Hipóteses (H) são benefícios esperados e não foram verificadas.

| Prioridade | Proposta                                                                                                                                                | Base                          | Benefício esperado (H)                                     | Riscos e dependências                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Alta       | Prévia antes de gravar (linha da faixa, cópias ou traços, "n peças · passo efetivo") e confirmação por clique ou Enter, como no fluxo E                 | C2: sem prévia                | O usuário confere quantidade e posição antes do aço entrar | Desempenho com muitas cópias (relacionar com #175); muda o E2E `REPETIR` + ponto                      |
| Alta       | Aplicar ORTO, ou ao menos alinhar com o eixo predominante como a Faixa ortogonal, ao ponto final relativo à origem                                      | C2/C4: faixa oblíqua, +1 peça | Evita peças extras por clique impreciso                    | Faixas inclinadas legítimas (vigas inclinadas) precisam continuar possíveis com ORTO desligado        |
| Alta       | Permitir indicar o início da faixa (primeira face) e afastamentos, ou encaminhar para Seção + faixa ou Faixa ortogonal quando o objetivo for a elevação | C4: 43 × 34 peças             | Quantidade correta sem redesenhar a seção no lugar         | Sobreposição com a Faixa ortogonal e com a #178; decidir se Repetir continua existindo ou vira atalho |
| Média      | Avisar ao repetir uma posição que já tem distribuição ("substituir a faixa atual?"), ou deixar claro que é edição da faixa                              | C4: substituição silenciosa   | Evita perda inesperada da faixa anterior                   | Múltiplas regiões na mesma posição exigem mudança de modelo (fora do escopo)                          |
| Média      | Habilitar o botão só com estribo selecionado e trocar a dica para "Selecione um estribo antes."                                                         | C1/C5                         | Erro mostrado no início, não no último clique              | A regra genérica `selection: 1` é compartilhada com outros comandos                                   |
| Baixa      | Mostrar início e fim da faixa (X/Y) nas propriedades para correção numérica                                                                             | C2                            | Corrigir extremos sem refazer o comando                    | Interação com grips existentes                                                                        |

Mudanças visuais da representação da faixa ficam na #176. Desempenho geral de pan e zoom fica na #175; ícones, na #174.

## 6. Resumo

- **Passou:** descoberta pelo ribbon e pela dica; comando por teclado (`REPETIR`); encaixes no ponto final; zoom pela roda no meio do comando; Esc sem efeito colateral; Desfazer e Refazer; quantidade igual a ceil(L/s) + 1 sobre o comprimento real da faixa.
- **Falhou (usabilidade):** sem prévia nem confirmação; faixa oblíqua aceita mesmo com ORTO, com peça extra; início fixo na origem da seção, que gerou aço excedente no cenário de viga; substituição silenciosa ao repetir; habilitação e dica genéricas ("objeto").
- **Não executado:** Linux, desktop Tauri, ponto final digitado em execução limpa, troca para "Faixa por traços" e verificação de quadro/PDF, comparação externa (bloqueada).
