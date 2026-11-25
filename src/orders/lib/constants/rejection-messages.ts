export const REJECTION_MESSAGES = {
  NO_MARKET_DATA: 'El instrumento no tiene datos de mercado',
  AMOUNT_TOO_LOW: 'El monto no alcanza para comprar o vender una acción',
  INSUFFICIENT_FUNDS: 'El efectivo disponible no alcanza para la orden',
  INSUFFICIENT_SHARES: 'Las acciones disponibles no alcanzan para la orden',
} as const;

export type RejectionCode = keyof typeof REJECTION_MESSAGES;
