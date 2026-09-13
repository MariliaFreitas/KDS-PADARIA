# KDS da Padaria — Especificação Funcional Consolidada (v2)

> Documento consolidado a partir do "Prompt Mestre — KDS da Padaria" original e da
> versão refinada fornecida na sequência. Nenhuma informação sobre a operação real
> da padaria foi inventada; tudo que não foi informado está marcado como
> **A DEFINIR** na seção X, com uma proposta configurável associada.

---

## A. Visão Geral do Sistema

O KDS é um núcleo central de gerenciamento de pedidos que conecta atendimento,
produção, expedição/retirada e caixa em torno de uma única fonte de verdade: o
pedido. Ele **não** é um PDV, **não** assume controle de estoque, **não**
substitui a ficha física do consumo local no MVP, e **não** exige integração com
WhatsApp ou com os caixas existentes. O objetivo é eliminar comunicação verbal
entre atendimento e produção, repasse manual, perda de informação e falta de
visibilidade da fila — sem impor burocracia nova sobre práticas que hoje já
funcionam como mecanismo de controle (como a ficha física).

---

## B. AS-IS Resumido

- Atendimento por fila no balcão; qualquer atendente disponível registra o
  pedido numa mini-ficha de papel, escrevendo produto, tamanho por extenso,
  quantidade, adicionais e observações — sem opções pré-definidas.
- Produtos podem ser vendidos por unidade, por tamanho, ou por peso (ex.: pão de
  queijo, salgadinhos): a funcionária pesa o produto fisicamente e anota o peso
  na ficha, sem etiqueta adesiva.
- Consumo local: a ficha acompanha o cliente e recebe novos itens ao longo do
  atendimento; no fim, o cliente leva a ficha ao caixa, que confere e calcula o
  valor. A ficha funciona como mecanismo de segurança contra informação
  divergente no caixa.
- Viagem: a ficha fica com a produção; o cliente recebe apenas uma folha com o
  valor final (não necessariamente discriminando produtos) para pagar no caixa.
- WhatsApp: atendimento manual, sem integração; cliente pode pedir horário de
  retirada, a padaria informa conforme sua capacidade.
- Identificação do pedido hoje é pelo nome do cliente, chamado verbalmente pela
  equipe.
- Existe um monitor na produção, mas não é usado de forma funcional.
- Dois caixas: um com PDV integrado à maquininha, outro manual (calculadora +
  digitação direta na maquininha) — ambos desacoplados da produção.
- Retirada por cliente, terceiro indicado, ou Uber Flash (motorista geralmente
  solicitado só após o aviso de pedido pronto), com dados informais como nome,
  placa, cor do veículo.

---

## C. Problemas do AS-IS

- Erros de interpretação por falta de padronização (tamanho por extenso, peso
  anotado à mão).
- Fila cresce sem alternativa quando há um único atendente.
- Ficha física é o único controle do pedido — se perdida, o pedido "some" para
  fins de cobrança.
- Comunicação com a produção depende de papel ou fala, sem rastro nem
  visibilidade de fila.
- Nenhuma priorização visível — risco de pedido esquecido ou fora de ordem.
- Pedidos por WhatsApp inteiramente na memória/anotação do atendente.
- Retirada por terceiros/Uber Flash sem registro formal — risco de entrega
  incorreta.
- Nenhum tratamento formal para alteração, cancelamento ou falta de produto.
- Sem histórico consultável.
- Sem visão de carga por estação — risco de dois funcionários produzirem o
  mesmo item.

---

## D. TO-BE Detalhado

Cada pedido recebe um **número único** e o **nome do cliente**, coexistindo
como identificadores (o número não substitui o nome). No registro, o atendente
escolhe forma de venda (unidade/tamanho/peso) conforme o cadastro do produto —
o sistema não presume isso. Ao salvar, o pedido é **automaticamente
decomposto** por item e roteado à estação configurada para cada produto, sem
decisão manual do atendente.

