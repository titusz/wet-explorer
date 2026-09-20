/** Mount the static application shell using self-hosted design assets. */
import "./styles/fonts.css";
import "./styles/design.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/stream.css";
import "./styles/reader.css";
import "./styles/navigation.css";
import "./styles/finishing.css";
import "./styles/iscc.css";
import "./ui/app.ts";
import { routeChanged, startController } from "./state/controller.ts";
import { store } from "./state/store.ts";

if (store.state.prefs.theme !== "system")
  document.documentElement.dataset.theme = store.state.prefs.theme;
addEventListener("pagehide", () => startController().save());
addEventListener("hashchange", routeChanged);
routeChanged();
