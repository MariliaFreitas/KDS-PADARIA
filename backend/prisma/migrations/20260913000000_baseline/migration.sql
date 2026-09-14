-- Baseline: representa integralmente o schema imediatamente anterior à
-- Etapa 13 (Etapas 1 a 12). Esta migration existe porque o projeto não
-- versionava migrations até agora — schema.prisma era aplicado direto no
-- banco. Um banco que já roda essa versão do schema deve ser marcado como
-- já tendo essa migration aplicada (ver README), nunca tê-la executada de
-- verdade; um banco novo, sem nenhuma tabela, roda este arquivo normalmente
-- como o primeiro passo do histórico.
--
-- BEGIN/COMMIT explícitos: não depende do runner de migrations envolver o
-- arquivo numa transação por conta própria. Se qualquer operação abaixo
-- falhar no meio, o ROLLBACK implícito desfaz tudo — nenhuma tabela fica
-- criada pela metade.
BEGIN;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ATENDENTE', 'PRODUCAO', 'CAIXA', 'ADMIN');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('UNIT', 'VARIATION', 'WEIGHT');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('BALCAO', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ConsumptionType" AS ENUM ('LOCAL', 'VIAGEM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDENTE', 'PAGO');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDENTE', 'EM_PREPARO', 'PRONTO', 'CANCELADO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "saleType" "SaleType" NOT NULL,
    "unitPriceCents" INTEGER,
    "pricePerKgCents" INTEGER,
    "requiresProduction" BOOLEAN NOT NULL DEFAULT false,
    "stationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,

    CONSTRAINT "product_variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additionals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "additionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "customerName" TEXT NOT NULL,
    "channel" "OrderChannel" NOT NULL,
    "consumptionType" "ConsumptionType" NOT NULL,
    "pickupTime" TIMESTAMP(3),
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDENTE',
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledByUserId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "saleType" "SaleType" NOT NULL,
    "basePriceCentsSnapshot" INTEGER NOT NULL,
    "requiresProductionSnapshot" BOOLEAN NOT NULL,
    "quantity" INTEGER,
    "weightGrams" INTEGER,
    "variationId" TEXT,
    "variationNameSnapshot" TEXT,
    "stationIdSnapshot" TEXT,
    "stationNameSnapshot" TEXT,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "totalCents" INTEGER NOT NULL,
    "observation" TEXT,
    "includedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_additionals" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "additionalId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "priceCentsSnapshot" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_item_additionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "action" TEXT NOT NULL,
    "previousState" TEXT,
    "newState" TEXT,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_information" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "pickupPersonName" TEXT,
    "pickupPersonDetail" TEXT,
    "driverName" TEXT,
    "plate" TEXT,
    "vehicleColor" TEXT,
    "code" TEXT,

    CONSTRAINT "pickup_information_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "stations_name_key" ON "stations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_information_orderId_key" ON "pickup_information"("orderId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "product_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_stationIdSnapshot_fkey" FOREIGN KEY ("stationIdSnapshot") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_additionals" ADD CONSTRAINT "order_item_additionals_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_additionals" ADD CONSTRAINT "order_item_additionals_additionalId_fkey" FOREIGN KEY ("additionalId") REFERENCES "additionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_information" ADD CONSTRAINT "pickup_information_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
