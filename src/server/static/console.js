const state = {
  products: [],
  reports: [],
  ledger: undefined,
  settings: undefined,
  filters: {
    productSku: "all",
    provider: "all",
    status: "all",
    finalOnly: false
  },
  lastPreflight: undefined,
  preflightSignature: undefined
};

const els = {
  product: document.querySelector("#product"),
  provider: document.querySelector("#provider"),
  duration: document.querySelector("#duration"),
  template: document.querySelector("#template"),
  cta: document.querySelector("#cta"),
  reuseManifest: document.querySelector("#reuse-manifest"),
  preflight: document.querySelector("#preflight"),
  form: document.querySelector("#make-form"),
  status: document.querySelector("#status"),
  products: document.querySelector("#products"),
  productFactsPreview: document.querySelector("#product-facts-preview"),
  reports: document.querySelector("#reports"),
  ledger: document.querySelector("#ledger"),
  productGroups: document.querySelector("#product-groups"),
  productCount: document.querySelector("#product-count"),
  productGroupCount: document.querySelector("#product-group-count"),
  reportCount: document.querySelector("#report-count"),
  modePill: document.querySelector("#mode-pill"),
  balancePill: document.querySelector("#balance-pill"),
  refresh: document.querySelector("#refresh"),
  preflightState: document.querySelector("#preflight-state"),
  preflightCost: document.querySelector("#preflight-cost"),
  preflightAssets: document.querySelector("#preflight-assets"),
  preflightScript: document.querySelector("#preflight-script"),
  preflightPrompt: document.querySelector("#preflight-prompt"),
  paidSafety: document.querySelector("#paid-safety"),
  settingsForm: document.querySelector("#settings-form"),
  settingsProvider: document.querySelector("#settings-provider"),
  settingsDuration: document.querySelector("#settings-duration"),
  settingsTemplate: document.querySelector("#settings-template"),
  settingsCta: document.querySelector("#settings-cta"),
  settingsForbidden: document.querySelector("#settings-forbidden"),
  settingsRules: document.querySelector("#settings-rules"),
  settingsState: document.querySelector("#settings-state"),
  applySettings: document.querySelector("#apply-settings"),
  filterProduct: document.querySelector("#filter-product"),
  filterProvider: document.querySelector("#filter-provider"),
  filterStatus: document.querySelector("#filter-status"),
  filterFinalOnly: document.querySelector("#filter-final-only")
};

for (const input of [els.product, els.provider, els.duration, els.template, els.cta]) {
  input.addEventListener("change", markPreflightStale);
}
els.cta.addEventListener("input", markPreflightStale);
els.provider.addEventListener("change", updateMode);
els.refresh.addEventListener("click", refresh);
els.preflight.addEventListener("click", async () => {
  await runPreflight();
});
els.applySettings.addEventListener("click", () => {
  applySettingsToTask();
});
els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runPipeline();
});
els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});
for (const input of [els.filterProduct, els.filterProvider, els.filterStatus, els.filterFinalOnly]) {
  input.addEventListener("change", () => {
    updateFilters();
    renderReports();
  });
}

refresh().catch(showError);

async function refresh() {
  const [products, reports, ledger, settings] = await Promise.all([
    getJson("/api/products"),
    getJson("/api/reports"),
    getJson("/api/job-ledger"),
    getJson("/api/settings")
  ]);
  state.products = products.products;
  state.reports = reports.reports;
  state.ledger = ledger;
  state.settings = settings.settings;
  renderLedger();
  renderProducts();
  renderSettings();
  renderProductGroups();
  renderJobFilterOptions();
  renderReports();
  updateMode();
}

