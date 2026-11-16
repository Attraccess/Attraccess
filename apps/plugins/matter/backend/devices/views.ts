// Response shapes of the device REST API: protocol identity and editable metadata are separate objects.
import type {
  MatterEndpoint,
  MatterEndpointCapability,
  MatterEndpointCluster,
  MatterFabric,
  MatterNode,
} from './entities';

export function nodeView(node: MatterNode) {
  return {
    id: node.id,
    fabricRef: node.fabricRef,
    nodeId: node.nodeId,
    lifecycleState: node.lifecycleState,
    detachedReason: node.detachedReason,
    reachable: node.reachable,
    /** Read-only: reported by the sidecar. */
    identity: {
      vendorId: node.vendorId,
      productId: node.productId,
      vendorName: node.vendorName,
      productName: node.productName,
      serialNumber: node.serialNumber,
      uniqueId: node.uniqueId,
      hardwareVersion: node.hardwareVersion,
      softwareVersion: node.softwareVersion,
      softwareVersionString: node.softwareVersionString,
      attestation: { status: node.attestationStatus, checkedAt: node.attestationCheckedAt },
    },
    /** Editable by administrators; reconciliation never writes it. */
    metadata: { displayName: node.displayName, description: node.description, location: node.location },
    firstSeenAt: node.firstSeenAt,
    lastSeenAt: node.lastSeenAt,
    claimedAt: node.claimedAt,
    claimedBy: node.claimedBy,
    detachedAt: node.detachedAt,
    archivedAt: node.archivedAt,
    archivedBy: node.archivedBy,
    removedAt: node.removedAt,
    removedBy: node.removedBy,
    removalReason: node.removalReason,
    mergedInto: node.mergedInto,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

export function endpointView(endpoint: MatterEndpoint) {
  return {
    id: endpoint.id,
    nodeRef: endpoint.nodeRef,
    endpointId: endpoint.endpointId,
    parentEndpointId: endpoint.parentEndpointId,
    deviceTypes: JSON.parse(endpoint.deviceTypes) as { deviceTypeId: number; revision: number }[],
    profile: endpoint.profile,
    metadata: { displayName: endpoint.displayName, description: endpoint.description, location: endpoint.location },
    bridged: endpoint.bridged
      ? {
          uniqueId: endpoint.bridgedUniqueId,
          nodeLabel: endpoint.bridgedNodeLabel,
          vendorName: endpoint.bridgedVendorName,
          productName: endpoint.bridgedProductName,
          serialNumber: endpoint.bridgedSerialNumber,
          reachable: endpoint.bridgedReachable,
        }
      : null,
    firstSeenAt: endpoint.firstSeenAt,
    lastSeenAt: endpoint.lastSeenAt,
    removedAt: endpoint.removedAt,
    removalReason: endpoint.removalReason,
  };
}

export function clusterView(cluster: MatterEndpointCluster) {
  return {
    clusterId: cluster.clusterId,
    role: cluster.role,
    revision: cluster.revision,
    featureMap: cluster.featureMap,
    attributeIds: JSON.parse(cluster.attributeIds) as number[],
    acceptedCommandIds: JSON.parse(cluster.acceptedCommandIds) as number[],
  };
}

export function capabilityView(capability: MatterEndpointCapability) {
  return {
    capability: capability.capability,
    sourceClusterId: capability.sourceClusterId,
    details: JSON.parse(capability.details) as unknown,
  };
}

export function nodeDetailView(detail: {
  node: MatterNode;
  fabric: MatterFabric | null;
  endpoints: {
    endpoint: MatterEndpoint;
    clusters: MatterEndpointCluster[];
    capabilities: MatterEndpointCapability[];
  }[];
}) {
  return {
    ...nodeView(detail.node),
    fabric: detail.fabric && {
      id: detail.fabric.id,
      fabricId: detail.fabric.fabricId,
      status: detail.fabric.status,
      label: detail.fabric.label,
    },
    endpoints: detail.endpoints.map(({ endpoint, clusters, capabilities }) => ({
      ...endpointView(endpoint),
      clusters: clusters.map(clusterView),
      capabilities: capabilities.map(capabilityView).sort((a, b) => a.capability.localeCompare(b.capability)),
    })),
  };
}
