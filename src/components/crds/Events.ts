/**
 * Core Kubernetes Event model and helpers for ResourceInspect (event stream).
 */

/** Core v1 Event - groupVersionKind for useK8sWatchResource */
export const EventModel = {
  group: '',
  version: 'v1',
  kind: 'Event',
  plural: 'events',
  namespaced: true,
} as const;

/** Minimal Kubernetes Event shape (core/v1 Event). */
export interface K8sEvent {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    [key: string]: unknown;
  };
  involvedObject?: {
    kind?: string;
    name?: string;
    namespace?: string;
    [key: string]: unknown;
  };
  reason?: string;
  message?: string;
  type?: string;
  eventTime?: string;
  lastTimestamp?: string;
  firstTimestamp?: string;
  source?: {
    component?: string;
    host?: string;
    [key: string]: unknown;
  };
  count?: number;
  [key: string]: unknown;
}

/**
 * URL path segment (plural, lowercase) -> Kubernetes Kind (PascalCase) for Event involvedObject.kind.
 * Used when watching Events filtered by involvedObject.kind for the inspect page.
 */
const RESOURCE_TYPE_TO_KIND: Record<string, string> = {
  certificates: 'Certificate',
  issuers: 'Issuer',
  clusterissuers: 'ClusterIssuer',
  externalsecrets: 'ExternalSecret',
  clusterexternalsecrets: 'ClusterExternalSecret',
  secretstores: 'SecretStore',
  clustersecretstores: 'ClusterSecretStore',
  pushsecrets: 'PushSecret',
  clusterpushsecrets: 'ClusterPushSecret',
  secretproviderclasses: 'SecretProviderClass',
};

/**
 * Returns the Kubernetes Kind string for the given resource type (URL path segment).
 * Used to build the Events field selector (involvedObject.kind=...).
 */
export function getInvolvedObjectKind(resourceType: string): string {
  return RESOURCE_TYPE_TO_KIND[resourceType] ?? resourceType;
}
