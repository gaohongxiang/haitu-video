import { createRoot } from "react-dom/client";

import { AdminApp } from "./AdminApp.js";
import { App } from "./App.js";
import "./styles.css";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(window.location.pathname === "/admin" ? <AdminApp /> : <App />);
}
