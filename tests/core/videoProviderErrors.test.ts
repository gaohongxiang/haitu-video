import { describe, expect, it } from "vitest";

import { readableVideoProviderError } from "../../src/core/videoProviderErrors.js";

describe("readableVideoProviderError", () => {
  it("hides raw provider JSON for unknown Seedance API errors", () => {
    const error = readableVideoProviderError(
      'Volcengine Seedance API error 400: {"error":{"code":"ProviderInternalRule","message":"The provider rejected this request with an undocumented rule.","type":"BadRequest"}}'
    );

    expect(error).toBe("视频平台拒绝了这次生成请求。请检查参考图、商品资料和视频模型配置后重试。");
    expect(error).not.toContain("{");
    expect(error).not.toContain("ProviderInternalRule");
  });
});