A ficha física **continua existindo para consumo local no MVP** — o sistema não
a substitui, apenas a complementa com um registro digital (número + nome)
consultável no caixa. Para viagem e WhatsApp, o fluxo já é mais digital, mas a
folha entregue ao cliente continua sendo majoritariamente sobre o valor, não
necessariamente um substituto da ficha.

A produção passa a ver uma fila digital por estação, atualiza o status de cada
item, e o sistema consolida automaticamente o status geral do pedido. O caixa
com computador ganha uma tela mínima para consultar pedidos pendentes de
pagamento por número/nome e dar baixa manualmente após o pagamento físico —
sem se tornar um PDV. A expedição/retirada controla pedidos prontos e os dados
de quem vai retirar.

---

## E. Fluxos Completos

**Consumo local**
1. Atendente registra o pedido (produtos, forma de venda, cliente) → sistema
   gera número + nome.
2. Ficha física acompanha o cliente (mantida, como hoje).
3. Se o cliente pedir mais algo, o item é acrescentado ao mesmo pedido no
   sistema (e à ficha física, conforme uso atual).
4. Itens são roteados automaticamente às estações; produção atualiza status.
5. Ao final, o cliente leva a ficha ao caixa; o caixa localiza o pedido por
   número/nome no sistema, confere itens e valor, e dá baixa após o pagamento.

**Viagem**
1. Atendente registra o pedido (cliente, itens, forma de venda).
2. Itens roteados automaticamente à produção; sem ficha acompanhando o
   cliente.
3. Ao ficar pronto, o cliente recebe o produto e a folha com o valor final.
4. Cliente leva produto + folha ao caixa, que localiza o pedido por
   número/nome e dá baixa após o pagamento.

**WhatsApp**
1. Atendente recebe a mensagem e registra manualmente o pedido no sistema,
   com origem `WHATSAPP` e, quando solicitado, horário de retirada.
2. A partir daí, segue o fluxo de viagem/retirada.

**Retirada por terceiro**
- No momento da retirada, a expedição registra/confirma nome e uma descrição
  de identificação da pessoa indicada pelo cliente, antes de liberar o pedido.

**Uber Flash**
- Dados do motorista (nome, placa, cor do veículo, código), quando disponíveis
  — geralmente informados só depois que a padaria avisa que o pedido está
  pronto e o cliente aciona o motorista.

---

## F. Modelo Conceitual de Pedido

- Número único do pedido
- Nome do cliente
- Canal de origem: `BALCAO` | `WHATSAPP`
- Tipo de consumo: `LOCAL` | `VIAGEM`
- Horário desejado de retirada (opcional)
- Status geral (derivado dos itens — ver seção I)
- Status de pagamento (independente do status operacional — ver seção I)
- Dados de retirada (quando aplicável: pessoa indicada ou dados de Uber Flash)
- Itens do pedido (um ou mais)
- Histórico de alterações e cancelamento (motivo, horário, responsável)
- Timestamps de criação e das transições de status

---

## G. Modelo Conceitual de Item

- Produto de referência (do cadastro)
- Forma de venda: `UNIDADE` | `TAMANHO` | `PESO`
- Quantidade (para unidade/tamanho) **ou** peso informado em gramas (para peso)
- Tamanho/variação selecionada (quando aplicável, conforme cadastro do produto)
- Adicionais
- Observações
- Estação responsável (derivada do cadastro do produto)
- Status próprio (ver seção I)
- Valor calculado (fixo para unidade/tamanho; `peso × preço/kg` para peso)

---

## H. Formas de Venda

| Forma | Como funciona |
|---|---|
| **Unidade** | Quantidade inteira, preço fixo por unidade, definido no cadastro do produto. |
| **Tamanho/variação** | Produto tem variações configuráveis (ex.: pequeno/médio/grande), cada uma com seu próprio preço — não presumido, cadastrado por produto. |
| **Peso** | Produto vendido por kg; o funcionário pesa fisicamente e informa o peso ao sistema; o valor é calculado automaticamente (`peso × preço por kg`). **A DEFINIR**: quem realiza a pesagem e em qual etapa/estação do fluxo isso ocorre. |

