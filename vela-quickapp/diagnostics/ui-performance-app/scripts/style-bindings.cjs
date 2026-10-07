// Build-time conversion for the controlled string/object template comparison.
// Never run this parser on the device.
function quote(value) { return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function stringExpression(value) {
  const parts = ["''"]; let offset = 0;
  for (const match of value.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    if (match.index > offset) parts.push(quote(value.slice(offset, match.index)));
    parts.push('(' + match[1].trim() + ')');
    offset = match.index + match[0].length;
  }
  if (offset < value.length) parts.push(quote(value.slice(offset)));
  return parts.join(' + ');
}
function objectStyle(value) {
  const properties = value.split(';').filter(part => part.trim()).map(part => {
    const colon = part.indexOf(':');
    if (colon < 1) throw new Error('Invalid inline style: ' + part);
    const name = part.slice(0, colon).trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) throw new Error('Unsupported style key: ' + name);
    return name + ': ' + stringExpression(part.slice(colon + 1).trim());
  });
  return '{{ { ' + properties.join(', ') + ' } }}';
}
function objectifyStyles(template) {
  return template.replace(/style="([^"]*)"/g, (_whole, value) => 'style="' + objectStyle(value) + '"');
}
module.exports = { objectStyle, objectifyStyles };
