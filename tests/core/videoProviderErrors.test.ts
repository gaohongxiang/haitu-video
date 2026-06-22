import { describe, expect, it } from "vitest";

import { readableVideoProviderError } from "../../src/core/videoProviderErrors.js";

describe("readableVideoProviderError", () => {
  it("summarizes unknown Seedance API errors without showing raw provider JSON", () => {
    const error = readableVideoProviderError(
      'Volcengine Seedance API error 400: {"error":{"code":"ProviderInternalRule","message":"The provider rejected this request with an undocumented rule.","type":"BadRequest"}}'
    );

    expect(error).toBe("视频平台根据内部规则拒绝了这次生成。优先处理参考图：删除真人、人脸、二维码、联系方式、品牌授权不明或过度暴露的图片；再缩短卖点和分镜，避免夸大功效、绝对化表述和敏感词后重试。");
    expect(error).not.toContain("{");
    expect(error).not.toContain("ProviderInternalRule");
    expect(error).not.toContain("undocumented rule");
  });

  it("uses raw provider details when the stored readable message is too generic", () => {
    const error = readableVideoProviderError({
      message: "视频平台拒绝了这次生成请求。请检查参考图、商品资料和视频模型配置后重试。",
      rawMessage: 'Volcengine Seedance API error 400: {"error":{"code":"InvalidParameter","message":"The prompt is too long.","param":"content","type":"BadRequest"}}',
      providerPhase: "create-task",
      providerModel: "doubao-seedance-2-0-fast-260128"
    });

    expect(error).toBe("提示词太长，视频平台拒绝了这次生成。请缩短商品描述、卖点或分镜内容后重试。");
    expect(error).not.toContain("阶段：");
    expect(error).not.toContain("模型：");
  });

  it("uses raw provider details for older generic message variants", () => {
    const error = readableVideoProviderError({
      message: "视频平台拒绝了这次生成请求。请检查商品资料、参考图和视频模型配置后重试。",
      rawMessage:
        'Volcengine Seedance API error 400: {"error":{"code":"InvalidParameter","message":"The parameter `content[1].image_url` specified in the request is not valid: resource download failed.","param":"content[1].image_url","type":"BadRequest"}}',
      providerPhase: "create-task",
      providerModel: "doubao-seedance-2-0-fast-260128"
    });

    expect(error).toBe("第 1 张参考图现在不能用于生成。请重新上传这张图，或删除后换一张图片再生成。");
    expect(error).not.toContain("请检查商品资料、参考图和视频模型配置");
  });

  it("explains unopened Seedance models with the exact model name", () => {
    const error = readableVideoProviderError({
      message: "视频平台拒绝了这次生成请求。请检查商品资料、参考图和视频模型配置后重试。",
      rawMessage:
        'Volcengine Seedance API error 404: {"error":{"code":"ModelNotOpen","message":"Your account 2129621938 has not activated the model doubao-seedance-2-0-fast-260128. Please activate the model service in the Ark Console. Request id: 0217821148135632d417bd9da6e7dfe27ae15305eaa9a4f8641c3","param":"","type":"Not Found"}}',
      providerPhase: "create-task",
      providerModel: "doubao-seedance-2-0-fast-260128"
    });

    expect(error).toBe("视频模型未开通：当前火山账号还没有开通 doubao-seedance-2-0-fast-260128。请在火山方舟控制台开通该模型，或切换到已开通的视频模型后重试。");
    expect(error).not.toContain("2129621938");
    expect(error).not.toContain("Request id");
  });

  it("surfaces unknown Seedance provider codes and cleaned provider reasons", () => {
    const error = readableVideoProviderError({
      message: "视频平台拒绝了这次生成请求。请检查商品资料、参考图和视频模型配置后重试。",
      rawMessage:
        'Volcengine Seedance API error 400: {"error":{"code":"SomeNewProviderCode","message":"The provider rejected the request because the supplied callback_url is unreachable. Request id: 0217821148135632d417bd9da6e7dfe27ae15305eaa9a4f8641c3","param":"callback_url","type":"BadRequest"}}',
      providerPhase: "create-task",
      providerModel: "doubao-seedance-2-0-fast-260128"
    });

    expect(error).toBe("视频平台返回 SomeNewProviderCode：The provider rejected the request because the supplied callback_url is unreachable。参数：callback_url。");
    expect(error).not.toContain("请检查商品资料、参考图和视频模型配置");
    expect(error).not.toContain("Request id");
    expect(error).not.toContain("{");
  });

  it("translates account billing and balance provider errors", () => {
    const error = readableVideoProviderError(
      'Volcengine Seedance API error 403: {"error":{"code":"AccountOverdue","message":"The account has overdue bills. Please settle the bill before using the service.","param":"account","type":"Forbidden"}}'
    );

    expect(error).toBe("视频平台账号欠费或余额异常，请检查火山/Seedance 账号账单和余额后重试。");
    expect(error).not.toContain("overdue bills");
  });

  it("explains Seedance reference image download failures in user-facing Chinese", () => {
    const error = readableVideoProviderError({
      message: "视频平台拒绝了这次生成请求。请检查参考图、商品资料和视频模型配置后重试。",
      rawMessage:
        'Volcengine Seedance API error 400: {"error":{"code":"InvalidParameter","message":"The parameter `content[1].image_url` specified in the request is not valid: resource download failed. Request id: 021781860845182dae410d06a911c4f7bd0a80e7e433f8a43a404","param":"content","type":"BadRequest"}}',
      providerPhase: "create-task",
      providerModel: "doubao-seedance-2-0-fast-260128",
      referenceImageCount: 9
    });

    expect(error).toBe("第 1 张参考图现在不能用于生成。请重新上传这张图，或删除后换一张图片再生成。");
    expect(error).not.toContain("content[1].image_url");
    expect(error).not.toContain("resource download failed");
    expect(error).not.toContain("Request id");
    expect(error).not.toContain("视频平台访问不到");
    expect(error).not.toContain("图片已解析出来");
    expect(error).not.toContain("阶段：");
    expect(error).not.toContain("模型：");
    expect(error).not.toContain("参考图：9 张");
  });

  it("explains output download timeouts without blaming reference images", () => {
    const error = readableVideoProviderError({
      message: "视频平台请求超时或网络连接失败，请稍后重试；如果连续失败，请检查视频模型配置和参考图链接。",
      rawMessage: "fetch failed",
      causeMessage: "Connect Timeout Error (attempted address: ark-acg-cn-beijing.tos-cn-beijing.volces.com:443, timeout: 10000ms)",
      causeCode: "UND_ERR_CONNECT_TIMEOUT",
      providerPhase: "download-output",
      providerModel: "doubao-seedance-2-0-fast-260128"
    });

    expect(error).toBe("视频已经生成，但服务器下载成片超时。请点击重新下载成片；如果连续失败，可能是服务器到视频文件服务器的网络不稳定。");
    expect(error).not.toContain("参考图链接");
    expect(error).not.toContain("模型配置");
  });
});