async function runPipeline() {
  const selected = state.products.find((product) => product.path === els.product.value);
  if (!selected) {
    showError(new Error("请选择商品"));
    return;
  }
  const paid = isPaidProvider(els.provider.value);
  if (paid && (!state.lastPreflight || state.preflightSignature !== currentPreflightSignature())) {
    showError(new Error("请先生成预检，确认商品资料和参考图可用于真实模型调用。"));
    highlightPaidSafety();
    return;
  }
  const outDirName = `${selected.sku}-${Date.now()}`;
  els.status.textContent = "运行中...";
  const response = await postJson("/api/make-video", {
    productPath: selected.path,
    outDirName,
    provider: els.provider.value,
    duration: Number(els.duration.value),
    template: els.template.value,
    cta: els.cta.value,
    confirmPaid: paid,
    reuseManifest: els.reuseManifest.value.trim() || undefined
  });
  els.status.textContent = formatReport(response.report);
  await refresh();
}

function renderProducts() {
  els.product.innerHTML = state.products
    .map((product) => `<option value="${escapeHtml(product.path)}">${escapeHtml(product.sku)} / ${escapeHtml(product.title_ja)}</option>`)
    .join("");
  els.productCount.textContent = String(state.products.length);
  els.products.innerHTML =
    state.products
      .map(
        (product) => `
          <article class="item">
            <strong>${escapeHtml(product.title_ja)}</strong>
            <div class="meta">${escapeHtml(product.sku)}</div>
            <div class="meta">${escapeHtml(product.path)}</div>
            <button
              class="ghost compact inline-action"
              type="button"
              data-view-product="${escapeAttribute(product.sku)}"
            >查看事实</button>
          </article>
        `
      )
      .join("") || `<div class="meta">没有商品 JSON</div>`;

  els.products.querySelectorAll("[data-view-product]").forEach((button) => {
    button.addEventListener("click", async () => {
      await showProductFacts(button.dataset.viewProduct || "");
    });
  });
}

