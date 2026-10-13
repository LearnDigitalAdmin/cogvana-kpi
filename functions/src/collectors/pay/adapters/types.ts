import { PayReader } from "../reader";
import { PaymentFact, ChargeType } from "../facts";
import { PlatformId } from "../../../core/types";

export interface TimeWindow {
  startMs: number;
  endMs: number;
}

/**
 * One adapter per charge type: knows which database and collection holds the
 * attempts, how to map status and amounts, and the company's revenue formula.
 * Adding a charge type = adding one adapter file and registering it in index.ts.
 */
export interface PayAdapter {
  id: ChargeType;
  platform: PlatformId;
  load(reader: PayReader, window: TimeWindow): Promise<PaymentFact[]>;
}
