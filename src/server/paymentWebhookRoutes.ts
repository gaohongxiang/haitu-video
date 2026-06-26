import type { DatabaseHandle } from "./db/client.js";
import { jsonResponse } from "./consoleHttpService.js";
import {
  constructStripeWebhookEvent,
  handleStripeWebhookEvent,
  stripePaymentConfigFromEnv
} from "./stripePaymentService.js";
import {
  constructInfiniWebhookEvent,
  handleInfiniWebhookEvent,
  infiniPaymentConfigFromEnv
} from "./infiniPaymentService.js";

export async function handlePaymentWebhookRoutes(input: {
  request: Request;
  url: URL;
  databaseHandle: DatabaseHandle;
  now?: () => Date;
}): Promise<Response | undefined> {
  const { request, url, databaseHandle, now } = input;
  if (request.method !== "POST") {
    return undefined;
  }
  if (url.pathname === "/api/payments/stripe/webhook") {
    const config = stripePaymentConfigFromEnv();
    const rawBody = await request.text();
    const event = constructStripeWebhookEvent({
      rawBody,
      signatureHeader: request.headers.get("stripe-signature"),
      webhookSecret: config.webhookSecret,
      now
    });
    return jsonResponse(handleStripeWebhookEvent({
      event,
      handle: databaseHandle,
      now
    }));
  }
  if (url.pathname === "/api/payments/infini/webhook") {
    const config = infiniPaymentConfigFromEnv();
    const rawBody = await request.text();
    const event = constructInfiniWebhookEvent({
      rawBody,
      headers: request.headers,
      webhookSecret: config.webhookSecret,
      now
    });
    return jsonResponse(handleInfiniWebhookEvent({
      event,
      handle: databaseHandle,
      now
    }));
  }
  return undefined;
}
