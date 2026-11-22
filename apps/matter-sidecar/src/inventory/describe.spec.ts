import { administratorsOf, describeNode, type EndpointLike } from './describe';

const endpoint = (
  number: number,
  state: EndpointLike['state'],
  supported: EndpointLike['behaviors']['supported'] = {},
): EndpointLike => ({ number, state, behaviors: { supported } });

const root = endpoint(
  0,
  {
    basicInformation: {
      vendorId: 0xfff1,
      productId: 0x8000,
      vendorName: 'Vendor',
      productName: 'Product',
      serialNumber: '',
      uniqueId: 'u-1',
      hardwareVersion: 2,
      softwareVersion: 7,
      softwareVersionString: '1.0.7',
    },
    descriptor: {
      deviceTypeList: [{ deviceType: 22, revision: 5 }],
      serverList: [40, 29],
      clientList: [],
      partsList: [1, 2],
    },
  },
  { basicInformation: { cluster: { id: 40 } }, descriptor: { cluster: { id: 29 } } },
);
const light = endpoint(
  1,
  {
    descriptor: {
      deviceTypeList: [{ deviceType: 256, revision: 4 }],
      serverList: [6, 999],
      clientList: [3],
      partsList: [],
    },
    onOff: {
      clusterRevision: 6,
      featureMap: { lighting: true, deadFrontBehavior: false, offOnly: true },
      attributeList: [0, 65533],
      acceptedCommandList: [0, 1, 2],
    },
  },
  {
    onOff: { cluster: { id: 6, features: { lighting: { id: 0 }, deadFrontBehavior: { id: 1 }, offOnly: { id: 2 } } } },
  },
);
const bridged = endpoint(
  2,
  {
    descriptor: { deviceTypeList: [], serverList: [0x39], clientList: [], partsList: [] },
    bridgedDeviceBasicInformation: { uniqueId: 'b-1', nodeLabel: 'Lamp', reachable: false },
  },
  { bridgedDeviceBasicInformation: { cluster: { id: 0x39 } } },
);

describe('describeNode', () => {
  const node = describeNode({
    nodeId: '5',
    reachable: false,
    endpoints: [root, light, bridged],
    attestation: { status: 'unknown', checkedAt: null },
    administrators: [],
    observedAt: null,
  });

  it('maps the identity of the root endpoint, with empty text as null', () => {
    expect(node).toMatchObject({
      nodeId: '5',
      reachable: false,
      vendorId: 0xfff1,
      productId: 0x8000,
      serialNumber: null,
      uniqueId: 'u-1',
      softwareVersion: 7,
      softwareVersionString: '1.0.7',
    });
  });

  it('maps clusters with revision, a numeric feature map and the attribute and command lists', () => {
    const lightEndpoint = node.endpoints.find((entry) => entry.endpointId === 1);
    expect(lightEndpoint?.clusters[0]).toEqual({
      clusterId: 6,
      role: 'server',
      revision: 6,
      featureMap: 0b101,
      attributeIds: [0, 65533],
      acceptedCommandIds: [0, 1, 2],
    });
    // A cluster matter.js does not model is listed without detail; client clusters carry none either.
    expect(lightEndpoint?.clusters[1]).toMatchObject({
      clusterId: 999,
      role: 'server',
      revision: null,
      attributeIds: [],
    });
    expect(lightEndpoint?.clusters[2]).toMatchObject({ clusterId: 3, role: 'client', revision: null });
  });

  it('derives the parent from the parts lists and reads bridged information', () => {
    expect(node.endpoints.map((entry) => entry.parentEndpointId)).toEqual([null, 0, 0]);
    expect(node.endpoints[2].bridged).toMatchObject({
      uniqueId: 'b-1',
      nodeLabel: 'Lamp',
      reachable: false,
      vendorName: null,
    });
    expect(node.endpoints[1].bridged).toBeNull();
  });

  it('prefers a non-root parent for composed endpoints', () => {
    const parent = endpoint(3, { descriptor: { partsList: [4] } });
    const child = endpoint(4, { descriptor: { partsList: [] } });
    const rootWithAll = endpoint(0, { descriptor: { partsList: [3, 4] } });
    const described = describeNode({
      nodeId: '1',
      reachable: true,
      endpoints: [rootWithAll, parent, child],
      attestation: { status: 'unknown', checkedAt: null },
      administrators: [],
      observedAt: null,
    });
    expect(described.endpoints.map((entry) => entry.parentEndpointId)).toEqual([null, 0, 3]);
  });

  it('survives a node whose basic information was never cached', () => {
    const empty = describeNode({
      nodeId: '1',
      reachable: false,
      endpoints: [],
      attestation: { status: 'unknown', checkedAt: null },
      administrators: [],
      observedAt: null,
    });
    expect(empty).toMatchObject({ vendorId: null, productId: null, endpoints: [] });
  });
});

describe('administratorsOf', () => {
  it('marks our own fabric and turns an empty label into null', () => {
    expect(
      administratorsOf(
        [
          { fabricIndex: 1, vendorId: 0xfff1, label: 'Attraccess' },
          { fabricIndex: 2, vendorId: 4937, label: '' },
          { fabricIndex: 0, vendorId: 1, label: 'invalid index' },
        ],
        1,
      ),
    ).toEqual([
      { fabricIndex: 1, vendorId: 0xfff1, fabricLabel: 'Attraccess', isOwn: true },
      { fabricIndex: 2, vendorId: 4937, fabricLabel: null, isOwn: false },
    ]);
    expect(administratorsOf(undefined, 1)).toEqual([]);
  });
});
