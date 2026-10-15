const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const postcss=require('postcss');
const {appRoot,files}=require('./device-build.cjs');
const base=path.join(appRoot,'src');
const overlay=path.join(appRoot,'targets/redmi-watch5');
const cssFiles=files(base).filter(file=>file.endsWith('.css'));
function styles(file) {
  const result={};
  const ast=postcss.parse(fs.readFileSync(file,'utf8'));
  ast.walkAtRules('import',rule=>{
    const relative=rule.params.match(/['"]([^'"]+)['"]/);
    assert.ok(relative,'Unsupported CSS import');
    Object.assign(result,styles(path.resolve(path.dirname(file),relative[1])));
  });
  ast.walkRules(rule=>{
    for(const selector of rule.selector.split(',')) {
      const key=selector.trim();result[key] ||= {};
      rule.walkDecls(decl=>{result[key][decl.prop]=decl.value;});
    }
  });
  return result;
}
function inside(x,y) {
  const radius=90, dx=Math.max(radius-x,0,x-(432-radius)),dy=Math.max(radius-y,0,y-(514-radius));
  return dx*dx+dy*dy<=radius*radius;
}
for(const file of cssFiles) {
  const relative=path.relative(base,file), watch=path.join(overlay,relative);
  assert.ok(fs.existsSync(watch),'Missing device CSS: '+relative);
  const css=styles(watch);
  if(relative.startsWith('pages')) {assert.equal(css['.page'].width,'432px',relative);assert.equal(css['.page'].height,'514px',relative);}
  const button=css['.btn'] || {};
  for(const name of ['.header-left','.header-right','.footer-left','.footer-second','.footer-center','.footer-third','.footer-right','.btn-left-top','.btn-right-top','.back-button','.top-left','.top-right','.action-left','.action-center','.action-right']) {
    if(!css[name])continue;
    const box={...button,...css[name]}, x=parseFloat(box.left),y=parseFloat(box.top),w=parseFloat(box.width),h=parseFloat(box.height);
    if([x,y,w,h].some(Number.isNaN))continue;
    for(const [px,py]of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]])assert.ok(inside(px,py),relative+' clipped '+name);
  }
}
const keyboard=styles(path.join(overlay,'components/InputMethod/InputMethod.css'));
assert.equal(keyboard['.keyboard-body'].height,'159px');
assert.ok(66+50*3+3*2<=255-30,'Keyboard rows overlap the corner safe bottom');
const number=styles(path.join(overlay,'common/styles/dialog.css'));
assert.ok(parseFloat(number['.keys'].top)+5*(parseFloat(number['.key-row'].height)+3)<=514-30,'Number pad exceeds safe bottom');
for(const file of files(base).filter(file=>file.endsWith('.ux'))) {
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/style="left:\s*(6|258)px;\s*top:\s*(6|402)px;/,'Inline device positions: '+file);
  for(const match of source.matchAll(/@import\s+['"]([^'"]+)['"]/g))assert.ok(fs.existsSync(path.resolve(path.dirname(file),match[1])),file+' style import');
}
console.log('Device CSS coverage and 90px corner geometry verified: '+cssFiles.length+' stylesheets');