O cadastro de cada produto determina qual dessas formas se aplica — o sistema
não deve presumir isso automaticamente por categoria.

---

## I. Estados do Pedido e dos Itens

**Status geral do pedido** (derivado automaticamente dos itens sempre que
possível):

`RECEBIDO → EM_PRODUCAO → PARCIALMENTE_PRONTO → PRONTO → AGUARDANDO_RETIRADA → ENTREGUE`, com `CANCELADO` disponível a partir de qualquer estado anterior a `ENTREGUE`.

**Status de pagamento** — proposta de melhoria sobre a especificação original:
tratar pagamento como um campo **independente** do status operacional
(`PENDENTE` | `PAGO`), já que no consumo local o pedido pode estar `ENTREGUE`
(consumido) e só ser pago minutos depois, quando o cliente leva a ficha ao
caixa. Misturar isso num único status geraria estados como "entregue e pago"
vs. "entregue e não pago" de forma confusa — separar os dois eixos resolve
isso com naturalidade.

**Status de item**: `PENDENTE → EM_PREPARO → PRONTO`, com `CANCELADO`
disponível a partir de `PENDENTE` ou `EM_PREPARO`.

Os estados propostos no documento original são suficientes para o MVP; a única
melhoria justificada é a separação do status de pagamento, pelo motivo acima.

---

## J. Fluxo de Alta Demanda

Cenários de estresse (5/10/20/30 pedidos simultâneos), não o fluxo normal:

- **Concorrência entre funcionários**: ao iniciar o preparo de um item, o
  sistema deve marcá-lo como "assumido" por aquele funcionário/estação,
  impedindo que outro funcionário da mesma estação comece o mesmo item
  simultaneamente.
- **Fila por estação**: cada estação vê só seus itens pendentes, ordenados por
  horário de chegada/prioridade — reduz o efeito de 20-30 pedidos aparecendo
  ao mesmo tempo em uma única lista confusa.
- **Pedidos parcialmente prontos**: sinalizados visualmente para quem
  acompanha o pedido como um todo (ex.: expedição), sem exigir que a produção
  saiba do estado de outras estações.
- **Pedidos atrasados**: sinalização visual quando um pedido ultrapassa um
  tempo esperado sem avançar de status — o valor exato de tolerância é
  **A DEFINIR** (depende da capacidade real da cozinha).
- **Pedidos agendados vs. imediatos**: não devem competir apenas por ordem de
  chegada ao sistema — ver regra de priorização na seção Q.
- **Alterações e cancelamentos**: precisam refletir imediatamente na tela da
  estação afetada, mesmo em pico de pedidos, para não recriar em tela o
  mesmo problema que existe hoje no papel.
- **Falta de produto**: sem dependência de estoque formal no MVP, mas o
  atendente precisa conseguir marcar rapidamente um produto como indisponível
  no momento do atendimento (ver seção Q).

---

## K. Funcionamento das Estações

As estações são **configuráveis**, não fixas no código — os exemplos
(bebidas, tapiocas, lanches, forno, cozinha, montagem) são apenas ilustrativos
e não confirmam a estrutura real da padaria. Cada produto do cadastro é
associado a uma estação padrão; ao registrar o pedido, cada item aparece
automaticamente na fila da estação correspondente, sem decisão manual do
atendente. Um pedido com itens em várias estações continua sendo uma única
entidade central — cada estação só vê o que precisa produzir. **A DEFINIR**:
se produtos vendidos por peso passam por uma estação de pesagem específica ou
se a pesagem ocorre dentro da própria estação de preparo.

---

## L. Tela de Atendimento

Prioridade: poucos cliques, rapidez com fila esperando. Deve permitir: busca
rápida de produto; seleção da forma de venda já definida no cadastro
(unidade/tamanho/peso — com campo de peso quando aplicável); adicionais e
observações; nome do cliente; canal de origem; tipo de consumo (local/viagem);
horário de retirada desejado quando vier do WhatsApp; edição e cancelamento de
itens ainda não iniciados.

