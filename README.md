# KDS da Padaria

Sistema de gerenciamento de pedidos e produção para uma padaria. Especificação
completa em [`docs/ESPECIFICACAO-PADARIA-V3.md`](./docs/ESPECIFICACAO-PADARIA-V3.md).

## Status da implementação

- [x] **Etapa 1 — Inicialização do projeto** (backend + frontend + docker-compose)
- [ ] Etapa 2 — Banco de dados
- [ ] Etapa 3 — Autenticação
- [ ] Etapa 4 — Cadastro de estações
- [ ] Etapa 5 — Cadastro de produtos
- [ ] Etapa 6 — Cadastro de variações
- [ ] Etapa 7 — Cadastro de adicionais
- [ ] Etapa 8 — Criação de pedidos
- [ ] Etapa 9 — Adição de itens
- [ ] Etapa 10 — Cálculo de preços
- [ ] Etapa 11 — Roteamento para estações
- [ ] Etapa 12 — KDS (produção)
- [ ] Etapa 13 — Caixa
- [ ] Etapa 14 — Retirada/entrega
- [ ] Etapa 15 — Histórico
- [ ] Etapa 16 — Tempo real
- [ ] Etapa 17 — Testes de integração ponta a ponta
- [ ] Etapa 18 — Documentação final
- [ ] Etapa 19 — Docker de produção

## Como rodar a Etapa 1

Pré-requisitos: Node.js 20+.

```bash
# Backend
cd backend
npm install
cp .env.example .env
npm run dev          # http://localhost:3333/health deve responder {"status":"ok",...}

# Em outro terminal — Frontend
cd frontend
npm install
cp .env.example .env
npm run dev           # http://localhost:5173
```

Abra `http://localhost:5173` — a página deve mostrar "Backend: conectado ✓".
Se mostrar "não foi possível conectar", confirme que o backend está rodando na
porta 3333 e que o `.env` do frontend aponta para a URL certa.

### Testes do backend

```bash
cd backend
npm install
npm test
```

Deve passar 1 teste (`GET /health`).

### PostgreSQL (preparado para a Etapa 2, ainda não usado)

```bash
docker compose up -d
```

## Estrutura

```
kds-padaria/
├── docs/                        # especificação funcional
├── docker-compose.yml           # PostgreSQL (usado a partir da Etapa 2)
├── backend/                     # Node + Express + TypeScript
│   └── src/
│       ├── server.ts             # bootstrap
│       ├── app.ts                # Express app (só /health por enquanto)
│       ├── config/env.ts
│       └── __tests__/
└── frontend/                    # React + TypeScript + Vite + Tailwind
    └── src/
        ├── main.tsx
        └── App.tsx                # placeholder de conexão com o backend
```
