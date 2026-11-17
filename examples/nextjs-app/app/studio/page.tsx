// The editor inside a Next.js app. Here it edits the bundled JSON in the browser (Export JSON to
// save); point it at your content API with createApiStore for live editing. Put this route behind
// your authentication in a real app.
import { StudioClient } from "./StudioClient";

export const metadata = { title: "Studio", robots: { index: false } };

export default function StudioPage() {
  return <StudioClient />;
}