## M. Tela de Produção/KDS

Fila apenas dos itens da estação correspondente, ordenada por
prioridade/horário. Cada item exibe produto, quantidade ou peso, observações,
tempo decorrido (com destaque visual quando o pedido está demorando). Ação
simples para "assumir" e avançar o status do item, bloqueando-o para outros
funcionários da mesma estação enquanto estiver em preparo.

## N. Tela de Caixa

Extremamente simples, como pedido explicitamente: lista de pedidos com
pagamento pendente, localizáveis por número ou nome; ao abrir um pedido,
visualização dos itens e do valor total; botão único **"DAR BAIXA"** após o
pagamento ser realizado fisicamente na maquininha/PDV existente. Sem abertura
ou fechamento de caixa, sem controle financeiro, sem emissão fiscal, sem
cadastro de clientes, sem integração com a maquininha, sem relatórios
financeiros, sem estoque.

## O. Tela de Expedição/Retirada

Pedidos com status `PRONTO`/`AGUARDANDO_RETIRADA`, com os dados de quem vai
retirar quando aplicável (cliente, terceiro indicado, ou dados do Uber Flash).
Ação para marcar como `ENTREGUE`.

## P. Administração

Cadastro de produtos (nome, forma de venda, preço ou preço/kg, tamanhos e
respectivos preços quando aplicável, estação padrão), cadastro de estações,
consulta de histórico de pedidos. **A DEFINIR**: nível de detalhe desejado
para relatórios administrativos.

---

## Q. Regras de Negócio

1. Todo pedido tem número único **e** nome do cliente; os dois coexistem, o
   número não substitui o nome no MVP.
2. A ficha física **não é eliminada** para consumo local no MVP — o registro
   digital a complementa, não a substitui.
3. O roteamento de itens para estações é automático, derivado do cadastro do
   produto, nunca uma decisão manual do atendente a cada pedido.
4. O status geral do pedido é derivado automaticamente dos itens.
5. O status de pagamento é independente do status operacional do pedido.
6. Itens vendidos por peso têm o valor calculado automaticamente a partir do
   peso informado manualmente pelo funcionário (`peso × preço/kg`).
7. Alteração de item: se ainda não iniciado, pode ser alterado livremente; se
   já em produção, a estação responsável deve ser notificada da mudança; se já
   pronto, **A DEFINIR** — depende de decisão da padaria sobre o que fazer
   fisicamente com um item já preparado.
8. Cancelamento nunca apaga o pedido/item do histórico — deve registrar
   motivo, horário e responsável. Se o item já estiver em produção, a estação
   deve ser notificada do cancelamento.
9. Falta de produto: sem controle de estoque obrigatório no MVP, mas o
   cadastro deve permitir marcar um produto como indisponível a qualquer
   momento, refletindo isso na tela de atendimento.
10. O caixa com computador nunca deve virar um PDV completo — sua única ação é
    consultar pedidos pendentes e dar baixa após pagamento externo.
11. O KDS não deve assumir integração com PDV, maquininha ou API do WhatsApp
    no MVP.

---

## R. Automações

