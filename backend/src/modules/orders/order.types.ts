import { z } from "zod";

/**
 * Horário de retirada (Etapa 8): opcional/nullable, é apenas informativo no
 * MVP e não cria nenhuma regra de priorização de fila. Quando informado,
 * precisa ser uma data/hora válida — convertida para Date antes de chegar
 * ao service, que só a repassa ao Prisma.
 */
const pickupTimeSchema = z
  .union([z.string().trim().min(1, "Horário de retirada inválido."), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Horário de retirada inválido.",
      });
      return z.NEVER;
    }

    return parsed;
  });

/**
 * Cabeçalho do pedido (Etapa 8). O cliente só pode enviar estes quatro
 * campos — orderNumber, paymentStatus, createdByUserId, createdAt e demais
 * campos de pagamento/cancelamento nunca vêm do corpo da requisição: o Zod
 * descarta silenciosamente qualquer campo extra enviado, e createdByUserId
 * é sempre obtido do usuário autenticado no controller.
 */
export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1, "Nome do cliente é obrigatório."),
  channel: z.enum(["BALCAO", "WHATSAPP"], {
    errorMap: () => ({ message: "Canal deve ser BALCAO ou WHATSAPP." }),
  }),
  consumptionType: z.enum(["LOCAL", "VIAGEM"], {
    errorMap: () => ({ message: "Tipo de consumo deve ser LOCAL ou VIAGEM." }),
  }),
  pickupTime: pickupTimeSchema,
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
