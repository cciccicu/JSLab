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

checkRelativeImports();
checkUtilsLayout();
checkBackHandlers();
console.log('projectStructure tests passed');