| # | Problema atual | Solução | Benefício | Risco |
|---|---|---|---|---|
| 1 | Atendente leva pedido até a produção verbalmente/em papel | Envio automático do pedido para a fila da estação correspondente | Elimina deslocamento e erro de transmissão | Depende de tela sempre visível em cada estação |
| 2 | Atendente decide manualmente para qual estação vai cada item | Roteamento automático baseado no cadastro do produto | Reduz erro humano e tempo de triagem | Cadastro incompleto ou errado propaga erro |
| 3 | Cálculo de valor de produtos por peso feito de cabeça/calculadora | Cálculo automático a partir do peso informado (`peso × preço/kg`) | Reduz erro de conta manual | Erro na pesagem física em si não é mitigado pelo sistema |
| 4 | Risco de dois funcionários produzirem o mesmo item | Item "assumido" por um funcionário fica bloqueado para outros na mesma estação | Evita retrabalho e desperdício | Exige que o funcionário lembre de "assumir" o item antes de começar |
| 5 | Pedido pronto exige aviso verbal | Sinalização visual automática de pedidos prontos na expedição | Reduz confusão sobre pedidos prontos | — |
| 6 | Pedido atrasado só é percebido se alguém notar | Alerta visual quando um pedido ultrapassa o tempo esperado | Evita pedido esquecido | Tempo de tolerância não definido (ver seção X) |
| 7 | Caixa e produção desacoplados sem vínculo formal | Consulta de pedidos pendentes de pagamento por número/nome, com baixa manual | Elimina dependência exclusiva da ficha física para cobrança | Nenhum, é um passo manual simples por natureza |
| 8 | Consulta de pedidos antigos praticamente impossível hoje | Histórico pesquisável de pedidos, incluindo cancelamentos com motivo | Permite auditoria e análise futura | — |
| 9 | Telas sem atualização automática exigiriam checagem manual | Atualização em tempo real entre atendimento, produção, expedição e caixa | Mantém todas as áreas sincronizadas sem esforço manual | Exige conexão estável nas telas |

---

## S. Dados Necessários

- **Pedido**: número, nome do cliente, canal, tipo de consumo, horário
  desejado de retirada, status geral, status de pagamento, dados de retirada,
  timestamps, histórico de alterações/cancelamento.
- **Item do pedido**: produto, forma de venda, quantidade ou peso, tamanho
  selecionado, adicionais, observações, estação, status, valor calculado.
- **Produto (cadastro)**: nome, forma de venda, preço (unidade), preço por
  tamanho (quando aplicável), preço por kg (quando aplicável), estação padrão,
  disponibilidade.
- **Estação (cadastro)**: nome, configurável livremente.
- **Usuário/funcionário**: identificação de quem assume itens, cancela
  pedidos ou dá baixa em pagamentos (necessário para o histórico de
  responsabilidade citado nas regras de cancelamento).
- **Registro de alteração/cancelamento**: pedido/item relacionado, motivo,
  horário, responsável.

---

## T. Requisitos Funcionais

1. Registrar pedido com número único e nome do cliente.
2. Registrar itens com forma de venda configurável (unidade/tamanho/peso).
3. Rotear itens automaticamente para a estação cadastrada do produto.
4. Exibir fila de produção filtrada por estação.
5. Permitir que um funcionário assuma um item, bloqueando-o para outros.
6. Atualizar o status do item e consolidar automaticamente o status do
   pedido.
7. Calcular automaticamente o valor de itens vendidos por peso.
8. Exibir tela de expedição com pedidos prontos e dados de retirada.
9. Exibir tela de caixa simples com pedidos pendentes de pagamento e ação de
   dar baixa.
10. Registrar alterações e cancelamentos com motivo, horário e responsável,
    sem apagar histórico.
11. Permitir marcar um produto como indisponível a qualquer momento.
12. Manter histórico de pedidos pesquisável.
13. Atualizar todas as telas em tempo real conforme o pedido muda de estado.

## U. Requisitos Não Funcionais

- Atualização em tempo real entre todas as telas (sem necessidade de recarregar
  manualmente).
- Legibilidade a distância nas telas de produção/expedição.
- Poucos cliques para registrar um pedido, mesmo com fila de clientes
  esperando.
- Estações, produtos e formas de venda configuráveis sem alteração de código.
- Desempenho estável em cenários de alta demanda (20-30 pedidos simultâneos).
- Persistência de histórico (pedidos, alterações, cancelamentos) para consulta
  futura.

---

## V. MVP

- Cadastro de produtos (com forma de venda e estação), estações e usuários
  básicos.
- Registro de pedido pelo atendente (balcão e repasse manual de WhatsApp),
  com número + nome do cliente.
