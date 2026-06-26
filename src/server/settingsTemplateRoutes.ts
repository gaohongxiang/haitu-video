import type { FileConsoleSettingsStore } from "./consoleSettings.js";
import { jsonResponse } from "./consoleHttpService.js";
import {
  listUserPaymentMethods
} from "./paymentMethodService.js";
import {
  listVideoTemplates,
  saveVideoTemplates,
  type TemplateManagementRequest
} from "./videoTemplateService.js";

export async function handleSettingsTemplateRoutes(input: {
  request: Request;
  url: URL;
  settingsStore: FileConsoleSettingsStore;
}): Promise<Response | undefined> {
  const { request, url, settingsStore } = input;

  if (request.method === "GET" && url.pathname === "/api/settings") {
    return jsonResponse({
      settings: await settingsStore.read()
    });
  }
  if (request.method === "PUT" && url.pathname === "/api/settings") {
    return jsonResponse({
      settings: await settingsStore.write(await request.json())
    });
  }
  if (request.method === "GET" && url.pathname === "/api/payment-methods") {
    return jsonResponse(await listUserPaymentMethods({ settingsStore }));
  }
  if (request.method === "GET" && url.pathname === "/api/templates") {
    return jsonResponse(await listVideoTemplates(settingsStore));
  }
  if (request.method === "PUT" && url.pathname === "/api/templates") {
    return jsonResponse(await saveVideoTemplates(settingsStore, (await request.json()) as TemplateManagementRequest));
  }
  return undefined;
}
