import type { ConsoleSettingsStore } from "./consoleSettings.js";
import type { DatabaseHandle } from "./db/client.js";
import { BillingPolicyStore } from "./billingPolicyStore.js";
import { ModelPricingCatalogStore } from "./modelPricingCatalogStore.js";
import { listAdminPaymentMethods, type PaymentMethodView } from "./paymentMethodService.js";

export interface AdminSiteSettingsResponse {
  sections: Array<{
    id: string;
    label: string;
    status: "configured" | "attention" | "planned";
    description: string;
  }>;
  publicPages: Array<{
    id: string;
    label: string;
    status: "configured" | "planned";
  }>;
  seoGeo: {
    status: "configured";
    roadmapPath: string;
    productionCheck: string;
  };
  paymentMethods: PaymentMethodView[];
  billing: {
    policyId: string;
    label: string;
    enabled: boolean;
    rules: Array<{
      usageKind: string;
      serviceFeeCny: number;
      enabled: boolean;
    }>;
  };
  modelPricing: {
    activeVersion: string;
    source: "built_in" | "database";
    entryCount: number;
    publishedAt?: string;
  };
}

export async function getAdminSiteSettings(input: {
  handle: DatabaseHandle;
  settingsStore: ConsoleSettingsStore;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}): Promise<AdminSiteSettingsResponse> {
  const paymentMethods = (await listAdminPaymentMethods({
    settingsStore: input.settingsStore,
    env: input.env
  })).methods;
  const billingSettings = new BillingPolicyStore({
    handle: input.handle,
    now: input.now
  }).getSettings();
  const activeCatalog = new ModelPricingCatalogStore({
    handle: input.handle,
    now: input.now
  }).getActiveCatalog();
  return {
    sections: [
      {
        id: "public-pages",
        label: "公开页",
        status: "configured",
        description: "首页、价格页、登录入口和静态资源状态。"
      },
      {
        id: "seo-geo",
        label: "SEO/GEO",
        status: "configured",
        description: "SEO/GEO 路线图、发布检查和运营入口。"
      },
      {
        id: "payments",
        label: "支付方式",
        status: paymentMethods.some((method) => method.enabled && method.configured) ? "configured" : "attention",
        description: "充值支付渠道启停状态和服务端配置状态。"
      },
      {
        id: "model-services",
        label: "模型服务",
        status: "configured",
        description: "平台模型 API 配置和默认模型策略。"
      },
      {
        id: "billing",
        label: "计费规则",
        status: billingSettings.policy.enabled ? "configured" : "attention",
        description: "Haitu 服务费、钱包流水和人工调账。"
      },
      {
        id: "model-pricing",
        label: "模型价格",
        status: activeCatalog.catalog.length > 0 ? "configured" : "attention",
        description: "官方模型价格目录、草稿和发布版本。"
      }
    ],
    publicPages: [
      {
        id: "home",
        label: "首页",
        status: "configured"
      },
      {
        id: "pricing",
        label: "模型价格页",
        status: "configured"
      },
      {
        id: "auth",
        label: "登录/注册页",
        status: "configured"
      },
      {
        id: "legal",
        label: "法律/退款/联系页",
        status: "planned"
      }
    ],
    seoGeo: {
      status: "configured",
      roadmapPath: "docs/marketing/seo-geo-roadmap.md",
      productionCheck: "npm test -- tests/marketing/checkSeoGeoProduction.test.ts"
    },
    paymentMethods,
    billing: {
      policyId: billingSettings.policy.policyId,
      label: billingSettings.policy.label,
      enabled: billingSettings.policy.enabled,
      rules: billingSettings.rules.map((rule) => ({
        usageKind: rule.usageKind,
        serviceFeeCny: rule.serviceFeeCny,
        enabled: rule.enabled
      }))
    },
    modelPricing: {
      activeVersion: activeCatalog.version,
      source: activeCatalog.source,
      entryCount: activeCatalog.catalog.length,
      publishedAt: activeCatalog.publishedAt
    }
  };
}
