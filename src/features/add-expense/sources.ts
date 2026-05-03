import { SEED_IDS } from "@/lib/db";
import type { CashSource } from "@/lib/db/types";

/**
 * Hard-coded source ↔ account_id and source ↔ user_id maps. When the
 * Accounts CRUD lands (Phase 7), this becomes a runtime lookup against
 * the `accounts` table.
 */

export const SOURCE_TO_ACCOUNT: Record<CashSource, string> = {
  FRAN_PERSONAL: SEED_IDS.accounts.franPersonal,
  SAM_PERSONAL: SEED_IDS.accounts.samPersonal,
  JOINT: SEED_IDS.accounts.joint,
};

export const SOURCE_TO_USER: Record<CashSource, string | null> = {
  FRAN_PERSONAL: SEED_IDS.users.fran,
  SAM_PERSONAL: SEED_IDS.users.sam,
  JOINT: null,
};

export function accountIdToCashSource(accountId: string): CashSource {
  if (accountId === SEED_IDS.accounts.franPersonal) return "FRAN_PERSONAL";
  if (accountId === SEED_IDS.accounts.samPersonal) return "SAM_PERSONAL";
  if (accountId === SEED_IDS.accounts.joint) return "JOINT";
  throw new Error(`Unknown source account: ${accountId}`);
}
