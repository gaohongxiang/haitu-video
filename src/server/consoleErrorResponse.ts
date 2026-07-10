import { aiInsufficientBalanceMessage } from "./aiBilling.js";
import { jsonResponse } from "./consoleHttpService.js";
import { InsufficientWalletBalanceError } from "./walletStore.js";
import { RequestBodyTooLargeError } from "./consoleHttpService.js";

export function consoleErrorResponse(error: unknown, message: string): Response {
  if (error instanceof RequestBodyTooLargeError) {
    return jsonResponse({ error: message }, 413);
  }
  if (message.includes("outside project root") || message.includes("outside data root")) {
    return jsonResponse({ error: message }, 403);
  }
  if (message.includes("Can cancel only queued tasks")) {
    return jsonResponse({ error: message }, 409);
  }
  if (message.includes("Can retry only failed local video jobs")) {
    return jsonResponse({ error: message }, 409);
  }
  if (message.includes("Can recover only video jobs")) {
    return jsonResponse({ error: "这条任务没有可恢复的成片下载。只有视频已生成、但服务器下载失败的任务才能重新下载成片。" }, 409);
  }
  if (
    message.includes("Unknown model provider target") ||
    message.includes("Provider API key is required") ||
    message.includes("请先在 API 管理配置图片模型 API Key")
  ) {
    return jsonResponse({ error: message }, 422);
  }
  if (
    message.includes("该支付方式") ||
    message.includes("暂不支持该支付方式") ||
    message.includes("余额调整金额") ||
    message.includes("请选择要调整余额") ||
    message.includes("请填写余额调整原因") ||
    message.includes("工作区不存在") ||
    message.includes("调整后余额不能小于冻结金额") ||
    message.includes("无法换算") ||
    message.includes("无法获取 CNY 到")
  ) {
    return jsonResponse({ error: message }, 422);
  }
  if (
    message.includes("Stripe 支付订单请求失败") ||
    message.includes("Infini 支付订单请求失败") ||
    message.includes("创建 Infini 支付订单失败")
  ) {
    return jsonResponse({ error: message }, 502);
  }
  if (
    message.includes("Stripe webhook") ||
    message.includes("Stripe checkout session") ||
    message.includes("Stripe 充值") ||
    message.includes("Infini webhook") ||
    message.includes("Infini 充值")
  ) {
    return jsonResponse({ error: message }, 400);
  }
  if (message.includes("requires confirmPaid")) {
    return jsonResponse({ error: message }, 402);
  }
  if (message.includes("请先配置视频模型")) {
    return jsonResponse({ error: message }, 402);
  }
  if (error instanceof InsufficientWalletBalanceError || message.includes("余额不足")) {
    const errorMessage = message.includes("使用 AI 功能") ? aiInsufficientBalanceMessage : message;
    return jsonResponse({ error: errorMessage }, 402);
  }
  if (message.includes("is disabled. Enable it in template management")) {
    return jsonResponse({ error: message }, 422);
  }
  if (message.includes("付费生成前请先补齐商品资料")) {
    return jsonResponse({ error: message }, 422);
  }
  if (message.includes("Reference image index")) {
    return jsonResponse({ error: message }, 422);
  }
  if (message.includes("Selected final job must belong")) {
    return jsonResponse({ error: message }, 422);
  }
  if (message.includes("Manual review requires") || message.includes("Manual review job must belong")) {
    return jsonResponse({ error: message }, 422);
  }
  if (message.includes("No selected final job") || message.includes("Publish package requires")) {
    return jsonResponse({ error: message }, 422);
  }
  if (message.includes("requires confirm") || message.includes("requires a video path")) {
    return jsonResponse({ error: message }, 422);
  }
  if (message.includes("Product not found")) {
    return jsonResponse({ error: message }, 404);
  }
  return jsonResponse({ error: message }, 500);
}