function renderLedger() {
  const summary = state.ledger?.summary;
  if (!summary) {
    els.ledger.innerHTML = "";
    return;
  }
  els.balancePill.textContent = `¥${Number(summary.estimatedCostCny).toFixed(2)}`;
  els.ledger.innerHTML = [
    ["商品", formatNumber(state.products.length), "可创作商品"],
    ["视频任务", formatNumber(summary.totalJobs), `${formatNumber(summary.completedJobs)} 完成`],
    ["付费任务", formatNumber(summary.paidJobs), "真实模型生成"],
    ["今日 Token", formatNumber(summary.totalTokens), `¥${Number(summary.estimatedCostCny).toFixed(2)}`],
    ["最终视频", formatNumber(summary.finalVideos), "可下载视频"],
    ["复用 raw", formatNumber(summary.reusedRawManifests), "省一次生成"]
  ]
    .map(
      ([label, value, subtext]) => `
        <article class="ledger-card">
          <div class="ledger-icon">${escapeHtml(label.slice(0, 1))}</div>
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(subtext)}</small>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSettings() {
  const settings = state.settings;
  if (!settings) {
    return;
  }
  els.settingsProvider.value = visibleProviderValue(settings.defaultProvider);
  els.settingsDuration.value = String(settings.defaultDurationSeconds);
  els.settingsTemplate.value = settings.defaultTemplate;
  els.settingsCta.value = settings.defaultCta;
  els.settingsForbidden.value = settings.forbiddenWords.join("\n");
  els.settingsRules.value = settings.exaggerationRules.join("\n");
  els.settingsState.textContent = "已加载";
  applySettingsToTask();
}

async function saveSettings() {
  try {
    els.settingsState.textContent = "保存中";
    const response = await putJson("/api/settings", {
      defaultProvider: visibleProviderValue(els.settingsProvider.value),
      defaultDurationSeconds: Number(els.settingsDuration.value),
      defaultTemplate: els.settingsTemplate.value,
      defaultCta: els.settingsCta.value,
      forbiddenWords: splitLines(els.settingsForbidden.value),
      exaggerationRules: splitLines(els.settingsRules.value)
    });
    state.settings = response.settings;
    renderSettings();
    els.settingsState.textContent = "已保存";
    els.status.textContent = "API 设置已保存，并已应用到新建任务表单。";
  } catch (error) {
    showError(error);
    els.settingsState.textContent = "保存失败";
  }
}

function applySettingsToTask() {
  const settings = state.settings;
  if (!settings) {
    return;
  }
  els.provider.value = visibleProviderValue(settings.defaultProvider);
  els.duration.value = String(settings.defaultDurationSeconds);
  els.template.value = settings.defaultTemplate;
  els.cta.value = settings.defaultCta;
  state.lastPreflight = undefined;
  state.preflightSignature = undefined;
  els.preflightState.textContent = "未生成";
  els.preflightState.style.color = "var(--accent)";
  updateMode();
}

async function runPreflight() {
  const selected = state.products.find((product) => product.path === els.product.value);
  if (!selected) {
    showError(new Error("请选择商品"));
    return;
  }
  try {
    els.status.textContent = "预检中...";
    const response = await postJson("/api/preflight", {
      productPath: selected.path,
      provider: els.provider.value,
      duration: Number(els.duration.value),
      template: els.template.value,
      cta: els.cta.value
    });
    state.lastPreflight = response.preflight;
    state.preflightSignature = currentPreflightSignature();
    renderPreflight(response.preflight);
    els.status.textContent = "预检完成。请检查成本、参考图、脚本和 prompt 后再决定是否运行。";
  } catch (error) {
    showError(error);
  }
}

function renderProductGroups() {
  const groups = state.ledger?.products ?? [];
  els.productGroupCount.textContent = String(groups.length);
  els.productGroups.innerHTML =
    groups
      .map(
        (group) => `
          <article class="product-group">
            <div class="product-group-head">
              <div>
                <strong>${escapeHtml(group.productSku)}</strong>
                <div class="meta">latest: ${escapeHtml(group.latestJobId || "-")} / preview: ${escapeHtml(group.bestPreviewJobId || "-")}</div>
              </div>
              <div class="group-head-actions">
                <span class="pill mini">${formatNumber(group.jobCount)} versions</span>
              </div>
            </div>
            <div class="group-metrics">
              <span>付费</span><strong>${formatNumber(group.paidJobs)}</strong>
              <span>内部任务</span><strong>${formatNumber(group.mockJobs)}</strong>
              <span>Token</span><strong>${formatNumber(group.totalTokens)}</strong>
              <span>成本</span><strong>¥${Number(group.estimatedCostCny).toFixed(2)}</strong>
              <span>最终视频</span><strong>${formatNumber(group.finalVideos)}</strong>
            </div>
            <div class="version-list">
              ${group.jobs
                .map(
                  (job) => `
                    <div class="version-row">
                      <span>${escapeHtml(job.id)}</span>
                      <span>${escapeHtml(job.provider || "-")}</span>
                      <span>${formatDuration(job.durationSeconds)}</span>
                      <span>${job.hasFinalVideo ? "final" : "raw"}</span>
                      <strong>¥${Number(job.estimatedCostCny).toFixed(2)}</strong>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>
        `
      )
      .join("") || `<div class="meta">还没有商品版本</div>`;
}

function renderReports() {
  const reports = getFilteredReports();
  els.reportCount.textContent = `${reports.length}/${state.reports.length}`;
  els.reports.innerHTML =
    reports
      .map(
        (report) => `
          <article class="report">
            <div class="preview">
              ${
                report.finalVideoUrl
                  ? `<video controls playsinline preload="metadata" src="${escapeAttribute(report.finalVideoUrl)}"></video>`
                  : `<div class="empty-preview">暂无最终视频</div>`
              }
            </div>
            <div class="report-main">
              <div class="report-title">
                <strong>${escapeHtml(report.productSku || "-")}</strong>
                <span class="pill mini">${escapeHtml(report.status || "-")}</span>
              </div>
              <div class="metric-grid">
                <span>Provider</span><strong>${escapeHtml(report.provider || "-")}</strong>
                <span>时长</span><strong>${formatDuration(report.durationSeconds)}</strong>
                <span>Tokens</span><strong>${formatNumber(report.billing?.totalTokens)}</strong>
                <span>估算成本</span><strong>${formatCost(report)}</strong>
                <span>复用 raw</span><strong>${report.reusedRawManifest ? "是" : "否"}</strong>
                <span>Task</span><strong>${escapeHtml(report.taskId || "-")}</strong>
              </div>
              <div class="meta path-line">${escapeHtml(report.path)}</div>
            </div>
            <div class="report-actions">
              <button
                class="ghost"
                type="button"
                data-manifest="${escapeAttribute(report.rawManifestPath || "")}"
                ${report.rawManifestPath ? "" : "disabled"}
              >复用 raw manifest</button>
              <div class="action-row">
                <button
                  class="ghost compact"
                  type="button"
                  data-usage-task="${escapeAttribute(report.taskId || "")}"
                  ${report.taskId ? "" : "disabled"}
                >查官方用量</button>
                <button
                  class="ghost compact danger"
                  type="button"
                  data-cancel-task="${escapeAttribute(report.taskId || "")}"
                  ${report.taskId ? "" : "disabled"}
                >取消 queued</button>
              </div>
              <div class="meta">Raw: ${escapeHtml(report.rawManifestPath || "-")}</div>
              <div class="meta">Final: ${escapeHtml(report.finalOutputPath || "-")}</div>
            </div>
          </article>
        `
      )
      .join("") || `<div class="meta">没有符合筛选条件的报告</div>`;

  els.reports.querySelectorAll("[data-manifest]").forEach((button) => {
    button.addEventListener("click", () => {
      els.reuseManifest.value = button.dataset.manifest || "";
      els.provider.value = "volcengine-seedance";
      updateMode();
    });
  });
  els.reports.querySelectorAll("[data-usage-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      await showProviderUsage(button.dataset.usageTask || "");
    });
  });
  els.reports.querySelectorAll("[data-cancel-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      await cancelProviderTask(button.dataset.cancelTask || "");
    });
  });
}

