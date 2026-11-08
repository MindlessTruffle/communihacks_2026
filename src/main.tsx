import { createRoot } from "react-dom/client";
import "@fontsource/lilita-one/400.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import "./polish.css";
import App from "./App.tsx";
import { startDeviceWatch, lockBrowserChrome, registerServiceWorker, startGamepadBridge } from "./platform/device.ts";

startDeviceWatch();
lockBrowserChrome();
startGamepadBridge();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);

// Debug handle for automated testing / handoff agents. Dev builds only (prod must not expose the store).
if (import.meta.env.DEV) import("./game/store.ts").then((m) => { (window as unknown as { __rc: unknown }).__rc = m.useGame; });
