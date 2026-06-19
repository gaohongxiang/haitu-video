import { describe, expect, it } from "vitest";

import { readableVideoProviderError } from "../../src/core/videoProviderErrors.js";

describe("readableVideoProviderError", () => {
  it("summarizes unknown Seedance API errors without showing raw provider JSON", () => {
    const error = readableVideoProviderError(
      'Volcengine Seedance API error 400: {"error":{"code":"ProviderInternalRule","message":"The provider rejected this request with an undocumented rule.","type":"BadRequest"}}'
    );

    expect(error).toBe("视频平台根据内部规则拒绝了这次生成。请检查商品资料、参考图和视频模型配置后重试。");
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

    expect(error).toBe("视频已经生成，但服务器下载成片超时。请稍后重试；如果连续失败，可能是服务器到火山文件服务器的网络不稳定。");
    expect(error).not.toContain("参考图链接");
    expect(error).not.toContain("模型配置");
  });
});