function renderJobFilterOptions() {
  const productOptions = uniqueOptionValues(state.reports.map((report) => report.productSku));
  const providerOptions = uniqueOptionValues(state.reports.map((report) => report.provider));
  const statusOptions = uniqueOptionValues(state.reports.map((report) => report.status));
  renderSelectOptions(els.filterProduct, "全部商品", productOptions, state.filters.productSku);
  renderSelectOptions(els.filterProvider, "全部 Provider", providerOptions, state.filters.provider);
  renderSelectOptions(els.filterStatus, "全部状态", statusOptions, state.filters.status);
  els.filterFinalOnly.checked = state.filters.finalOnly;
}

function updateFilters() {
  state.filters = {
    productSku: els.filterProduct.value,
    provider: els.filterProvider.value,
    status: els.filterStatus.value,
    finalOnly: els.filterFinalOnly.checked
  };
}

function getFilteredReports() {
  return state.reports.filter((report) => {
    if (state.filters.productSku !== "all" && report.productSku !== state.filters.productSku) {
      return false;
    }
    if (state.filters.provider !== "all" && report.provider !== state.filters.provider) {
      return false;
    }
    if (state.filters.status !== "all" && report.status !== state.filters.status) {
      return false;
    }
    if (state.filters.finalOnly && !report.finalVideoUrl) {
      return false;
    }
    return true;
  });
}

