# Modelos vinculados a uma origem externa

Um modelo de margem e selo pode ser **vinculado** a um arquivo de modelo do escritório (`.json`, exportado por **Exportar modelo**). O projeto acompanha a situação desse arquivo e atualiza só as folhas escolhidas, preservando os dados e ajustes de cada folha. O arquivo externo nunca é alterado.

## Ciclo vincular → verificar → atualizar → desvincular

1. **Vincular.** Em **Pranchas → Modelos de margem e selo → Origem externa do modelo**, use **Vincular modelo do escritório (.json)**. A prévia mostra o modelo, a revisão do arquivo, a origem e as folhas que vão recebê-lo. Se o arquivo trouxer [propriedades personalizadas](PROPRIEDADES-PERSONALIZADAS-DO-SELO.md), o mapeamento é conferido antes. **Confirmar vínculo** adiciona o modelo à biblioteca e o aplica às folhas marcadas numa única etapa de Desfazer.
2. **Verificar.** Relê o arquivo escolhido nesta sessão e compara o conteúdo com a revisão incorporada. A verificação só atualiza a situação exibida; nunca aplica conteúdo.
3. **Atualizar.** Quando houver revisão diferente, abre a comparação **antes/depois**. Escolha as folhas que vão mudar; as demais permanecem na revisão anterior. Resolva os conflitos e confirme com **Atualizar folhas selecionadas**.
4. **Localizar novamente.** Pede a escolha explícita do arquivo. Se for o mesmo modelo, com o mesmo conteúdo, só restaura o acesso (e a referência de nome): as folhas não mudam. Conteúdo diferente abre a comparação. Um arquivo de outro modelo (identidade diferente, mesmo que tenha o mesmo nome) é sinalizado e também exige a comparação. Cancelar ou falhar não altera nada.
5. **Desvincular.** Remove a dependência externa da biblioteca e/ou das folhas escolhidas. Aparência, campos, definições, mapeamentos e valores continuam iguais; as folhas não escolhidas mantêm o vínculo.

## Situação do vínculo

| Situação                         | Significado                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ainda não verificado             | Nenhum arquivo foi lido nesta sessão. Não significa “atualizado”.                               |
| Verificando…                     | Leitura em andamento.                                                                           |
| Atualizado                       | O arquivo lido tem o mesmo conteúdo da revisão incorporada.                                     |
| Atualização disponível           | O arquivo lido é válido e difere do que a folha usa.                                            |
| Origem indisponível              | Sem acesso nesta sessão, arquivo movido, removido ou sem permissão. O selo continua utilizável. |
| Arquivo inválido ou incompatível | Arquivo corrompido, formato futuro, grande demais ou leitura que excedeu o tempo.               |
| O arquivo é outro modelo         | A identidade do modelo no arquivo é diferente da vinculada.                                     |

A situação aparece no editor de modelos (biblioteca e cada folha, com o horário da última verificação) e, para a folha ativa, no gerenciador de pranchas.

## Identidade, revisão e conteúdo

- A identidade é o ID do modelo dentro do arquivo, não o nome ou o caminho. Nome e data de modificação não identificam revisões.
- O conteúdo é comparado por um hash SHA-256 sobre papel (formato, orientação, tamanho), área útil, reserva do selo, geometria com estilos e textos, campos (caixas, tipografia, texto estático, vínculos, prefixos/sufixos) e as definições de propriedades que eles usam. ID, número de revisão, nome do arquivo e datas ficam fora. O hash detecta diferença; não prova autenticidade.
- Cada folha guarda sua própria cópia completa da revisão aceita. Atualizar a biblioteca não muda uma folha não escolhida, e nenhuma folha perde a revisão de que depende.

## Regras de preservação e conflitos

A atualização compara três versões: a revisão aceita anteriormente, o modelo da biblioteca (com seus ajustes locais) e a revisão recebida.

- Mudança só no modelo é aceita; ajuste só local é mantido; a mesma mudança dos dois lados é aceita.
- Se o modelo e o ajuste local mudaram o **mesmo atributo** (por exemplo, o texto estático de um campo), a prévia mostra um conflito: escolha **Manter o ajuste local** ou **Aceitar o modelo**. Nada é decidido por nome, ordem ou posição gráfica.
- Campos são reconhecidos pelo ID: renomear um campo no modelo conserva os vínculos. Campo removido no modelo exige escolha: **Manter como campo local** ou **Remover**; a prévia lista as folhas com vínculos locais que seriam descartados.
- Tipos de propriedade incompatíveis e propriedades homônimas seguem o mapeamento das propriedades personalizadas: criar uma propriedade independente ou associar uma compatível, sem apagar valores.
- Nome, revisão e notas da folha, dados documentais, herança, vazio explícito, textos manuais, origens escolhidas, valores personalizados, vistas, posições, escalas, rotações e quadro de aço não mudam. O cadastro do projeto não é substituído por dados do autor do arquivo.
- Um papel ou área útil menor não move vistas, não recorta, não reduz fontes e não muda escalas: a prévia mostra os diagnósticos de composição por folha, e as exportações continuam bloqueadas enquanto houver erro.

**Confirmar** grava a nova revisão, a base aceita, os mapeamentos e todas as folhas escolhidas numa única etapa de Desfazer/Refazer. Desfazer e refazer usam os dados incorporados, sem reler a origem. Antes de gravar, o aplicativo relê o arquivo autorizado: se ele mudou durante a prévia, ou se o projeto mudou, é preciso gerar uma nova prévia. Cliques repetidos não duplicam a operação.

## Acesso aos arquivos e modo web

- Só arquivos escolhidos explicitamente nesta sessão são lidos. O projeto guarda o nome do arquivo apenas como referência; ele nunca é usado como autorização, e nenhuma credencial é salva.
- Ao abrir o projeto em outro computador ou em outra sessão, o selo é desenhado pela cópia incorporada e a situação fica **Ainda não verificado**. Use **Localizar novamente** para escolher o arquivo.
- No aplicativo desktop, o arquivo escolhido pode ser relido na mesma sessão com **Verificar**. No navegador não há acesso persistente: se o arquivo mudar, escolha-o de novo em **Localizar novamente** (reimportação manual). Não há vigilância contínua nem detecção automática.
- Leituras são limitadas a 30 MB e 20 s; uma resposta atrasada não sobrescreve uma verificação mais recente.

## Arquivos e compatibilidade

Vínculos são salvos em **armadurastruct/42**. O /40 está reservado à #145 e o /41 às propriedades personalizadas (#143). Projetos anteriores abrem sem vínculos inventados; dados de vínculo em arquivo marcado com formato anterior são recusados (“exigem formato 42”), assim como referências a origens inexistentes. Duplicar uma folha mantém a referência à mesma origem, com cópia e dados locais independentes. Duplicar um modelo da biblioteca cria uma definição independente, sem vínculo. O arquivo exportado de um modelo não leva o vínculo.

Tela, PDF e DXF de folhas usam sempre a revisão incorporada, mesmo sem acesso à origem; os valores automáticos continuam vindo dos dados atuais do projeto. Nada disso altera armaduras, quantitativos, RA ou CSV.
