import { exec, selectAll, selectScalar } from "../client";
import type { OwnerType, SettlementLedgerEntry } from "../types";
import { newId, nowIso } from "./_helpers";
import { enqueueChange } from "@/lib/sync/queue";

interface CreateLedgerInput
  extends Omit<SettlementLedgerEntry, "id" | "created_at" | "updated_at"> {
  id?: string;
}

export const settlementsRepo = {
  list(): SettlementLedgerEntry[] {
    return selectAll<SettlementLedgerEntry>(
      "SELECT * FROM settlement_ledger ORDER BY date DESC, created_at DESC",
    );
  },

  forSourceTransaction(transactionId: string): SettlementLedgerEntry[] {
    return selectAll<SettlementLedgerEntry>(
      "SELECT * FROM settlement_ledger WHERE source_transaction_id = ?",
      [transactionId],
    );
  },

  create(input: CreateLedgerInput): SettlementLedgerEntry {
    const now = nowIso();
    const e: SettlementLedgerEntry = {
      ...input,
      id: input.id ?? newId(),
      created_at: now,
      updated_at: now,
    };
    exec(
      `INSERT INTO settlement_ledger (id, date, source_transaction_id, from_party,
        to_party, amount, reason, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.date,
        e.source_transaction_id,
        e.from_party,
        e.to_party,
        e.amount,
        e.reason,
        e.notes,
        e.created_at,
        e.updated_at,
      ],
    );
    enqueueChange("settlement", e.id, "CREATE");
    return e;
  },

  /**
   * Net balance "from owes to" between two parties. Positive means
   * `from` currently owes `to`; negative means `to` owes `from`.
   *
   * Net = sum(from→to) − sum(to→from)
   */
  netBalance(from: OwnerType, to: OwnerType): number {
    const out = selectScalar(
      "SELECT COALESCE(SUM(amount), 0) FROM settlement_ledger WHERE from_party = ? AND to_party = ?",
      [from, to],
    );
    const back = selectScalar(
      "SELECT COALESCE(SUM(amount), 0) FROM settlement_ledger WHERE from_party = ? AND to_party = ?",
      [to, from],
    );
    return out - back;
  },
};
