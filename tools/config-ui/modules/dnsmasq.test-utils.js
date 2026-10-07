function buildFsMock({ files = {} } = {}) {
  const writes = {};
  const mockFs = {
    readFileSync: jest.fn((p) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    }),
    writeFileSync: jest.fn((p, content) => {
      writes[p] = content;
    }),
    mkdirSync: jest.fn(),
  };
  return { mockFs, writes };
}

function loadModule(envOverrides = {}, fsOptions) {
  const savedEnv = {};
  for (const key of Object.keys(envOverrides)) {
    savedEnv[key] = process.env[key];
    process.env[key] = envOverrides[key];
  }
  const { mockFs, writes } = buildFsMock(fsOptions);
  jest.doMock('fs', () => mockFs);
  jest.resetModules();
  const mod = require('./dnsmasq');

  const restore = () => {
    for (const key of Object.keys(envOverrides)) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  };

  return { mod, writes, mockFs, restore };
}

function invokeHandler(mod, method, subPath, subParts, body) {
  let capturedStatus;
  let capturedJson;
  const helpers = {
    readBody: async () => body || {},
    sendJson: (_res, status, data) => {
      capturedStatus = status;
      capturedJson = data;
    },
    loadJson: jest.fn(),
    saveJson: jest.fn(),
  };
  return mod
    .handleRequest(method, subPath, subParts, null, null, helpers)
    .then(() => ({ status: capturedStatus, body: capturedJson }));
}
module.exports = { buildFsMock, loadModule, invokeHandler };
