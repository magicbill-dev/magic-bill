import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "simplebar/dist/simplebar.css";
import "simplebar";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./theme/theme.css";
import "./theme/components.css";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
