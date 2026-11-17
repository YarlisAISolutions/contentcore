import { type ContentStore, createApiStore, createMemoryStore } from "@contentcore/react";
import { ContentStudio } from "@contentcore/editor";
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { blocks } from "./blocks";
import pages from "../content/pages.json";

type Mode = "static" | "api";

function App() {
  const [mode, setMode] = useState<Mode>("static");
  const [token, setToken] = useState("");

  // Static: the repo's pages.json, edited in the browser. Export writes it back out.
  const staticStore = useMemo(() => createMemoryStore(pages), []);
  // API: the content API (server.mjs → content/pages.json on disk), authorised with a token.
  const apiStore = useMemo<ContentStore>(
    () => createApiStore({ baseUrl: "/api/content", headers: (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {}) }),
    [token],
  );

  return (
    <ContentStudio
      key={mode + (mode === "api" ? token : "")}
      store={mode === "static" ? staticStore : apiStore}
      blocks={blocks}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <img src="/favicon.svg" alt="" width={22} height={22} /> ContentCore Studio
        </span>
      }
      actions={
        <>
          <label className="cc-button">
            Content source{" "}
            <select aria-label="Content source" value={mode} onChange={(e) => setMode(e.target.value as Mode)} style={{ width: "auto" }}>
              <option value="static">Static JSON (in browser)</option>
              <option value="api">Content API</option>
            </select>
          </label>
          {mode === "api" && (
            <input
              type="password"
              aria-label="API token"
              placeholder="API token"
              autoComplete="off"
              defaultValue={token}
              onBlur={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setToken((e.target as HTMLInputElement).value)}
              style={{ width: 180 }}
            />
          )}
        </>
      }
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
