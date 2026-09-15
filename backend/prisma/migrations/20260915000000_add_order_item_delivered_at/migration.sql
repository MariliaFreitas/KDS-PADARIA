-- OrderItem.deliveredAt (Etapa 14 — Retirada/Entrega): marca a entrega de
-- um item específico. Não cria nenhuma entidade nova — a entrega continua
-- representada pelo próprio Order + OrderItem, só com mais um campo.
--
-- Coluna nullable, sem valor padrão diferente de NULL: todo item já
-- existente fica automaticamente "ainda não entregue", que é o estado
-- correto para eles — nenhum backfill é necessário.
--
-- BEGIN/COMMIT explícitos, no mesmo padrão das duas migrations anteriores:
-- não depende do runner de migrations envolver o arquivo numa transação.
BEGIN;

ALTER TABLE "order_items" ADD COLUMN "deliveredAt" TIMESTAMP(3);

COMMIT;
