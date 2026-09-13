# KDS da Padaria — Revisão Definitiva (v3)

---

# PARTE 1 — AUDITORIA DA V2

## O que está correto e deve ser mantido

- Separação entre **status operacional** e **status de pagamento** — confirmada como necessária pela sua mensagem (seção 11). Mantida.
- **Ficha física coexistindo com o registro digital** no consumo local, sem tentativa de substituição no MVP. Mantida.
- **Estações configuráveis**, não fixas no sistema. Mantida.
- **Roteamento automático de item para estação**, derivado do cadastro do produto. Mantida.
- **Forma de venda (unidade/tamanho/peso) como propriedade configurável do produto**, nunca inferida por categoria. Mantida.
- **Caixa deliberadamente simples** (consultar + dar baixa), sem virar PDV. Mantida.
- **Cancelamento com histórico**, em vez de apagar dados. Mantida, com ajuste (ver abaixo).

## O que precisa ser corrigido, é complexo demais, ou deve sair do MVP

1. **Bloqueio de item "assumido" por um funcionário** (v2, seções J/R/Y) — a v2 tratou isso como parte do fluxo padrão de alta demanda. Você deixou claro (seção 13) que "assumido" não deve ser um estado obrigatório nem deve haver mecanismo de concorrência sem necessidade comprovada. **Correção: removido do fluxo de produção do MVP, movido para Funcionalidades Futuras.**

2. **Alerta de pedido atrasado** — a v2 já marcava o *valor* da tolerância como A DEFINIR, mas manteve a *funcionalidade em si* dentro do fluxo de alta demanda, o que soa como parte do MVP. Você listou explicitamente "alertas de atraso baseados em tempos arbitrários" como algo a não incluir no MVP (seção 24). **Correção: a funcionalidade inteira (não só o valor) sai do MVP e vai para Futuro.**

3. **Regra de priorização de pedidos agendados vs. imediatos** — a v2 propôs uma regra "para o MVP" (reservar horário-alvo, sem antecipar agendados na fila). Isso é uma forma de priorização sofisticada, que a regra de ouro (seção 24) pede para não incluir sem necessidade comprovada. **Correção: no MVP a fila é simplesmente por ordem de criação dentro de cada estação; o horário de retirada é armazenado e exibido, mas não reordena a fila automaticamente. A lógica de antecipação fica em Futuro.**

4. **Estado `EM_PRODUCAO` como separado de `PARCIALMENTE_PRONTO`** — na v2 os dois coexistiam de forma um pouco ambígua (quando um pedido está "em produção" mas nenhum item ainda ficou pronto, versus quando já há mistura de prontos/não prontos). Isso não é uma regra matematicamente inequívoca, como pedido na seção 14. **Correção: os dois estados foram unificados. Ver seção M da v3 — a regra de derivação agora cobre exatamente 4 casos, sem sobreposição.**

5. **`AGUARDANDO_RETIRADA` aplicado indistintamente a todos os tipos de consumo** — a v2 não diferenciou se esse estado faz sentido para consumo local (onde o item pronto normalmente é servido na hora, no balcão) versus viagem/WhatsApp (onde de fato existe uma espera). Isso não foi confirmado pela operação real. **Correção: marcado como A DEFINIR na seção AH, não presumido.**

6. **Falta de modelagem explícita da adição de itens a um pedido já aberto** — a v2 mencionava isso de passagem, mas não tratava o efeito colateral: um pedido que já estava `PRONTO` e recebe um novo item pendente precisa "regredir" de status. A v2 não explicava como isso acontece sem virar uma máquina de estados confusa. **Correção: a v3 trata o status do pedido como uma função pura recalculada a partir dos itens ativos a cada mudança (ver seção M e AI) — isso resolve o problema de regressão sem necessidade de transições especiais.**

7. **Ausência de definição de precisão para o peso armazenado** — você pediu isso explicitamente (seção 5) e a v2 não tratava. **Correção: adicionada decisão técnica explícita na seção J/AB.**

8. **Falta de distinção clara entre "item cancelado dentro de um pedido" e "pedido cancelado por inteiro"** — a v2 não deixava isso inequívoco. **Correção: tratado explicitamente na seção M/T.**

9. **Ausência de critérios de aceitação formais** — a v2 não tinha nada equivalente. **Correção: adicionada seção AJ com critérios Dado/Quando/Então.**

10. **Requisitos funcionais previamente redigidos de forma um pouco genérica** (ex.: "permitir marcar produto como indisponível") — mantidos, mas reescritos com formato testável na seção AC.

