// A 30-line router so the example has no dependencies. With React Router, TanStack Router
// or any other router, the integration is the same: read the path, pass it to <CmsPage slug>.
import { usePrefetch } from "@contentcore/react";
import { type AnchorHTMLAttributes, useEffect, useState } from "react";

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return path;
}

export function navigate(href: string) {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Client-side link that warms the content cache on hover/focus, so the next page renders instantly. */
export function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const prefetch = usePrefetch();
  const internal = href.startsWith("/");
  return (
    <a
      {...rest}
      href={href}
      onMouseEnter={() => internal && prefetch(href)}
      onFocus={() => internal && prefetch(href)}
      onClick={(event) => {
        if (!internal || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
