const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadFileMetadata() {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'files', 'fileMetadata.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(dataUrl);
}

async function run() {
  const encodingSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'files', 'textEncoding.js'), 'utf8');
  const encoding = await import('data:text/javascript;base64,' + Buffer.from(encodingSource).toString('base64'));
  const metadata = { ...await loadFileMetadata(), ...encoding };
  const files = [
    { name: 'older.js', lastModifiedTime: 100 },
    { name: 'newer.js', lastModifiedTime: 300 },
    { name: 'middle.js', lastModifiedTime: 200 }
  ];
  const sorted = metadata.sortFilesNewestFirst(files);
  assert.deepStrictEqual(sorted.map(file => file.name), ['newer.js', 'middle.js', 'older.js']);
  assert.deepStrictEqual(files.map(file => file.name), ['older.js', 'newer.js', 'middle.js']);

  assert.strictEqual(metadata.formatFileSize(0), '0 B');
  assert.strictEqual(metadata.formatFileSize(1234), '1234 B');
  assert.strictEqual(metadata.formatFileSize('invalid'), '0 B');
  assert.strictEqual(metadata.utf8ByteLength('a中😀'), 8);

  const content = 'ab中😀cd';
  const chunks = [];
  let offset = 0;
  while (offset < metadata.utf8ByteLength(content)) {
    const chunk = metadata.sliceUtf8Chunk(content, offset, 4);
    chunks.push(chunk.content);
    assert(chunk.nextOffset > offset);
    assert.strictEqual(chunk.size, 11);
    offset = chunk.nextOffset;
    if (chunk.done) break;
  }
  assert.strictEqual(chunks.join(''), content);
  assert.strictEqual(offset, 11);
  assert.throws(() => metadata.sliceUtf8Chunk(content, 3, 4), /UTF-8/);
  assert.throws(() => metadata.sliceUtf8Chunk('中', 0, 1), /不足/);
  assert.throws(() => metadata.sliceUtf8Chunk('a', 0, 0.5), /至少/);
  assert.throws(() => metadata.sliceUtf8Chunk('a', -1, 4), /非负整数/);
  assert.equal(metadata.utf8ByteLength(0), 1);
  assert.equal(encoding.decodeBase64('AAE='), '\x00\x01');
  for (const invalid of ['AQ==AAAA', 'A===', 'AB==', 'AAB=', '!!!!']) {
    assert.throws(() => encoding.decodeBase64(invalid), /编码无效/);
  }

  const boundaryContent = 'a'.repeat(4095) + '中😀';
  const firstChunk = metadata.sliceUtf8Chunk(boundaryContent, 0, 4096);
  assert.strictEqual(firstChunk.content, 'a'.repeat(4095));
  assert.strictEqual(firstChunk.nextOffset, 4095);
  assert.strictEqual(firstChunk.done, false);
  const secondChunk = metadata.sliceUtf8Chunk(boundaryContent, firstChunk.nextOffset, 4096);
  assert.strictEqual(secondChunk.content, '中😀');
  assert.strictEqual(secondChunk.nextOffset, 4102);
  assert.strictEqual(secondChunk.done, true);

  const timestamp = new Date(2026, 6, 26, 9, 5).getTime();
  assert.strictEqual(metadata.formatModifiedDate(timestamp), '2026-07-26 09:05');
  assert.strictEqual(metadata.formatModifiedDate(0), '未知');

  console.log('fileMetadata tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
