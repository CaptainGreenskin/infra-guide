/* Deterministic embed only: safe to call from render-pages without executing a lab. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function embedCloudProxyBridge() {
  const template = fs.readFileSync(path.join(__dirname, 'cloud-proxy-bridge.template.js'), 'utf8');
  if (template.split('__CLOUD_PROXY_SOURCE__').length !== 2) throw Error('Expected exactly one source slot');
  const source = fs.readFileSync(path.join(root, 'dist/labs/cloud-proxy/proxy_lab.py'), 'utf8');
  const output = template.replace('__CLOUD_PROXY_SOURCE__', () => JSON.stringify(source));
  const target = path.join(root, 'dist/cloud-proxy-bridge.js');
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) fs.writeFileSync(target, output);
}

module.exports = embedCloudProxyBridge;
if (require.main === module) embedCloudProxyBridge();
