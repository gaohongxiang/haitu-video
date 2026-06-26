import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const storePath = "src/server/walletStore.ts";
const ledgerPath = "src/server/walletLedger.ts";
const repositoryPath = "src/server/walletRepository.ts";

describe("wallet ledger source boundaries", () => {
  it("keeps wallet ledger math and row conversion outside the database store", async () => {
    const storeSource = await readFile(storePath, "utf8");

    await expect(access(ledgerPath)).resolves.toBeUndefined();
    await expect(access(repositoryPath)).resolves.toBeUndefined();
    expect(storeSource).toContain('from "./walletLedger.js"');
    expect(storeSource).toContain('from "./walletRepository.js"');
    expect(storeSource).not.toContain("export function centsToCny(");
    expect(storeSource).not.toContain("export function cnyToCents(");
    expect(storeSource).not.toContain("function positiveCents(");
    expect(storeSource).not.toContain("function walletTransactionFromRow(");
    expect(storeSource).not.toContain("function parseMetadata(");
    expect(storeSource).not.toContain("INSERT INTO wallet_transactions");
    expect(storeSource).not.toContain("SELECT *");
  });

  it("centralizes wallet amount conversion, reservation math, and transaction row mapping", async () => {
    const ledgerSource = await readFile(ledgerPath, "utf8");

    expect(ledgerSource).toContain("export function centsToCny(");
    expect(ledgerSource).toContain("export function cnyToCents(");
    expect(ledgerSource).toContain("export function positiveCents(");
    expect(ledgerSource).toContain("export function reservedCentsFromTransactions(");
    expect(ledgerSource).toContain("export function walletTransactionFromRow(");
    expect(ledgerSource).toContain("function parseMetadata(");
  });

  it("centralizes wallet transaction persistence in the repository module", async () => {
    const repositorySource = await readFile(repositoryPath, "utf8");

    expect(repositorySource).toContain("export class WalletRepository");
    expect(repositorySource).toContain("listTransactions(");
    expect(repositorySource).toContain("currentState(");
    expect(repositorySource).toContain("reservedCentsForReservation(");
    expect(repositorySource).toContain("appendTransaction(");
    expect(repositorySource).toContain("INSERT INTO wallet_transactions");
  });
});