11. **"Adicionais" não tinha um tratamento de dados próprio** — mencionado apenas como campo solto. **Correção: detalhado como conceito na seção K e no modelo conceitual (seção AB).**

12. **"Estação de pesagem" tratada como pergunta em aberto que soava bloqueante** — na prática, o sistema não precisa saber *onde fisicamente* a pesagem ocorre: basta existir um campo de peso no item no momento do registro. **Correção: isso deixa de ser uma questão bloqueadora (ver "Questões que precisam ser respondidas", ao final — não está mais lá).**

## O que precisa ser acrescentado (novidade desta revisão)

- Regra de derivação de status do pedido matematicamente inequívoca (4 casos, sem sobreposição).
- Definição de armazenamento e arredondamento do valor de produtos por peso.
- Critérios de aceitação Dado/Quando/Então para o MVP.
- Tratamento explícito de "pedido aberto recebendo itens novos" como conceito central do modelo, não um detalhe lateral.
- Separação clara, na lista final, entre decisões já fechadas e perguntas genuinamente bloqueadoras (a maioria das dúvidas da v2 foi resolvida por arquitetura configurável, não precisa de resposta da padaria antes de começar a desenvolver).

---

# PARTE 2 — ESPECIFICAÇÃO FUNCIONAL CONSOLIDADA V3

## A. Objetivo do Sistema

Um KDS que registra pedidos digitalmente, identifica cada um por número único e nome do cliente, encaminha automaticamente os itens que exigem produção para a estação correta, permite acompanhar o andamento até a conclusão, e permite ao caixa consultar e dar baixa em pagamentos pendentes — sem se tornar um PDV, um sistema de estoque ou um sistema financeiro.

## B. Escopo e Limites

**Dentro do escopo:** registro de pedido, gestão de itens (incluindo adição posterior), cálculo de valor por unidade/tamanho/peso, roteamento por estação, acompanhamento de produção, consulta e baixa de pagamento, histórico básico de alterações/cancelamentos.

**Fora do escopo (nesta fase):** PDV, integração com maquininha, emissão fiscal, controle de estoque, integração com WhatsApp, financeiro, sangria/suprimento, relatórios avançados, qualquer mecanismo de concorrência ou bloqueio de item, priorização algorítmica sofisticada, alertas de atraso.

## C. Operação Atual (AS-IS)

Atendimento no balcão, qualquer atendente pode registrar um pedido em uma ficha de papel (nome do cliente, produtos, quantidades, tamanhos, adicionais, observações, valores, peso quando aplicável), preenchida manualmente sem opções padronizadas. Para consumo local, a ficha acompanha o cliente e recebe novos itens ao longo do atendimento; ao final, vai ao caixa para conferência e cobrança. Para viagem, a ficha fica com a produção e o cliente recebe apenas uma folha com o valor a pagar. Pedidos por WhatsApp são recebidos e registrados manualmente. Existe um monitor de produção, mas não é usado funcionalmente hoje. Falta de produto é resolvida verbalmente (avisar e sugerir alternativa). Cancelamentos/devoluções ajustam a ficha manualmente.

## D. Problemas Identificados

- Falta de padronização na ficha manual gera erros de interpretação (tamanhos por extenso, peso escrito à mão).
- Nenhuma visibilidade digital da fila de produção.
- Comunicação com a produção depende de papel ou fala.
- Sem vínculo formal entre a ficha física e um identificador consultável no caixa.
- Sem histórico de pedidos, alterações ou cancelamentos.

## E. Operação Proposta (TO-BE)

O pedido passa a existir como uma entidade digital única, aberta durante todo o atendimento (podendo receber novos itens), identificada por número + nome. Cada item é roteado automaticamente à estação certa a partir do cadastro do produto. A produção atualiza o status de cada item numa tela simples (`PENDENTE → EM_PREPARO → PRONTO`), sem necessidade de "assumir" itens. O sistema deriva automaticamente o status geral do pedido a partir dos itens. A ficha física continua sendo usada no consumo local exatamente como hoje — o sistema é um apoio consultável no caixa, não uma substituição. O caixa localiza o pedido por número ou nome e dá baixa manualmente após o pagamento, que continua acontecendo fora do sistema (PDV existente ou maquininha manual).

## F. Atores e Responsabilidades

