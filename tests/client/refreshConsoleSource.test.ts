import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const apiClientPath = "src/client/consoleApiClient.ts";

describe("console refresh source", () => {
  it("keeps manual refreshes silent so API management does not flicker", async () => {
    const source = await readFile(appPath, "utf8");
    const refreshSource = source.slice(source.indexOf("async function refreshConsole"), source.indexOf("function applySettings"));
    const bootSource = source.slice(source.indexOf("async function bootConsole"), source.indexOf("async function login"));
    const authEntrySource = source.slice(source.indexOf("async function enterConsoleAfterAuth"), source.indexOf("function changeAuthFlowMode"));

    expect(refreshSource).toContain("showLoading?: boolean");
    expect(refreshSource).toContain("const showLoading = options.showLoading === true && !polling;");
    expect(refreshSource).toContain("if (showLoading) {");
    expect(refreshSource).toContain("await fetchConsoleSnapshotPrimary<");
    expect(refreshSource).toContain("void refreshConsoleSecondarySnapshot");
    expect(refreshSource).not.toContain("Promise.all([");
    expect(refreshSource).not.toContain("if (!polling) {\n      setIsLoading(true);");
    expect(refreshSource).not.toContain("if (!polling) {\n        setIsLoading(false);");
    expect(bootSource).toContain("await refreshConsole({ applySettings: true, showLoading: true });");
    expect(authEntrySource).toContain("await refreshConsole({ applySettings: true, showLoading: true });");
    expect(source).toContain("onRefresh={() => void refreshConsole()}");
  });

  it("waits for the first console payload before rendering API management data", async () => {
    const source = await readFile(appPath, "utf8");
    const refreshSource = source.slice(source.indexOf("async function refreshConsole"), source.indexOf("function applySettings"));
    const renderSource = source.slice(source.indexOf("function renderActiveSection"), source.indexOf("if (authSession.authEnabled"));
    const logoutSource = source.slice(source.indexOf("async function logout"), source.indexOf("async function enterConsoleAfterAuth"));

    expect(source).toContain("const [consoleReady, setConsoleReady] = useState(false);");
    expect(refreshSource).toContain("setConsoleReady(true);");
    expect(logoutSource).toContain("setConsoleReady(false);");
    expect(renderSource).toContain("if (!consoleReady) {");
    expect(renderSource).toContain("<ConsoleSectionLoadingState");
    expect(renderSource).toContain('case "settings":');
  });

  it("does not leave the console locked on the loading screen after an initial refresh error", async () => {
    const source = await readFile(appPath, "utf8");
    const refreshSource = source.slice(source.indexOf("async function refreshConsole"), source.indexOf("function applySettings"));

    expect(refreshSource).toContain("setConsoleReady(true);");
    expect(refreshSource).toContain("showError(error);");
    expect(refreshSource).toContain("setConsoleLoadError(message);");
    expect(refreshSource).toContain('message !== "Authentication required"');
    expect(source).toContain("function ConsoleSectionErrorState");
    expect(source).toContain("consoleLoadError");
  });

  it("loads creative first-screen data before background dashboard and storage data", async () => {
    const source = await readFile(appPath, "utf8");
    const refreshSource = source.slice(source.indexOf("async function refreshConsole"), source.indexOf("async function refreshConsoleSecondarySnapshot"));
    const secondarySource = source.slice(source.indexOf("async function refreshConsoleSecondarySnapshot"), source.indexOf("function applySettings"));
    const renderSource = source.slice(source.indexOf("function renderActiveSection"), source.indexOf("if (authSession.authEnabled"));

    expect(source).toContain("fetchConsoleSnapshotPrimary");
    expect(source).toContain("fetchConsoleSnapshotPolling");
    expect(source).toContain("fetchConsoleSnapshotSecondary");
    expect(source).not.toContain("fetchConsoleSnapshot,");
    expect(refreshSource).toContain("await fetchConsoleSnapshotPrimary<");
    expect(refreshSource).toContain("await fetchConsoleSnapshotPolling<");
    expect(refreshSource).not.toContain("reportsResponse");
    expect(refreshSource).not.toContain("storageBackupResponse");
    expect(refreshSource).toContain("setConsoleReady(true);");
    expect(refreshSource).toContain("void refreshConsoleSecondarySnapshot");
    expect(secondarySource).toContain("await fetchConsoleSnapshotSecondary<");
    expect(secondarySource).toContain("setReports(reportsResponse.reports);");
    expect(secondarySource).toContain("setLedger(attachQcToLedger(ledgerResponse, qcSummaryResponse));");
    expect(secondarySource).toContain('if (message === "Authentication required")');
    expect(secondarySource).toContain("showError(error);");
    expect(secondarySource.indexOf("showError(error);")).toBeLessThan(secondarySource.indexOf('showConsoleToast(tApp("status.backgroundSyncFailed"'));
    expect(secondarySource).toContain('showConsoleToast(tApp("status.backgroundSyncFailed"');
    expect(renderSource).toContain("<ConsoleSecondarySyncNotice");
  });

  it("keeps JSON fetch helpers outside the App component file", async () => {
    const source = await readFile(appPath, "utf8");
    const apiClientSource = await readFile(apiClientPath, "utf8");

    expect(source).toContain('from "./consoleApiClient.js"');
    expect(source).not.toContain("async function getJson");
    expect(source).not.toContain("async function readJsonResponse");
    expect(apiClientSource).toContain("export async function fetchConsoleSnapshotPrimary");
    expect(apiClientSource).toContain("export async function fetchConsoleSnapshotSecondary");
    expect(apiClientSource).toContain("export async function fetchConsoleSnapshot");
    expect(apiClientSource).toContain("export async function getJson");
    expect(apiClientSource).toContain("export async function postJsonWithSignal");
    expect(apiClientSource).toContain("export async function readJsonResponse");
    expect(apiClientSource).toContain('getJsonWithSignal<T["productsResponse"]>("/api/products", signal)');
    expect(apiClientSource).toContain('getJsonWithSignal<T["videoJobsResponse"]>("/api/video-jobs", signal)');
  });

  it("adds request timeouts to console snapshot fetches so a hung endpoint cannot freeze the page", async () => {
    const apiClientSource = await readFile(apiClientPath, "utf8");

    expect(apiClientSource).toContain("const consoleSnapshotRequestTimeoutMs");
    expect(apiClientSource).toContain("AbortSignal.timeout(consoleSnapshotRequestTimeoutMs)");
    expect(apiClientSource).toContain("控制台初始化接口失败 ${path}");
    expect(apiClientSource).toContain("error instanceof ConsoleApiResponseError && error.status === 401");
    expect(apiClientSource).toContain("getJsonWithSignal<T[\"providerConfigResponse\"]>(\"/api/provider-config\", signal)");
    expect(apiClientSource).toContain("getJsonWithSignal<T[\"modelServicePreferenceResponse\"]>(\"/api/model-service-preference\", signal)");
    expect(apiClientSource).toContain("export const consolePrimarySnapshotPaths");
    expect(apiClientSource).toContain("export const consoleSecondarySnapshotPaths");
    expect(apiClientSource).not.toContain("/api/model-bundles");
  });
});
