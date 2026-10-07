const assert = require('assert');
const fs = require('fs');
const path = require('path');
const editorRoot = path.join(__dirname, '..', 'src', 'utils', 'editor');
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

async function run() {
  const profileSource = fs.readFileSync(path.join(editorRoot, 'fontProfile.js'), 'utf8')
    .replace("import file from '@system.file';", 'const file = { readText: options => options.fail() };');
  const profileUrl = dataUrl(profileSource);
  const profile = await import(profileUrl);
  const first = await profile.readActiveFontProfile();
  first.name = 'changed';
  assert.equal((await profile.readActiveFontProfile()).name, profile.DEFAULT_FONT_PROFILE.name);
  assert.deepEqual(profile.validateFontProfile(profile.DEFAULT_FONT_PROFILE), profile.DEFAULT_FONT_PROFILE);
  assert.throws(() => profile.validateFontProfile({ ...profile.DEFAULT_FONT_PROFILE, sourceName: '../bad.ttf' }));
  assert.throws(() => profile.validateFontProfile({ ...profile.DEFAULT_FONT_PROFILE, asciiWidthRatio: Infinity }));

  const packageSource = fs.readFileSync(path.join(editorRoot, 'fontManager.js'), 'utf8')
    .replace("import file from '@system.file';", 'const file = {};')
    .replace("'./fontProfile.js'", JSON.stringify(profileUrl))
    .replace(/import \{ decodeBase64 \}[^;]+;/, '')
    .replace(/import \{ formatAdler32, updateAdler32 \}[^;]+;/, '');
  const { validResumeState } = await import(dataUrl(packageSource + '\nexport { validResumeState };'));
  const state = {
    version: 2, expectedBytes: 6000, chunkBytes: 3072,
    fingerprint: '0123456789abcdef', checksum: '00000001', checksumAlgorithm: 'adler32',
    nextIndex: 1, bytes: 3072, adlerA: 1, adlerB: 0, profile: profile.DEFAULT_FONT_PROFILE
  };
  const valid = value => validResumeState(value, state.profile, 6000, 3072, state.fingerprint, state.checksum);
  assert.equal(valid(state), true);
  for (const patch of [{ nextIndex: '1' }, { nextIndex: 1.5 }, { bytes: '3072' },
    { adlerA: NaN }, { adlerB: Infinity }, { nextIndex: 3, bytes: 6000 }]) {
    assert.equal(valid({ ...state, ...patch }), false);
  }
  console.log('fontProfile and resume-state checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
