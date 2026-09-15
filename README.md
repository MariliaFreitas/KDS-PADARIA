# KDS da Padaria

Sistema de organização de pedidos e produção para padarias. Especificação
funcional completa em [`docs/ESPECIFICACAO-PADARIA-V3.md`](./docs/ESPECIFICACAO-PADARIA-V3.md),
que é a fonte de verdade do produto.

O sistema registra pedidos, encaminha automaticamente os itens que exigem
produção para a estação correta, acompanha o andamento até a conclusão e
permite ao caixa consultar e dar baixa em pagamentos. Não é um PDV, não
controla estoque e não integra com WhatsApp ou maquininha no MVP.

Produtos, estações, variações e adicionais são configuráveis pelo próprio
sistema. Nenhum dado operacional de padaria específica existe no código.

## Status da implementação

- [x] **Etapa 1 — Inicialização do projeto** (backend, frontend, docker-compose)
- [x] **Etapa 2 — Banco de dados** (schema Prisma, seed do usuário administrador)
- [x] **Etapa 3 — Autenticação** (login, JWT, middlewares de autenticação e autorização, tela de login)
- [x] **Etapa 3.5 — Endurecimento** (contrato de erro com código estável, respostas de erro em JSON, validação do segredo, desacoplamento do health check)
- [x] **Etapa 4 — Cadastro de estações** (CRUD de estações restrito a ADMIN, tela `/admin/stations`)
- [x] **Etapa 5 — Cadastro de produtos** (CRUD de produtos restrito a ADMIN, tela `/admin/products`)
- [x] **Etapa 6 — Cadastro de variações** (CRUD de variações de produtos VARIATION, restrito a ADMIN, tela `/admin/products/:productId/variations`)
- [x] **Etapa 7 — Cadastro de adicionais** (CRUD de adicionais globais restrito a ADMIN, tela `/admin/additionals`)
- [x] **Etapa 8 — Criação de pedidos** (cabeçalho do pedido: `POST/GET /api/orders`, restrito a ATENDENTE/ADMIN, tela `/orders/new` e `/orders/:orderId`; itens do pedido entram na Etapa 9)
- [x] **Etapa 9 — Adição de itens** (`POST /api/orders/:orderId/items`, `GET /api/orders/catalog`, tela `/orders/:orderId/items/new`, restrito a ATENDENTE/ADMIN)
- [x] **Etapa 10 — Cálculo de preços** (implementada junto da Etapa 9: `OrderItem` exige `basePriceCentsSnapshot`/`totalCents` já congelados na criação, então preço e item nascem juntos — snapshots de produto/variação/adicionais e total em centavos calculado no servidor)
- [x] **Etapa 11 — Roteamento para estações** (o roteamento de um item para uma estação é sempre derivado do cadastro atual do produto, nunca do cliente: produto sem produção nunca recebe estação no item, mesmo com `stationId` residual no cadastro; produto com produção exige uma estação ativa configurada — sem isso o item não é criado; a estação é congelada em `stationIdSnapshot`/`stationNameSnapshot` no momento da criação do item e nunca é reescrita depois, mesmo que o produto ou a estação mudem; fila/KDS de produção ficam para a Etapa 12)
- [x] **Etapa 12 — Preparo/KDS** (fila de preparo por estação: `GET /api/production/stations`, `GET /api/production/stations/:stationId/items`, `PATCH .../advance`, restrito a PRODUCAO/ADMIN; a fila usa sempre `stationIdSnapshot`/`requiresProductionSnapshot` do item, nunca o cadastro atual do produto; status só avança PENDENTE→EM_PREPARO→PRONTO; tela `/production` para escolher a estação e `/production/stations/:stationId` para o KDS)
- [x] **Etapa 13 — Caixa** (conta aberta é só `paymentStatus=PENDENTE` e não cancelado — nenhuma coluna nova para isso; `GET /api/cashier/orders` lista, busca por número operacional (aceita `27` ou `#27`) ou nome do cliente, e traz o resumo dos itens cobráveis de cada pedido (produto, quantidade/peso, variação e adicionais, sempre excluindo itens CANCELADO); `PATCH /api/cashier/orders/:orderId/confirm-payment` confirma pagamento com total sempre recalculado no servidor a partir dos itens não cancelados, restrito a CAIXA/ADMIN; item novo é rejeitado em pedido já pago (`ORDER_ALREADY_PAID`); número operacional (`serviceNumber`) é um número reutilizável e independente do `orderNumber` técnico — alocado por um pool com constraint de unicidade, nunca por contagem em memória, e só volta a ficar disponível 7h depois do pagamento; tela `/cashier` restrita a CAIXA/ADMIN)
- [x] **Etapa 14 — Retirada/Entrega** (módulo operacional separado do Caixa, que continua exclusivamente financeiro: `GET /api/delivery/orders` lista pedidos ainda não concluídos operacionalmente — não cancelados, `Order.deliveredAt=null`, com pelo menos um item válido sem entrega — com a mesma busca por número operacional/nome do Caixa; `PATCH /api/delivery/orders/:orderId/items/:itemId/deliver` entrega um item, restrito a CAIXA (ADMIN não é concedido automaticamente nesta etapa); item exige `status=PRONTO` quando `requiresProductionSnapshot=true`, mas item sem produção entrega sem nunca passar por PRONTO; pedido VIAGEM só entrega depois de pago, pedido LOCAL entrega mesmo com pagamento pendente; item CANCELADO nunca é entregue nem bloqueia o fechamento do pedido; `Order.deliveredAt` é preenchido sozinho, dentro da mesma operação transacional, quando o último item válido é entregue — nunca por um endpoint que o frontend chama para declarar o pedido inteiro entregue; entrega registrada no `OrderHistory` com `ITEM_DELIVERED`; item WHATSAPP+VIAGEM ainda não pago não entra em preparo — nem aparece na fila do KDS, nem avança via chamada direta a `advance`, só depois de `paymentStatus=PAGO`; tela `/delivery`)
- [x] **Etapa 15 — Histórico**
- [ ] Etapa 16 — Tempo real

