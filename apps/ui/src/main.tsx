import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installDiagnostics } from "./app/diagnostics";
import { App } from "./app/App";
import "./theme/global.css";

installDiagnostics();

const root = document.getElementById("root");
if (!root) throw new Error("JAITRA root element is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
