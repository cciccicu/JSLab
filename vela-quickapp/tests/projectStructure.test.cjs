const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'src');
const utilsRoot = path.join(sourceRoot, 'utils');

function walk(directory, extensions) {
  const result = [];
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(fullPath, extensions));
    else if (extensions.some(extension => entry.name.endsWith(extension))) result.push(fullPath);
  });
  return result;
}

function checkRelativeImports() {
  const missing = [];
  walk(sourceRoot, ['.js', '.ux']).forEach((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const pattern = /(?:from\s*|import\s*)['"]([^'"]+)['"]/g;
    let match;
    while ((match = pattern.exec(source))) {
      if (!match[1].startsWith('.')) continue;
      const target = path.resolve(path.dirname(filePath), match[1]);
      if (!fs.existsSync(target)) missing.push(path.relative(projectRoot, filePath) + ' -> ' + match[1]);
    }
  });
  assert.deepStrictEqual(missing, [], 'Relative imports must resolve');
}

function checkUtilsLayout() {
  const rootJavaScript = fs.readdirSync(utilsRoot).filter(name => name.endsWith('.js'));
  assert.deepStrictEqual(rootJavaScript, [], 'Shared modules must be placed in a domain directory');
}

function checkBackHandlers() {
  const ambiguous = [];
  walk(path.join(sourceRoot, 'pages'), ['.ux']).forEach((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    if (/import\s*\{[^}]*\bback\b[^}]*\}/.test(source) && /^\s*back\(\)\s*\{/m.test(source)) {
      ambiguous.push(path.relative(projectRoot, filePath));
    }
  });
  assert.deepStrictEqual(ambiguous, [], 'Page methods must not shadow the shared back function');
}

function checkOpaqueInteractionStates() {
  const offenders = [];
  const invalidColors = [];
  const expectedColors = {
    'disabled-item': '#303030',
    'disabled-icon': '#303030',
    'disabled-text': '#8c8c8c'
  };
  walk(path.join(sourceRoot, 'pages'), ['.ux']).forEach((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    if (/\bopacity\s*:/.test(source)) offenders.push(path.relative(projectRoot, filePath));
    const pattern = /\.(disabled-item|disabled-icon|disabled-text)\s*\{([^}]*)\}/g;
    let match;
    while ((match = pattern.exec(source))) {
      const expected = expectedColors[match[1]];
      const property = match[1] === 'disabled-text' ? 'color' : 'background-color';
      const colorPattern = new RegExp(property + '\\s*:\\s*' + expected, 'i');
      if (!colorPattern.test(match[2])) invalidColors.push(path.relative(projectRoot, filePath) + ':' + match[1]);
    }
  });
  assert.deepStrictEqual(offenders, [], 'Interaction states must use solid colors instead of opacity');
  assert.deepStrictEqual(invalidColors, [], 'Disabled states must use the shared solid-color scheme');
}

function checkMarketUiStates() {
  const marketPath = path.join(sourceRoot, 'pages', 'tools', 'market', 'market.ux');
  const source = fs.readFileSync(marketPath, 'utf8');
  const template = source.slice(source.indexOf('<template>'), source.indexOf('</template>'));
  const statusNodes = template.match(/class="status-text"/g) || [];

  assert.strictEqual(statusNodes.length, 1, 'Market must render exactly one mutually exclusive status text');
  assert(!/if="{{!?loading/.test(template), 'Market loading state must use the shared status node');
  assert(source.indexOf('if (!state.paired)') < source.indexOf('this.loading = true;'), 'Local pairing checks must finish before showing network loading');
  assert(source.includes("if (nextQuery === this.query) return;"), 'Unchanged local searches must not trigger a network loading state');

  const chromeOrder = ['class="header"', 'class="time-text"', 'class="heading"', 'class="back"', 'class="upload'];
  let previousIndex = -1;
  chromeOrder.forEach((token) => {
    const index = template.indexOf(token);
    assert(index > previousIndex, 'Market chrome and touch controls must follow the expected paint order');
    previousIndex = index;
  });
}

function checkLocalFileListUiStates() {
  const indexPath = path.join(sourceRoot, 'pages', 'index', 'index.ux');
  const source = fs.readFileSync(indexPath, 'utf8');
  const template = source.slice(source.indexOf('<template>'), source.indexOf('</template>'));

  assert(!source.includes('fileListLoading'), 'Local file scans must not expose a loading state');
  assert(!template.includes('正在读取代码'), 'Local file scans must not cover files with a loading message');
  assert(template.includes('fileListError && fileList.length == 0'), 'Local scan errors must not cover an existing file list');
  assert(template.includes('fileListReady && fileList.length == 0'), 'The empty state must wait for the first local scan to finish');
  assert(template.indexOf('</list>') < template.indexOf('class="empty-text"'), 'Home status text must paint above the file list');
  assert(template.indexOf('class="empty-text"') < template.indexOf('class="header-img"'), 'Home status text must remain below the header');
}

checkRelativeImports();
checkUtilsLayout();
checkBackHandlers();
checkOpaqueInteractionStates();
checkMarketUiStates();
checkLocalFileListUiStates();
console.log('projectStructure tests passed');