function renderSelectOptions(select, allLabel, values, selectedValue) {
  const nextSelected = selectedValue !== "all" && values.includes(selectedValue) ? selectedValue : "all";
  select.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`)
  ].join("");
  select.value = nextSelected;
  if (selectedValue !== nextSelected) {
    state.filters = {
      ...state.filters,
      [filterKeyForSelect(select)]: nextSelected
    };
  }
}

function filterKeyForSelect(select) {
  if (select === els.filterProduct) {
    return "productSku";
  }
  if (select === els.filterProvider) {
    return "provider";
  }
  return "status";
}

function uniqueOptionValues(values) {
  return Array.from(new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))).sort();
}

function updateMode() {
  const paid = isPaidProvider(els.provider.value);
  els.modePill.textContent = paid ? "真实模型调用" : "内部任务";
  els.modePill.style.color = paid ? "var(--accent-2)" : "var(--accent)";
  els.paidSafety.classList.toggle("active", paid);
}

function formatReport(report) {
  return [
    `状态: ${report.status}`,
    `商品: ${report.productSku}`,
    `Provider: ${report.provider}`,
    `Raw: ${report.raw.outputPath}`,
    `Final: ${report.final?.outputPath || "-"}`,
    `Task: ${report.raw.taskId || "-"}`,
    `Tokens: ${report.billing?.totalTokens || "-"}`,
    `估算成本: ${report.billing?.estimatedCostCny ?? report.totalCost.amount} ${report.billing ? "CNY" : report.totalCost.currency}`,
    `Report: ${report.reportPath}`
  ].join("\n");
}

async function showProviderUsage(taskId) {
  if (!taskId) {
    return;
  }
  try {
    els.status.textContent = `查询官方用量中: ${taskId}`;
    const response = await getJson(`/api/provider-tasks/${encodeURIComponent(taskId)}`);
    els.status.textContent = formatProviderTask(response.task);
  } catch (error) {
    showError(error);
  }
}

async function showProductFacts(sku) {
  if (!sku) {
    return;
  }
  try {
    els.status.textContent = `读取商品事实包: ${sku}`;
    const response = await getJson(`/api/products/${encodeURIComponent(sku)}`);
    els.status.textContent = formatProductFacts(response.product);
    renderProductFactsPreview(response.product);
  } catch (error) {
    showError(error);
  }
}

async function cancelProviderTask(taskId) {
  if (!taskId) {
    return;
  }
  try {
    els.status.textContent = `尝试取消 queued 任务: ${taskId}`;
    const response = await postJson(`/api/provider-tasks/${encodeURIComponent(taskId)}/cancel`, {});
    els.status.textContent = `已取消 queued 任务: ${response.taskId}`;
    await refresh();
  } catch (error) {
    showError(error);
  }
}

function formatProviderTask(task) {
  return [
    "火山官方任务详情",
    `Task: ${task.id}`,
    `状态: ${task.status || "-"}`,
    `模型: ${task.model || "-"}`,
    `时长: ${formatDuration(task.durationSeconds)}`,
    `分辨率: ${task.resolution || "-"}`,
    `比例: ${task.ratio || "-"}`,
    `Tokens: ${formatNumber(task.totalTokens)}`,
    `估算成本: ¥${Number(task.estimatedCostCny || 0).toFixed(2)}`,
    "说明: 查询任务不创建视频；官方列表通常只保留最近 7 天。"
  ].join("\n");
}

function formatPreflight(preflight) {
  return [
    "生成预检",
    `商品: ${preflight.productSku} / ${preflight.title_ja}`,
    `Provider: ${preflight.provider}`,
    `时长: ${preflight.durationSeconds}s / ${preflight.aspectRatio}`,
    `调用类型: ${preflight.paidProvider ? "真实模型" : "内部任务"}`,
    `估算 tokens: ${formatNumber(preflight.estimatedTokens.low)} - ${formatNumber(preflight.estimatedTokens.high)} / 期望 ${formatNumber(preflight.estimatedTokens.expected)}`,
    `预计扣余额: ¥${Number(preflight.walletEstimatedChargeCny?.low ?? preflight.estimatedCostCny.low).toFixed(2)} - ¥${Number(preflight.walletEstimatedChargeCny?.high ?? preflight.estimatedCostCny.high).toFixed(2)} / 期望 ¥${Number(preflight.walletEstimatedChargeCny?.expected ?? preflight.estimatedCostCny.expected).toFixed(2)}`,
    `上游成本: ¥${Number(preflight.upstreamEstimatedCostCny?.expected || 0).toFixed(2)}`,
    `平台服务费: ¥${Number(preflight.serviceFeeCny?.expected || 0).toFixed(2)}`,
    `参考图: ${preflight.assetSummary.previewable}/${preflight.assetSummary.total} 可预览, ${preflight.assetSummary.missing} 缺失, ${preflight.assetSummary.outsideProjectRoot} 项目外`,
    preflight.warnings.length ? `警告: ${preflight.warnings.join(" / ")}` : "警告: 无",
    "",
    "脚本要点:",
    preflight.script.voiceover,
    "",
    "字幕:",
    ...preflight.script.subtitleLines.map((line) => `- ${line}`),
    "",
    "Seedance Prompt:",
    preflight.prompt
  ].join("\n");
}

function renderPreflight(preflight) {
  els.preflightState.textContent = preflight.paidProvider ? "真实模型预检" : "内部任务预检";
  els.preflightState.style.color = preflight.paidProvider ? "var(--accent-2)" : "var(--accent)";
  els.preflightCost.innerHTML = [
    ["预计扣余额", `¥${Number(preflight.walletEstimatedChargeCny?.expected ?? preflight.estimatedCostCny.expected).toFixed(2)}`, `区间 ¥${Number(preflight.walletEstimatedChargeCny?.low ?? preflight.estimatedCostCny.low).toFixed(2)} - ¥${Number(preflight.walletEstimatedChargeCny?.high ?? preflight.estimatedCostCny.high).toFixed(2)}`],
    ["期望 Token", formatNumber(preflight.estimatedTokens.expected), `${formatNumber(preflight.estimatedTokens.low)} - ${formatNumber(preflight.estimatedTokens.high)}`],
    ["上游成本", `¥${Number(preflight.upstreamEstimatedCostCny?.expected || 0).toFixed(2)}`, preflight.apiBillingMode === "platform" ? "按官方价格估算" : "自带 API 自行承担"],
    ["平台服务费", `¥${Number(preflight.serviceFeeCny?.expected || 0).toFixed(2)}`, "后台计费规则"],
    ["时长", `${preflight.durationSeconds}s`, preflight.aspectRatio],
    ["Provider", preflight.provider, preflight.paidProvider ? "真实模型调用" : "内部任务"]
  ]
    .map(
      ([label, value, subtext]) => `
        <div class="preflight-kpi">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(subtext)}</small>
        </div>
      `
    )
    .join("");
  els.preflightAssets.innerHTML = `
    <div class="asset-line ${preflight.warnings.length ? "warn" : "ok"}">
      <strong>参考图 ${formatNumber(preflight.assetSummary.previewable)}/${formatNumber(preflight.assetSummary.total)} 可预览</strong>
      <span>${formatNumber(preflight.assetSummary.missing)} 缺失 · ${formatNumber(preflight.assetSummary.outsideProjectRoot)} 项目外 · ${formatNumber(preflight.assetSummary.remote)} 远程</span>
    </div>
    ${
      preflight.warnings.length
        ? `<ul class="warning-list">${preflight.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
        : `<div class="safe-line">素材状态正常，没有预检警告。</div>`
    }
  `;
  els.preflightScript.innerHTML = `
    <p>${escapeHtml(preflight.script.voiceover)}</p>
    <ul>
      ${preflight.script.subtitleLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
    </ul>
  `;
  els.preflightPrompt.textContent = preflight.prompt;
}

