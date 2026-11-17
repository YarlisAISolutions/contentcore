import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
// Tell React that tests drive updates through act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