- **Atendente**: registra pedidos, adiciona itens a pedidos abertos, registra cancelamentos/alterações.
- **Produção (por estação)**: visualiza fila de itens da própria estação, avança status de cada item.
- **Expedição/Retirada**: identifica pedidos prontos, registra dados de quem retira quando aplicável, marca como entregue. *(A abrangência exata desta etapa para consumo local está em A DEFINIR — seção AH.)*
- **Caixa**: consulta pedidos pendentes de pagamento por número/nome, confere itens e valor (inclusive conferindo com a ficha física no consumo local), dá baixa após o pagamento.
- **Administração**: mantém o cadastro de produtos, tamanhos, adicionais e estações.

## G. Conceito de Pedido

Um pedido é uma entidade **aberta** durante o atendimento — não um documento fechado no momento da criação. Ele existe desde o primeiro item registrado, pode receber novos itens a qualquer momento (mesmo depois que itens anteriores já avançaram na produção), e só se torna imutável quando cancelado por inteiro ou finalizado. Cada pedido tem número único, nome do cliente, canal de origem (`BALCAO`/`WHATSAPP`), tipo de consumo (`LOCAL`/`VIAGEM`), horário de retirada desejado (opcional), status operacional (derivado — seção M), status de pagamento (independente — seção O), e sua lista de itens.

## H. Conceito de Item