function markPreflightStale() {
  if (!state.lastPreflight) {
    return;
  }
  state.preflightSignature = undefined;
  els.preflightState.textContent = "需重新预检";
  els.preflightState.style.color = "var(--accent-2)";
  els.status.textContent = "表单已变更，请重新生成预检后再运行。";
}

function currentPreflightSignature() {
  return JSON.stringify({
    productPath: els.product.value,
    provider: els.provider.value,
    duration: Number(els.duration.value),
    template: els.template.value,
    cta: els.cta.value
  });
}

function isPaidProvider(provider) {
  return provider !== "mock";
}

function visibleProviderValue(provider) {
  const defaultVisibleProvider = "volcengine-seedance";
  if (provider === defaultVisibleProvider) {
    return defaultVisibleProvider;
  }
  return defaultVisibleProvider;
}

function highlightPaidSafety() {
  els.paidSafety.classList.add("attention");
  window.setTimeout(() => {
    els.paidSafety.classList.remove("attention");
  }, 1800);
}

function formatProductFacts(product) {
  return [
    "商品事实包",
    `SKU: ${product.sku}`,
    `标题: ${product.title_ja}`,
    `分类: ${product.category}`,
    `材质: ${product.materials.join("、")}`,
    `尺寸/重量: ${product.dimensions}`,
    "",
    "已验证卖点:",
    ...product.verified_selling_points.map((item) => `- ${item}`),
    "",
    "使用场景:",
    ...product.usage_scenes.map((item) => `- ${item}`),
    "",
    "禁止/未确认宣称:",
    ...product.forbidden_claims.map((item) => `- ${item}`),
    "",
    "参考图片:",
    ...product.reference_images.map((item) => `- ${item}`),
    "",
    `源文件: ${product.path}`
  ].join("\n");
}

