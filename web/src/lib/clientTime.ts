import type { Deal } from "./types";

export const honorLapsed = (deal: Deal) =>
  !!deal.paypal.honorEndsAt && Date.now() > new Date(deal.paypal.honorEndsAt).getTime();