Cada item pertence a exatamente um pedido, referencia um produto do cadastro, tem sua própria forma de venda herdada do produto (unidade/tamanho/peso), quantidade ou peso informado, tamanho selecionado quando aplicável, adicionais, observações, estação de destino (herdada do produto), status próprio (`PENDENTE`/`EM_PREPARO`/`PRONTO`/`CANCELADO`), valor calculado, e o **horário em que foi incluído no pedido** (importante porque itens de um mesmo pedido podem ser adicionados em momentos diferentes, conforme seu exemplo do Pedido #154).

## I. Produtos e Formas de Venda

Cada produto do cadastro define sua forma de venda — **nunca inferida pela categoria**:

| Forma | Funcionamento |
|---|---|
| **Unidade** | Quantidade inteira × preço unitário cadastrado. |
| **Tamanho/variação** | O produto tem variações configuráveis (cadastradas manualmente, sem presumir quais existem), cada uma com preço próprio. |
| **Peso** | Peso informado manualmente pelo funcionário × preço por kg cadastrado. |

## J. Produtos Vendidos por Peso

O sistema não controla nem se integra à balança — apenas recebe o peso informado manualmente. **Decisão técnica sobre precisão** (respondendo diretamente ao seu pedido na seção 5): o peso é armazenado internamente **em gramas, como número inteiro** (evita os problemas clássicos de arredondamento de ponto flutuante que ocorreriam armazenando quilos como decimal). O valor do item é calculado como:

```
valor = round(peso_em_gramas × preço_por_kg / 1000, 2 casas decimais)
```

O campo de entrada na tela de atendimento pode exibir gramas ou quilos com decimais (conforme o hábito do funcionário — **A DEFINIR** qual é mais natural para a padaria), mas o armazenamento e o cálculo internos sempre usam gramas inteiras.

## K. Adicionais e Observações

**Adicionais** são um conceito de dados próprio (não apenas texto livre): um item pode ter zero ou mais adicionais associados, cada um potencialmente com seu próprio preço (a existir preço para adicionais — **A DEFINIR**, não confirmado). **Observações** continuam sendo texto livre, sem estrutura, exatamente como na ficha de papel hoje (ex.: "sem cebola", "bem quente").

## L. Ficha Física e sua Relação com o Sistema

A ficha física de papel **não é eliminada nem tratada como solução temporária** para consumo local. Ela continua sendo o controle físico que o cliente carrega e leva ao caixa. O sistema é um registro digital paralelo — permite que a produção veja os itens organizados por estação, e permite que o caixa localize o pedido correspondente por número ou nome para conferir com a ficha e dar baixa. As duas fontes coexistem por design, não por limitação temporária.

## M. Ciclo de Vida do Pedido

O status do pedido **não é armazenado como uma máquina de estados com transições próprias** — ele é **calculado (função pura) a partir do conjunto de itens ativos** (todos exceto os cancelados) toda vez que algo muda. Isso resolve naturalmente o problema de um pedido já pronto receber um novo item: o status é recalculado, não "avançado" manualmente.

Regra de derivação, com exatamente 4 casos, sem sobreposição:

| Condição sobre os itens ativos do pedido | Status do pedido |
|---|---|
| Não existe nenhum item ativo (todos cancelados) | `CANCELADO` |
| Todos os itens ativos estão `PENDENTE` | `RECEBIDO` |
| Todos os itens ativos estão `PRONTO` | `PRONTO` |
| Qualquer outra combinação (mistura de pendente/em preparo/pronto) | `PARCIALMENTE_PRONTO` |

Além desses, dois estados **não são derivados dos itens**, e sim definidos por uma ação explícita de expedição/atendimento: `AGUARDANDO_RETIRADA` e `ENTREGUE`. Um pedido cancelado por inteiro (ação explícita do atendente, diferente de "todos os itens ficaram cancelados um a um") também é `CANCELADO`, registrando motivo/horário/responsável.

## N. Ciclo de Vida do Item

```
PENDENTE → EM_PREPARO → PRONTO
PENDENTE → CANCELADO
EM_PREPARO → CANCELADO
```

Sem estado "assumido" obrigatório no MVP. Sem bloqueio de concorrência entre funcionários no MVP.

## O. Status de Pagamento

Campo independente do status operacional: `PENDENTE` | `PAGO`. Nenhum status operacional (incluindo `ENTREGUE`) implica automaticamente pagamento — essencial para o consumo local, onde o pedido pode estar totalmente consumido e só ser pago minutos depois no caixa.

## P. Fluxo de Consumo Local

1. Atendente registra o pedido (nome, primeiro(s) item(ns)) → sistema gera número único.
2. Ficha física é preenchida e acompanha o cliente, como hoje.
3. Cada novo item pedido pelo cliente ao longo do atendimento é adicionado ao **mesmo pedido** no sistema (nunca cria um novo pedido), com seu próprio horário de inclusão.
4. Itens que exigem produção são roteados automaticamente à estação; produção atualiza status.
5. O status do pedido é recalculado a cada mudança (conforme seção M).
6. Ao final, o cliente leva a ficha física ao caixa; o caixa localiza o pedido (número ou nome), confere itens/valor com a ficha, e dá baixa após o pagamento.

## Q. Fluxo de Viagem

1. Atendente registra o pedido digitalmente (número + nome).
2. Itens seguem para produção normalmente.
3. Não há ficha física acompanhando o cliente da mesma forma que no consumo local.
4. Quando pronto, segue para retirada/entrega conforme o processo já existente da padaria (folha com valor entregue ao cliente).
5. Pagamento é controlado separadamente, como sempre.

## R. Fluxo de WhatsApp

Atendente registra manualmente o pedido com origem `WHATSAPP`; se o cliente solicitou horário de retirada, esse horário é armazenado (apenas como informação exibida — não altera automaticamente a ordem da fila de produção no MVP, ver seção D da auditoria). Nenhuma integração de API, nenhuma mensagem automática, nenhuma confirmação automática ao cliente.

## S. Fluxo de Retirada/Entrega

Espaço no pedido para registrar dados de quem vai retirar quando aplicável (pessoa indicada, ou dados do Uber Flash — nome do motorista, placa, cor do veículo, código, conforme disponível). Nenhum fluxo de autenticação complexo. **A DEFINIR**: quais desses dados são realmente exigidos como validação antes de liberar o pedido (seção AH).

## T. Fluxo de Alteração e Cancelamento

- Cancelamento de **um item específico**: o item recebe status `CANCELADO`, sai do cálculo de status do pedido (seção M), e um registro de histórico guarda o quê, quando e quem cancelou.
- Cancelamento do **pedido inteiro**: ação explícita e distinta de "todos os itens cancelados um a um" — também gera registro de histórico (motivo, horário, responsável).
- Alteração de item ainda `PENDENTE`: livre.
- Alteração de item já `EM_PREPARO`: o sistema deve sinalizar a mudança para a estação responsável (mecanismo exato — **A DEFINIR**, não é bloqueador, pode ser resolvido de forma simples como uma marcação visual no item).
- Alteração de item já `PRONTO`: **A DEFINIR** — depende de decisão operacional da padaria sobre o que fazer com um item já fisicamente pronto.
- Nenhum nível de permissão ou motivo obrigatório é presumido — qualquer atendente pode registrar essas ações no MVP, salvo indicação contrária futura.

## U. Fluxo de Falta de Produto

Sem controle de estoque no MVP. O cadastro de produto permite, no máximo, marcar um item como temporariamente indisponível (visível na tela de atendimento) — isso não é um módulo de estoque, apenas uma flag simples.

## V. Tela de Atendimento

Deve permitir, com poucos cliques: buscar produto; escolher forma de venda já definida no cadastro (campo de peso quando aplicável); escolher tamanho/adicionais quando existirem; nome do cliente; canal; tipo de consumo; horário de retirada quando vier do WhatsApp; adicionar novos itens a um pedido já aberto; editar/cancelar itens ainda pendentes.

## W. Tela KDS/Produção

Fila apenas dos itens da estação correspondente. Cada item mostra produto, quantidade/peso, observações, horário de inclusão no pedido. Ação simples para avançar `PENDENTE → EM_PREPARO → PRONTO`. Sem mecanismo de "assumir" item no MVP.

## X. Tela de Expedição/Retirada

Lista de pedidos prontos (e, quando aplicável, `AGUARDANDO_RETIRADA`), com os dados de quem vai retirar. Ação para marcar como `ENTREGUE`. **A DEFINIR**: se esta tela se aplica também ao consumo local ou só a viagem/WhatsApp (seção AH).

## Y. Tela de Caixa

Lista de pedidos com pagamento `PENDENTE`, pesquisável por número ou por nome. Ao abrir um pedido: itens, valores, total, e — quando for consumo local — um lembrete visual para conferir com a ficha física. Botão único **"DAR BAIXA"**, que muda o status de pagamento para `PAGO`. Nada além disso.

## Z. Administração

Cadastro de produtos (nome, forma de venda, preço/preço por kg/tamanhos e preços, estação padrão, disponibilidade), cadastro de tamanhos/variações, cadastro de adicionais, cadastro de estações, consulta de histórico. **A DEFINIR**: nível de detalhe de relatórios (não confirmado que seja necessário no MVP).

## AA. Regras de Negócio

1. Todo pedido tem número único **e** nome do cliente, sempre coexistindo.
2. Um pedido é uma entidade aberta: novos itens são adicionados ao mesmo pedido, nunca criam um novo.
3. Ficha física não é eliminada para consumo local no MVP.
4. Forma de venda é propriedade do produto, nunca inferida por categoria.
5. Status do pedido é sempre derivado (função pura) dos status dos itens ativos — nunca definido manualmente.
6. Status de pagamento é independente do status operacional.
7. Peso é armazenado em gramas (inteiro); valor calculado com arredondamento de 2 casas decimais.
8. Roteamento de item para estação é automático, a partir do cadastro do produto.
9. Cancelamento (de item ou de pedido) nunca apaga dado, sempre gera histórico.
10. Sem estoque formal; no máximo, produto pode ser marcado indisponível.
11. Caixa nunca se torna um PDV — sua única ação é consultar e dar baixa.
12. Sem mecanismo de bloqueio/concorrência entre funcionários no MVP.
13. Sem priorização algorítmica de pedidos agendados no MVP — fila por ordem de criação, dentro de cada estação.
14. Nenhum nível de permissão ou motivo obrigatório presumido para cancelamento/alteração.

## AB. Modelo Conceitual de Dados

- **Pedido** 1—N **Item do Pedido**: um pedido agrega vários itens, incluídos em momentos diferentes (cada item com seu próprio timestamp de inclusão). A adição posterior de itens é suportada nativamente por essa relação — não exige nenhuma modelagem especial além de permitir inserir novos itens num pedido existente.
- **Item do Pedido** N—1 **Produto**: cada item referencia um produto do cadastro, do qual herda forma de venda e estação padrão.
- **Item do Pedido** N—1 **Variação/Tamanho** (opcional): presente apenas quando o produto referenciado tem forma de venda `TAMANHO`.
- **Item do Pedido** N—N **Adicional** (opcional): um item pode ter zero ou mais adicionais.
- **Produto** N—1 **Estação**: cada produto tem uma estação padrão configurada no cadastro.
- **Pedido** 1—N **Registro de Histórico**: cada alteração ou cancelamento (de item ou do pedido) gera uma entrada própria (o quê, quando, quem, estado anterior, estado posterior) — não sobrescreve dados anteriores.
- **Pedido** 1—1 **Registro de Pagamento** (ou campo direto no pedido — decisão de implementação em aberto, não afeta o comportamento): guarda o status de pagamento e o momento da baixa, independente do ciclo de vida operacional.
- **Cancelamento de um item específico** não afeta os demais itens do mesmo pedido — apenas é excluído do cálculo de status do pedido (seção M).
- **Produtos por peso**: o item guarda o peso em gramas e o preço por kg vigente no momento do registro (não uma referência "viva" ao preço atual do produto, para preservar o valor histórico do pedido mesmo que o preço mude depois — mesma lógica vale para preços de unidade/tamanho).

## AC. Requisitos Funcionais

1. O atendente deve conseguir criar um pedido informando nome do cliente e ao menos um item, recebendo um número único gerado pelo sistema.
2. O atendente deve conseguir adicionar um novo item a um pedido existente sem criar um novo pedido.
3. O sistema deve calcular automaticamente o valor de um item vendido por peso a partir do peso informado e do preço por kg cadastrado.
4. O sistema deve rotear automaticamente cada item à estação configurada no cadastro do produto correspondente.
5. A produção deve conseguir visualizar, por estação, apenas os itens pendentes ou em preparo daquela estação.
6. A produção deve conseguir avançar o status de um item entre `PENDENTE`, `EM_PREPARO` e `PRONTO`.
7. O sistema deve recalcular o status geral do pedido sempre que o status de qualquer item mudar ou um item for adicionado/cancelado, segundo a regra da seção M.
8. O caixa deve conseguir localizar um pedido pesquisando por número ou por nome do cliente.
9. O caixa deve conseguir visualizar os itens e o valor total de um pedido antes de dar baixa.
10. O caixa deve conseguir marcar um pedido como pago ("dar baixa"), alterando apenas o status de pagamento, sem afetar o status operacional.
11. O sistema deve permitir cancelar um item específico sem afetar os demais itens do mesmo pedido.
12. O sistema deve permitir cancelar um pedido inteiro, registrando motivo, horário e responsável.
13. Toda alteração ou cancelamento deve gerar um registro de histórico consultável, sem apagar o dado anterior.
14. O sistema deve permitir marcar um produto como indisponível, refletindo isso na tela de atendimento.

## AD. Requisitos Não Funcionais

- Atualização das telas (produção, expedição, caixa) sem necessidade de recarregar manualmente.
- Legibilidade adequada da tela de produção a partir de uma distância razoável do balcão de produção.
- Registro de um pedido em poucos passos, mesmo com fila de clientes esperando.
- Produtos, tamanhos, adicionais e estações configuráveis via cadastro, sem alteração de código.
- Persistência de histórico de pedidos, alterações e cancelamentos.

## AE. Atualização em Tempo Real

Mudanças de status de item, adição de novos itens a um pedido e baixa de pagamento devem refletir nas telas relevantes (produção da estação afetada, expedição, caixa) sem exigir atualização manual da página.

## AF. MVP

- Cadastro de produtos (com forma de venda, estação padrão, tamanhos/adicionais quando existirem).
- Registro de pedido com número + nome, incluindo adição posterior de itens.
- Roteamento automático de itens por estação.
- Tela de produção por estação com fluxo `PENDENTE → EM_PREPARO → PRONTO`.
- Cálculo automático do status geral do pedido (função derivada dos itens).
- Cálculo automático de valor para itens por peso (com armazenamento em gramas).
- Tela de caixa simples: consulta por número/nome + dar baixa.
- Status de pagamento independente do status operacional.
- Registro de alteração/cancelamento com histórico.
- Atualização em tempo real entre as telas.

## AG. Funcionalidades Futuras

- Mecanismo de "assumir item" / bloqueio de concorrência entre funcionários da mesma estação.
- Alerta visual de pedido atrasado, com tempo de tolerância a ser definido pela padaria.
- Priorização automática de pedidos agendados (antecipação na fila conforme horário de retirada).
- Relatórios administrativos avançados.
- Controle de estoque formal.
- Integração com a API do WhatsApp.
- Integração com PDV/maquininha.

## AH. Pontos A DEFINIR

1. Estações reais de produção da padaria (a estrutura é configurável, mas o cadastro inicial precisa de nomes reais).
2. Catálogo real de produtos, formas de venda, tamanhos/preços e estação de cada um.
3. Se o status `AGUARDANDO_RETIRADA`/a tela de expedição se aplicam também ao consumo local, ou só a pedidos de viagem/WhatsApp.
4. Se existe algum preço associado aos adicionais, ou se eles são sempre gratuitos/informativos.
5. Qual unidade é mais natural para o funcionário digitar o peso na tela de atendimento (gramas ou quilos com decimais) — o armazenamento interno já está definido (gramas inteiras), isso é só sobre a interface.
6. Política para alteração de um item já `PRONTO` (o produto físico já foi preparado).
7. Quais dados de identificação são de fato exigidos para liberar um pedido a um terceiro ou a um motorista de Uber Flash.
8. Nível de detalhe desejado para relatórios administrativos (se algum for necessário no MVP).

## AI. Riscos e Decisões Arquiteturais

- **Status do pedido como função derivada, não como máquina de estados armazenada**: essa foi a decisão-chave para resolver o problema de itens adicionados depois de o pedido já estar avançado — evita a necessidade de transições especiais de "regressão" de status.
- **Coexistência da ficha física com o registro digital**: reduz risco de ruptura operacional, mas mantém duas fontes de informação para o consumo local — mitigado pelo hábito de o caixa conferir ambas ao fechar a conta, como já ocorre hoje.
- **Ausência de bloqueio de concorrência**: simplifica o MVP, mas depende de que, na prática, dois funcionários raramente peguem o mesmo item ao mesmo tempo (não confirmado como problema real — só a v2 presumia isso). Se se mostrar necessário depois de observar o uso real, entra como melhoria futura.
- **Peso armazenado em gramas inteiras**: decisão técnica (não depende de confirmação da padaria) que evita erros de arredondamento cumulativos que ocorreriam armazenando quilos como número decimal.
- **Preço "congelado" no item no momento do registro**: garante que o valor de um pedido não mude retroativamente se o preço do produto for atualizado depois no cadastro.

## AJ. Critérios de Aceitação do MVP

**CA-01 — Criar pedido**
Dado que um atendente está registrando um pedido,
quando informar o nome do cliente e adicionar ao menos um item,
então o sistema deve gerar um número único para o pedido.

**CA-02 — Adicionar item a pedido aberto**
Dado um pedido já existente e ainda não cancelado,
quando o atendente adicionar um novo item,
então o item deve ser vinculado ao mesmo pedido, com seu próprio horário de inclusão, sem criar um pedido novo.

**CA-03 — Item por unidade**
Dado um produto cadastrado com forma de venda `UNIDADE` e preço definido,
quando o atendente informar uma quantidade,
então o valor do item deve ser quantidade × preço unitário.

**CA-04 — Item por tamanho**
Dado um produto cadastrado com forma de venda `TAMANHO` e variações com preços próprios,
quando o atendente selecionar uma variação,
então o valor do item deve ser o preço cadastrado para aquela variação.

**CA-05 — Item por peso**
Dado um produto cadastrado com forma de venda `PESO` e preço por kg definido,
quando o atendente informar o peso do item,
então o sistema deve armazenar o peso em gramas e calcular o valor como peso em gramas × preço por kg ÷ 1000, arredondado para 2 casas decimais.

**CA-06 — Roteamento automático**
Dado um produto cadastrado com uma estação padrão,
quando um item desse produto for adicionado a um pedido,
então o item deve aparecer automaticamente na fila da estação correspondente.

**CA-07 — Pedido parcialmente pronto**
Dado um pedido com mais de um item ativo,
quando ao menos um item estiver `PRONTO` e ao menos um outro não estiver,
então o status do pedido deve ser `PARCIALMENTE_PRONTO`.

**CA-08 — Pedido pronto**
Dado um pedido com um ou mais itens ativos,
quando todos os itens ativos estiverem `PRONTO`,
então o status do pedido deve ser `PRONTO`.

**CA-09 — Item adicionado a pedido já pronto**
Dado um pedido com status `PRONTO`,
quando um novo item for adicionado a esse pedido,
então o status do pedido deve ser recalculado para `PARCIALMENTE_PRONTO`, refletindo o novo item pendente.

**CA-10 — Consumo local até o caixa**
Dado um pedido de consumo local com itens já registrados no sistema,
quando o cliente levar a ficha física ao caixa,
então o operador do caixa deve conseguir localizar o mesmo pedido pelo número ou pelo nome do cliente.

**CA-11 — Dar baixa em pagamento**
Dado um pedido com status de pagamento `PENDENTE`,
quando o caixa clicar em "DAR BAIXA" após confirmar o pagamento externo,
então o status de pagamento do pedido deve mudar para `PAGO`, sem alterar o status operacional do pedido.

**CA-12 — Pedido entregue mas não pago**
Dado um pedido de consumo local já totalmente consumido,
quando o status operacional chegar a `PRONTO`/`ENTREGUE`,
então o status de pagamento deve continuar `PENDENTE` até que o caixa dê baixa explicitamente.

**CA-13 — Cancelamento de item específico**
Dado um pedido com múltiplos itens ativos,
quando um item específico for cancelado,
então esse item deve ficar com status `CANCELADO`, ser excluído do cálculo de status do pedido, e os demais itens não devem ser afetados.

**CA-14 — Cancelamento de pedido inteiro**
Dado um pedido em andamento,
quando o atendente cancelar o pedido inteiro,
então o sistema deve registrar motivo, horário e responsável, e o pedido deve ficar com status `CANCELADO`.

**CA-15 — Histórico não destrutivo**
Dado qualquer alteração ou cancelamento realizado no sistema,
quando a ação for confirmada,
então o sistema deve manter um registro do estado anterior e do novo estado, sem apagar informação.

---

# DECISÕES FECHADAS PARA O DESENVOLVIMENTO

1. Todo pedido tem número único **e** nome do cliente, sempre coexistindo — o número nunca substitui o nome.
2. O pedido é uma entidade aberta durante o atendimento: novos itens são sempre adicionados ao mesmo pedido, cada um com seu próprio horário de inclusão; nunca se cria um pedido novo para isso.
3. A ficha física de papel não é eliminada nem tratada como temporária para consumo local no MVP — coexiste por design com o registro digital.
4. O status do pedido não é armazenado/gerenciado manualmente: é calculado a partir do conjunto de itens ativos (não cancelados), com exatamente 4 casos possíveis (todos cancelados → `CANCELADO`; todos pendentes → `RECEBIDO`; todos prontos → `PRONTO`; qualquer mistura → `PARCIALMENTE_PRONTO`), recalculado a cada mudança.
5. O status de item segue o fluxo simples `PENDENTE → EM_PREPARO → PRONTO`, com `CANCELADO` disponível a partir de `PENDENTE` ou `EM_PREPARO`. Não há estado "assumido" obrigatório no MVP, nem mecanismo de bloqueio de concorrência.
6. O status de pagamento (`PENDENTE`/`PAGO`) é um campo independente do status operacional; nenhum status operacional implica pagamento automático.
7. A forma de venda (unidade, tamanho ou peso) é uma propriedade configurável do produto, nunca inferida pela categoria.
8. Peso é armazenado internamente em gramas, como número inteiro; o valor do item por peso é `peso_em_gramas × preço_por_kg ÷ 1000`, arredondado para 2 casas decimais.
9. O preço de um item (unidade, tamanho ou peso) é "congelado" no momento do registro do pedido — mudanças futuras no cadastro do produto não alteram pedidos já criados.
10. Estações são livremente configuráveis via cadastro; cada produto tem uma estação padrão, e o roteamento do item para a fila da estação é automático.
11. Nenhum controle de estoque formal existe no MVP; no máximo, um produto pode ser marcado manualmente como indisponível.
12. Cancelamento (de item ou de pedido inteiro) nunca apaga dado — sempre gera um registro de histórico com o quê, quando, quem, estado anterior e novo estado.
13. Nenhum nível de permissão ou motivo obrigatório é presumido para cancelamento/alteração no MVP.
14. A tela de caixa tem exatamente duas funções: consultar pedidos pendentes por número/nome, e dar baixa em pagamento — nenhuma função de PDV, financeiro, fiscal, maquininha, abertura/fechamento de caixa.
15. Não há priorização algorítmica de pedidos agendados no MVP: a fila de cada estação segue ordem de criação; horário de retirada é apenas um dado exibido.
16. Não há alerta de atraso baseado em tempo no MVP — fica para uma fase futura.
17. Nenhuma integração é assumida no MVP (sem PDV, sem maquininha, sem API do WhatsApp).

# QUESTÕES QUE PRECISAM SER RESPONDIDAS ANTES DO DESENVOLVIMENTO

1. **Estações reais** de produção da padaria hoje — necessário para popular o cadastro inicial (a estrutura em si já é configurável, isso é só o conteúdo inicial).
2. **Catálogo real de produtos** com forma de venda, tamanhos/preços por variação e estação de cada um — necessário para o cadastro inicial funcionar.
3. **O status/tela de "aguardando retirada" se aplica também ao consumo local**, ou só a pedidos de viagem/WhatsApp? Isso muda o desenho da tela de expedição.
4. **Existe algum preço associado a adicionais**, ou eles são sempre informativos/gratuitos?
5. **O peso deve ser digitado pelo funcionário em gramas ou em quilos com decimais** na tela de atendimento? (O armazenamento interno já está definido como gramas — isso afeta só a interface.)

Todas as demais dúvidas levantadas na v2 (regra de priorização, tempo de tolerância para atraso, mecanismo de bloqueio de item, nível de relatórios) foram resolvidas movendo a funcionalidade correspondente para "Funcionalidades Futuras" — não bloqueiam o início do desenvolvimento do MVP.

---

*Nenhuma informação sobre a operação real da padaria foi inventada além do que foi
explicitamente fornecido nesta conversa. Nenhum código foi gerado nesta etapa.*
