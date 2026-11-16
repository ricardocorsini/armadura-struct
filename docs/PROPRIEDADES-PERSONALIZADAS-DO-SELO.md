# Propriedades personalizadas do selo

Além dos dados nativos (obra, código, autor, data, revisão…), o selo pode exibir **propriedades personalizadas** cadastradas no projeto, como “Unidade”, “Fase” ou “Carga de projeto”. Os textos do carimbo continuam com sua apresentação gráfica; só passam a receber o valor quando associados explicitamente a uma propriedade.

## Cadastrar propriedades

Em **Pranchas → Dados do selo**, use **Propriedades personalizadas → Nova propriedade**. Cada propriedade tem:

- **Nome**: rótulo legível, único no projeto (até 80 caracteres). Renomear conserva o ID, os valores e os vínculos.
- **Tipo**: Texto (até 300 caracteres, uma linha), Número (finito, com mínimo, máximo e casas decimais opcionais), Data civil (AAAA-MM-DD, sem horário ou fuso) ou Sim/Não.
- **Escopo**: **Projeto** (um valor para todas as folhas), **Folha** (valor por folha) ou **Projeto, com valor por folha** (a folha herda o projeto até receber valor local).
- **Valor padrão** opcional, validado pelo tipo e pelas regras.

O projeto admite até 200 propriedades. IDs repetidos, nomes repetidos, tipos desconhecidos, padrões inválidos e valores fora do escopo são recusados antes de gravar. O seletor de vínculos separa **Campos nativos** de **Propriedades personalizadas**; os dados nativos não são duplicados como propriedades.

## Valores, herança e vazio explícito

A precedência é: **texto manual do campo** → **valor da folha** → **valor do projeto** → **padrão da definição**. Um vínculo com origem direta **Projeto** consulta só o projeto e o padrão, nunca a folha.

- **Herdar do projeto** (ou **Usar o padrão da definição**) remove o valor local: é a ação que restaura a herança.
- **Vazio explícito** grava um vazio que prevalece sobre a herança. Zero, Não (falso) e texto vazio são valores, não ausência.
- Alterar o padrão não muda valores explícitos, inclusive vazios.

Na conferência, cada campo indica seu estado: automático, do projeto, herdado, local da folha, padrão da definição, manual, vazio explícito ou inválido.

## Converter texto em campo e voltar a texto

1. Em **Modelos de margem e selo**, selecione o texto importado em **Elemento gráfico** e use **Converter texto selecionado em campo do selo**. O texto original deixa de existir como desenho: não fica duplicado por baixo do campo. Ponto de inserção, fonte, altura em mm de papel, alinhamento, rotação, negrito e itálico são preservados. Textos com “@” continuam literais até essa associação.
2. Em **Campo automático do selo** (no editor de modelos) ou em **Vínculo de …** (em Dados do selo), escolha a propriedade. O campo guarda o **ID** da propriedade, nunca o nome nem uma cópia do valor.
3. **Prefixo** e **Sufixo** são textos literais, separados do valor: “Unid.: ” + “cm”. Eles aparecem somente quando há valor e entram na prévia e na verificação de encaixe. Trocar o vínculo mantém prefixo, sufixo e apresentação.
4. **Voltar a texto** mostra o texto que será fixado (o valor visível, com prefixo e sufixo) e pede confirmação. A partir daí o campo deixa de atualizar. Um campo inválido (transbordamento, origem removida, valor incompatível) não é congelado como se estivesse correto: corrija-o ou informe explicitamente o texto manual a fixar.

Os valores são dados textuais: nada é executado, interpretado como fórmula ou marcação, nem buscado fora do projeto.

## Alterar ou excluir definições

- Mudar tipo, regras ou escopo mostra quantos campos são afetados e quais valores ficariam incompatíveis. Nenhum valor é convertido ou apagado: enquanto houver valor incompatível, a alteração é recusada e os dados anteriores continuam iguais.
- Excluir uma propriedade usada por campos exige escolher uma **substituta** do mesmo tipo; todos os campos (biblioteca e revisões incorporadas às folhas) passam a apontar para ela na mesma etapa. Os valores da propriedade excluída são descartados, o que é informado antes de aplicar. Sem substituta, a exclusão é impedida e as folhas e campos dependentes são listados.

## Modelos exportados e importados

**Exportar modelo** grava um arquivo `armadurastruct.sheet-template/3` com as definições usadas pelos campos (ID, nome, tipo, escopo, padrão e regras). Valores do projeto e das folhas, textos manuais e associações locais não acompanham o arquivo.

Ao **Importar modelo (.json)** com propriedades, o editor mostra o mapeamento proposto antes de qualquer gravação:

| Situação                                                  | Proposta                                            |
| --------------------------------------------------------- | --------------------------------------------------- |
| Mesmo ID e mesmo contrato (tipo, escopo, regras e padrão) | Mesma propriedade                                   |
| Associação confirmada em importação anterior              | Mesma associação                                    |
| Mesmo ID, contrato divergente                             | Conflito: criar independente ou associar compatível |
| Nome coincidente, outra identidade                        | Criar independente, com nome sugerido “Nome (2)”    |
| Propriedade nova                                          | Criar                                               |

Nome coincidente nunca associa automaticamente nem substitui valor, tipo, padrão ou vínculo existentes. Associar só é possível a uma propriedade do mesmo tipo e escopo; o padrão local prevalece. **Confirmar mapeamento** remapeia todas as referências do modelo; **Salvar modelo** grava o modelo e as propriedades em uma única etapa de Desfazer. **Cancelar importação** não altera nada.

O projeto lembra o ID externo de cada associação confirmada (campo `aliases` da definição). Assim, reimportar o mesmo modelo reconhece as propriedades, inclusive renomeadas, sem criar duplicatas. Esse é o contrato de identidade que a atualização de modelos externos (#144) vai consumir.

## Edição, histórico e exportação

- **Conferir prévia** e **Cancelar** não alteram projeto, biblioteca, histórico nem estado de salvo. **Aplicar dados do selo** grava cadastro, valores, vínculos e “voltar a texto” em uma única etapa de Desfazer/Refazer; cliques repetidos não duplicam a operação, e uma janela aberta sobre um projeto substituído não grava.
- Duplicar uma folha copia seus valores e vínculos sem compartilhar objetos; as edições seguintes são independentes.
- Tela, PDF e DXF da folha usam a mesma composição e emitem o texto resolvido. Texto longo, valor inválido ou propriedade removida geram diagnóstico e bloqueiam a exportação, sem cortar nem reduzir o texto.
- Nada disso altera geometria, armaduras, quantitativos, RA ou CSV. Durante a edição isolada de um detalhamento, o cadastro global fica protegido.

## Arquivos e compatibilidade

Propriedades personalizadas, valores, prefixos e sufixos são salvos em **armadurastruct/41**. O formato /40 está reservado a uma contribuição paralela (#145). Projetos /39 e anteriores continuam abrindo sem conversão; dados de propriedades em arquivos marcados com formato anterior são recusados (“exigem formato 41”), assim como referências a propriedades inexistentes. Um projeto /41 permanece em /41 mesmo após remover as propriedades. Guarde uma cópia antes de salvar em formato novo se precisar abrir o projeto em versão anterior do aplicativo.

Modelos com propriedades usam a versão 3 do arquivo de modelo; as versões 1 e 2 continuam aceitas. Pacotes de detalhamento (`openstruct.detail/23` e `/24`) não transportam propriedades nem valores de folha.
