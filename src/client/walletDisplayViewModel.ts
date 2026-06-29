import type { AppLocale } from "../i18n/config.js";
import { appText } from "../i18n/appText.js";

export function walletTransactionDescriptionLabel(description?: string, locale?: AppLocale): string {
  const normalized = description?.trim();
  if (!normalized) {
    return "-";
  }
  if (normalized === "Infini 数字货币充值到账") {
    return appText("wallet.transactionDescriptions.infiniCryptoSettled", locale);
  }
  if (normalized === "数字货币充值到账") {
    return appText("wallet.transactionDescriptions.cryptoSettled", locale);
  }
  if (normalized === "Stripe 充值到账") {
    return appText("wallet.transactionDescriptions.stripeSettled", locale);
  }
  if (normalized === "充值到账") {
    return appText("wallet.transactionDescriptions.settled", locale);
  }
  return normalized;
}
