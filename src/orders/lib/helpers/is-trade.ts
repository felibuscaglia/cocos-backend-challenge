import { OrderSide } from '../../enums';

export const isTrade = (side: OrderSide) =>
  side === OrderSide.BUY || side === OrderSide.SELL;