function renderProductFactsPreview(product) {
  const images = product.reference_image_statuses ?? [];
  els.productFactsPreview.innerHTML = `
    <div class="facts-preview-head">
      <strong>${escapeHtml(product.sku)}</strong>
      <span class="pill mini">${formatNumber(images.length)} refs</span>
    </div>
    <div class="reference-grid">
      ${
        images
          .map(
            (image, index) => `
              <figure class="reference-tile ${image.previewUrl ? "" : "unavailable"}">
                ${
                  image.previewUrl
                    ? `<img src="${escapeAttribute(image.previewUrl)}" alt="${escapeAttribute(product.sku)} reference ${index + 1}" loading="lazy" />`
                    : `<div class="reference-empty">${escapeHtml(image.status)}</div>`
                }
                <figcaption>
                  <span>${escapeHtml(image.original)}</span>
                  <small>${escapeHtml(image.status)}</small>
                  ${
                    image.status === "outside-project-root"
                      ? `<button class="ghost compact inline-action" type="button" data-import-product-refs="${escapeAttribute(product.sku)}">导入资产</button>`
                      : ""
                  }
                </figcaption>
              </figure>
            `
          )
          .join("") || `<div class="meta">没有参考图片</div>`
      }
    </div>
  `;
  els.productFactsPreview.querySelectorAll("[data-import-product-refs]").forEach((button) => {
    button.addEventListener("click", async () => {
      await importProductAssets(button.dataset.importProductRefs || "");
    });
  });
}

async function importProductAssets(sku) {
  if (!sku) {
    return;
  }
  try {
    els.status.textContent = `导入参考图资产: ${sku}`;
    const response = await postJson(`/api/products/${encodeURIComponent(sku)}/import-assets`, {});
    els.status.textContent = [
      `已导入参考图: ${response.imported.length}`,
      ...response.imported.map((item) => `- ${item.original} -> ${item.reference}`)
    ].join("\n");
    renderProductFactsPreview(response.product);
  } catch (error) {
    showError(error);
  }
}

function formatDuration(value) {
  return value === undefined ? "-" : `${value}s`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatNumber(value) {
  return value === undefined ? "-" : Number(value).toLocaleString("zh-CN");
}

function formatCost(report) {
  if (report.billing?.estimatedCostCny !== undefined) {
    return `¥${Number(report.billing.estimatedCostCny).toFixed(2)}`;
  }
  if (report.totalCost?.amount !== undefined) {
    return `${report.totalCost.amount} ${report.totalCost.currency}`;
  }
  return "-";
}

async function getJson(path) {
  const response = await fetch(path);
  return readJsonResponse(response);
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse(response);
}

async function putJson(path, body) {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

function showError(error) {
  els.status.textContent = error instanceof Error ? error.message : String(error);
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
