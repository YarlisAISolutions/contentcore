import { type Capabilities, createCapabilities } from "@contentcore/core";
import { useContext, useMemo } from "react";
import { PageContext, useCms } from "./context";

/**
 * What the viewer may do, merged from the provider's `capabilities` and the current page's.
 * For showing or hiding UI only: your backend endpoints must still check permissions.
 *
 *   const { can } = useCapabilities();
 *   {can("page:edit") && <EditButton />}
 */
export function useCapabilities(): Capabilities {
  const { capabilities } = useCms();
  const page = useContext(PageContext);
  return useMemo(() => createCapabilities(capabilities, page?.capabilities), [capabilities, page?.capabilities]);
}