- Roteamento automático de itens por estação.
- Telas de produção por estação com fila, status e bloqueio de item assumido.
- Consolidação automática do status geral do pedido.
- Cálculo automático de valor para itens vendidos por peso.
- Tela de expedição/retirada com dados de quem retira.
- Tela de caixa simples: consulta por número/nome + dar baixa.
- Registro de cancelamento e alteração com histórico (motivo/responsável).
- Atualização em tempo real entre todas as telas.

## W. Funcionalidades Futuras

**Importante depois (v2)**
- Alerta visual de pedido atrasado, com tempo de tolerância configurável.
- Priorização automática por horário de retirada agendado.
- Histórico de pedidos com filtros (data, cliente, status, estação).
- Marcação de produto indisponível refletida automaticamente em tempo real
  no atendimento.

**Avançado**
- Integração com a API do WhatsApp.
- Integração com PDV/maquininha.
- Controle de estoque formal.
- Relatórios avançados de produtividade por estação.

---

## X. Pontos A DEFINIR

1. Estações reais de produção da padaria (os exemplos dados são apenas
   ilustrativos).
2. Catálogo completo de produtos, suas formas de venda, tamanhos/preços e
   estações associadas.
3. Quem realiza a pesagem de produtos vendidos por peso e em qual etapa do
   fluxo isso ocorre.
4. Regra exata de priorização entre pedidos imediatos e agendados quando
   competem pela mesma janela de produção (depende de conhecer a capacidade
   real da cozinha) — proposta para o MVP: tratar pedidos imediatos por ordem
   de chegada dentro de cada estação, e reservar um horário-alvo para pedidos
   agendados, sem necessariamente antecipá-los na fila até estarem próximos
   do horário combinado. **A confirmar com a padaria.**
5. Tempo de tolerância antes de um pedido ser sinalizado como atrasado.
6. Política para alteração de item já pronto (o item físico já foi
   produzido).
7. Política detalhada de cancelamento: quem tem permissão, em quais estados
   ainda é permitido.
8. Se a ficha física deve, no futuro, ser impressa pelo próprio sistema ou
   continuar sendo manual mesmo com o registro digital em paralelo.
9. Nível de detalhe desejado para relatórios administrativos.
10. Se pedidos por WhatsApp precisam de alguma confirmação automática para o
    cliente, mesmo sem integração de API.

---

## Y. Riscos e Decisões Arquiteturais

- **Separação entre status operacional e status de pagamento**: decisão
  arquitetural central desta versão. Sem essa separação, o fluxo real do
  consumo local (pedido entregue/consumido, mas pago só minutos depois no
  caixa) forçaria estados híbridos confusos. Tratá-los como dois eixos
  independentes resolve isso de forma simples.
- **Dependência de conectividade**: todo o modelo de tempo real (produção,
  expedição, caixa) depende de as telas estarem sempre conectadas à rede
  local — uma queda de conexão em pico de demanda tem impacto maior do que no
  processo em papel atual.
- **Bloqueio de item ao ser assumido**: necessário para evitar duplicidade de
  produção, mas exige disciplina dos funcionários em "assumir" o item antes
  de começar — não é um mecanismo automático de detecção física do que está
  sendo feito.
- **Coexistência da ficha física com o registro digital**: reduz risco de
  ruptura operacional no MVP, mas cria duas fontes de informação para o
  consumo local. Mitigação: o sistema deve ser tratado como camada de apoio e
  histórico, não substituindo a ficha como controle imediato do que foi
  consumido — o caixa confere ambos ao fechar a conta.
- **Cálculo automático de itens por peso** elimina erro de conta, mas não
  elimina erro de pesagem física em si — a confiabilidade do valor final
  ainda depende da entrada manual do peso pelo funcionário.

---

*Documento gerado a partir do "Prompt Mestre — KDS da Padaria" original e de sua
versão refinada. Nenhuma informação sobre a operação real da padaria foi
inferida além do que está explicitamente descrito. Nenhum código foi gerado
nesta etapa, conforme solicitado.*
