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
    expect(refreshSource).toContain("await fetchConsoleSnapshot<");
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

  it("keeps JSON fetch helpers outside the App component file", async () => {
    const source = await readFile(appPath, "utf8");
    const apiClientSource = await readFile(apiClientPath, "utf8");

    expect(source).toContain('from "./consoleApiClient.js"');
    expect(source).not.toContain("async function getJson");
    expect(source).not.toContain("async function readJsonResponse");
    expect(apiClientSource).toContain("export async function fetchConsoleSnapshot");
    expect(apiClientSource).toContain("export async function getJson");
    expect(apiClientSource).toContain("export async function postJsonWithSignal");
    expect(apiClientSource).toContain("export async function readJsonResponse");
    expect(apiClientSource).toContain('getJson<T["productsResponse"]>("/api/products")');
    expect(apiClientSource).toContain('getJson<T["videoJobsResponse"]>("/api/video-jobs")');
  });
});
