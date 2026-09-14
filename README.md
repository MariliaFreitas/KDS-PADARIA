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
- [ ] Etapa 12 — KDS (produção)
- [ ] Etapa 13 — Caixa
- [ ] Etapa 14 — Retirada/entrega
- [ ] Etapa 15 — Histórico
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

Aplique o schema no banco e crie o usuário administrador:

```bash
npx prisma migrate dev
npm run seed
```

O seed cria apenas o usuário administrador. Nenhum produto, estação, variação
ou adicional é criado — esse cadastro é feito pelas telas de administração.

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
│   │   ├── schema.prisma          # modelo do banco
│   │   ├── seed.ts                # cria apenas o usuário administrador
│   │   └── migrations/            # histórico do banco (versionado)
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
