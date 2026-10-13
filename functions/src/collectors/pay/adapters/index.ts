import { PayAdapter } from "./types";
import { registerSmsAdapter, pmsSmsAdapter } from "./sms";
import { reportChargeAdapter } from "./reports";
import { cyberServiceAdapter } from "./cyber";
import { pmsSubscriptionAdapter } from "./subscription";
import { pmsRentAdapter } from "./rent";
import {
  chamaMemberPaymentAdapter,
  chamaSmsAdapter,
  chamaPlanAdapter,
  chamaReportCreditAdapter,
  chamaReportAlacarteAdapter,
} from "./chama";

/**
 * Every charge type the collector understands. To add one: write its adapter,
 * register it here and add its entries to facts.ts (stream + platform maps).
 *
 * Deliberately NOT included (no company revenue is recorded for them yet):
 *   SHOP_ (shop customer charges) and MOV_ (movie subscriptions).
 */
export const ALL_ADAPTERS: PayAdapter[] = [
  pmsRentAdapter,
  pmsSubscriptionAdapter,
  pmsSmsAdapter,
  registerSmsAdapter,
  cyberServiceAdapter,
  reportChargeAdapter,
  chamaMemberPaymentAdapter,
  chamaSmsAdapter,
  chamaPlanAdapter,
  chamaReportCreditAdapter,
  chamaReportAlacarteAdapter,
];