## Stack

**Backend:** Node.js, TypeScript, Express, Prisma, PostgreSQL, JWT, bcryptjs, Zod, Vitest
**Frontend:** React, TypeScript, Vite, Tailwind CSS
**Infraestrutura:** Docker, Docker Compose

Identificadores de código em inglês; interface do usuário em português.

## Como rodar

Pré-requisitos: Node.js 20 ou superior, Docker.

### 1. Banco de dados

Na raiz do projeto:

```bash
docker compose up -d
```

Sobe um PostgreSQL 16 na porta 5432. Se der erro dizendo que o Docker não está
rodando, abra o Docker Desktop, espere iniciar e rode de novo.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Abra o `.env` e defina um `JWT_SECRET` real. **A aplicação recusa o valor de
exemplo e não sobe com ele.** Para gerar um valor aleatório:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

O schema é aplicado sempre pelo histórico de migrations em
`prisma/migrations/` — não use `prisma db push` para isso, nem em banco novo.
O histórico tem três migrations: uma baseline (`20260913000000_baseline`,
representando o schema completo de antes da Etapa 13), uma incremental da
Etapa 13 (`20260914000000_add_service_number_and_pool`) e uma incremental da
Etapa 14 (`20260915000000_add_order_item_delivered_at`, só a coluna
`OrderItem.deliveredAt` — sem backfill: item já existente fica
automaticamente "ainda não entregue", que é o estado correto para ele).

**Banco novo, sem nenhuma tabela ainda:** roda o histórico inteiro do zero,
na ordem em que as migrations existem:

```bash
npx prisma migrate deploy
npm run seed
```

**Banco já em uso, de antes de qualquer uma dessas migrations** (schema
aplicado até aqui por `db push` ou qualquer outro meio fora de migrations):
já tem o schema da baseline, então rodar a baseline de novo tentaria recriar
tabelas que já existem. Marque-a como já aplicada, sem executá-la, e deixe o
`migrate deploy` aplicar o que falta (as duas incrementais, em ordem):

```bash
npx prisma migrate resolve --applied 20260913000000_baseline
npx prisma migrate deploy
```

**Banco que já tinha a Etapa 13 aplicada** (baseline + `service_number_slots`
já existentes): não precisa de nenhum `resolve` — falta só a migration desta
etapa, e `migrate deploy` aplica exatamente ela:

```bash
npx prisma migrate deploy
```

A migration da Etapa 13 cria a coluna `serviceNumber` e a tabela
`service_number_slots`, e já dá a cada pedido existente um `serviceNumber`
válido e o slot correspondente na mesma transação — pedido aberto ou
cancelado sem pagamento confirmado não libera o número (`reusableAt = NULL`);
pedido pago libera só em `paidAt + 7h` — sem apagar nem renumerar nada, e sem
depender de nenhum passo manual depois. `orderNumber` nunca é alterado. Não
existe nenhum script separado de backfill: o próprio `migrate deploy` é o
único fluxo, tanto para banco novo quanto para banco existente.

Em ambos os casos, o seed cria apenas o usuário administrador. Nenhum
produto, estação, variação ou adicional é criado — esse cadastro é feito
pelas telas de administração.

Suba o servidor:

```bash
npm run dev
```

`http://localhost:3333/health` deve responder `{"status":"ok","service":"kds-padaria-backend"}`.

### 3. Frontend

Em outro terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Abra `http://localhost:5173`. Você será redirecionado para a tela de login.
Entre com as credenciais definidas no `.env` do backend.

