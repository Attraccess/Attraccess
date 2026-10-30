// Preloaded by the built-process spec: holds every listen() for a moment and announces it, so a test can signal the
// sidecar while it is still starting.
const net = require('node:net');

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  process.stderr.write('test: listen delayed\n');
  setTimeout(() => listen.apply(this, args), 1_000);
  return this;
};
