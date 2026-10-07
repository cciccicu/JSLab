const fs = require('node:fs');
const path = require('node:path');
const { objectifyStyles } = require('./style-bindings.cjs');
const file = path.resolve(__dirname, '../src/pages/index/index.ux');
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
// Keep native nodes, component branches, bindings and styles identical. Only
// replace the observed for-array lookup with 24 explicit page properties.
const match = source.match(/<div for="\{\{node in uiNodes\}\}" tid="id" class="node-wrap"[\s\S]*?\n {8}<\/div>/);
if (!match) throw new Error('Missing generic node template');
const generic = match[0].replace(' for="{{node in uiNodes}}" tid="id"', '');
const fixed = Array.from({ length: 24 }, (_, index) => '        ' + generic.replace(/\bnode\./g, 'slot' + index + '.')).join('\n');
const marker = /<!-- FIXED_NODES_START -->[\s\S]*?<!-- FIXED_NODES_END -->/;
if (!marker.test(source)) throw new Error('Missing fixed-template markers');
const objectMarker = /<!-- OBJECT_NODES_START -->[\s\S]*?<!-- OBJECT_NODES_END -->/;
if (!objectMarker.test(source)) throw new Error('Missing object-template markers');
const updated = source.replace(marker, '<!-- FIXED_NODES_START -->\n' + fixed + '\n        <!-- FIXED_NODES_END -->')
  .replace(objectMarker, '<!-- OBJECT_NODES_START -->\n        ' + objectifyStyles(match[0]) + '\n        <!-- OBJECT_NODES_END -->');
fs.writeFileSync(file, updated, 'utf8');