## Testes e verificações

```bash
# Backend — testes, lint e build
cd backend
npm test
npm run lint
npm run build

# Frontend — lint e build
cd frontend
npm run lint
npm run build
```

## Contrato de erro da API

Toda resposta de erro tem o mesmo formato:

```json
{ "error": "mensagem em português", "code": "CODIGO_ESTAVEL" }
```

Erros de validação acrescentam `details` com os problemas por campo.

O cliente deve decidir o fluxo pelo `code`, nunca pela mensagem: o texto é de
interface e pode ser reescrito; o código é contrato. A lista completa está em
[`backend/src/lib/error-codes.ts`](./backend/src/lib/error-codes.ts).

## Decisões de arquitetura

Registradas aqui porque afetam quem for mexer no código:

- **Status do pedido não é uma coluna.** É calculado a partir dos itens ativos
  a cada mudança, com quatro casos sem sobreposição (seção M da especificação).
  Nunca gravado diretamente.
- **Status operacional e status de pagamento são independentes.** Nenhum
  estado operacional implica pagamento automático.
- **Itens guardam snapshots comerciais.** Nome do produto, preço, variação e
  estação são congelados no momento do registro. Alterar o cadastro depois não
  altera pedidos já criados.
- **Cancelar um item é diferente de cancelar o pedido.** As duas ações geram
  registro de histórico e nenhuma apaga dado.
- **`orderNumber` é gerado pelo banco** por autoincrement, nunca contado em
  memória.
- **`serviceNumber` é um número operacional separado do `orderNumber`.**
  Visível ao cliente/caixa/KDS e reutilizável — controlado por um pool
  (`ServiceNumberSlot`) com constraint de unicidade, nunca por `max+1` sem
  proteção. Um número só volta a ficar disponível 7h depois do **pagamento**
  do pedido que o usava — cancelamento sozinho não libera o número, essa
  etapa não define uma política de liberação por cancelamento. `orderNumber`
  continua único e permanente, sem nenhuma relação com esse ciclo de reuso.
- **Conta aberta é só `paymentStatus=PENDENTE` e não cancelado.** Não existe
  nenhuma coluna própria para esse conceito — é sempre essa mesma consulta.
- **Total cobrado no caixa é sempre recalculado no servidor**, somando
  `OrderItem.totalCents` dos itens não cancelados. Nunca aceita um total vindo
  do cliente.
- **Peso é armazenado em gramas inteiras**, evitando erro de arredondamento de
  ponto flutuante.
- **Não há hierarquia entre perfis.** ADMIN não herda acesso automaticamente;
  cada rota declara explicitamente quem pode acessá-la.
- **Cliente Prisma é preguiçoso.** Só é instanciado no primeiro acesso ao
  banco, o que permite testar isoladamente partes que não usam banco. Efeito
  colateral: uma `DATABASE_URL` inválida falha na primeira consulta, não no
  start do processo.

## Estrutura

```
kds-padaria/
├── docs/                          # especificação funcional
├── docker-compose.yml             # PostgreSQL
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                  # modelo do banco
│   │   ├── seed.ts                        # cria apenas o usuário administrador
│   │   └── migrations/                    # histórico do banco (versionado)
│   │       ├── 20260913000000_baseline/                     # schema completo anterior à Etapa 13
│   │       ├── 20260914000000_add_service_number_and_pool/  # delta da Etapa 13 (serviceNumber + backfill)
│   │       └── 20260915000000_add_order_item_delivered_at/  # delta da Etapa 14 (OrderItem.deliveredAt)
│   └── src/
│       ├── server.ts              # bootstrap
│       ├── app.ts                 # montagem do Express
│       ├── config/env.ts          # validação das variáveis de ambiente
│       ├── lib/                   # AppError, códigos de erro, Prisma, helpers
│       ├── middlewares/           # autenticação, autorização, 404, erros
│       └── modules/
│           └── auth/              # types, service, controller, routes
└── frontend/
    └── src/
        ├── services/apiClient.ts
        ├── features/auth/         # contexto, login, rota protegida
        └── pages/
```

### Padrão dos módulos do backend

O módulo `auth` é a referência estrutural para os próximos:

| Arquivo | Responsabilidade | Conhece Express? |
|---|---|---|
| `*.types.ts` | schemas Zod e interfaces | não |
| `*.service.ts` | regra de negócio e acesso a dados; lança `AppError` | **não** |
| `*.controller.ts` | valida entrada, chama o service, responde | sim |
| `*.routes.ts` | monta rotas e aplica middlewares | sim |

O service não conhecer Express é o que permite testá-lo isolado, sem servidor
e sem banco.

**Ao registrar rotas novas em `app.ts`**, coloque-as acima do `notFoundHandler`.
Ele e o `errorHandler` são sempre os dois últimos, nessa ordem.
