import { createRoot } from "react-dom/client";

import { AdminApp } from "./AdminApp.js";
import { App } from "./App.js";
import { initClientI18n } from "../i18n/client.js";
import "./styles.css";

const root = document.getElementById("root");

if (root) {
  initClientI18n();
  createRoot(root).render(window.location.pathname === "/admin" ? <AdminApp /> : <App />);
}
