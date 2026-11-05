// Compare and hash source text independently of Git checkout line endings.
// Font and image assets retain their exact bytes.
function normalizeSource(name, data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const text = /\.(js|ux|css|json|md|txt)$/i.test(name) || /(?:^|[\\/])LICENSE(?:\.[^\\/]+)?$/i.test(name);
  return text ? Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n')) : buffer;
}

module.exports = { normalizeSource };
