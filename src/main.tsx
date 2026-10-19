import { Toasty } from "@cloudflare/kumo/components/toast";
import { TooltipProvider } from "@cloudflare/kumo/components/tooltip";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { toasts } from "./lib/store";

createRoot(document.getElementById("root")!).render(
  <Toasty toastManager={toasts}>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </Toasty>,
);
