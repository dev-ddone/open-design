import { installOpenverseAuthenticatedFetch } from "./openverse-auth.js";
import { installWikimediaCompliantFetch } from "./wikimedia-fetch.js";

export function installUpstreamIntegrations(): void {
  installOpenverseAuthenticatedFetch();
  installWikimediaCompliantFetch();
}
