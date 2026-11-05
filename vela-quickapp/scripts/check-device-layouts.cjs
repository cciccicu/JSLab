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
  if(x<0 || x>432 || y<0 || y>514)return false;
  const radius=90, dx=Math.max(radius-x,0,x-(432-radius)),dy=Math.max(radius-y,0,y-(514-radius));
  return dx*dx+dy*dy<=radius*radius;
}
let pageCount=0, actionCount=0;
function safeBox(x,y,w,h,label) {
  assert.ok([x,y,w,h].every(Number.isFinite),'Unresolved fixed geometry: '+label);
  for(const [px,py]of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]])assert.ok(inside(px,py),'Clipped by 90px corner: '+label);
}
// Read actual UX elements, so a differently named button cannot silently escape checks.
function checkPage(file,css) {
  const source=fs.readFileSync(file,'utf8');
  const body=source.match(/<template>([\s\S]*?)<\/template>/)[1].replace(/<!--[\s\S]*?-->/g,'');
  const stack=[{x:0,y:0,css:{width:'432px',height:'514px'}}];
  for(const match of body.matchAll(/<\/?[\w-]+\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/g)) {
    const token=match[0],tag=token.match(/^<\/?([\w-]+)/)[1];
    if(token.startsWith('</')) {assert.equal(stack.pop().tag,tag,file+' unbalanced template');continue;}
    const attrs={};
    for(const attr of token.slice(tag.length+1).matchAll(/([\w:@-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g))attrs[attr[1]]=attr[2]??attr[3]??'';
    const classes=(attrs.class||'').replace(/{{[\s\S]*?}}/g,'').split(/\s+/),box={};
    for(const [selector,decls]of Object.entries(css))if(/^\.[\w-]+$/.test(selector)&&classes.includes(selector.slice(1)))Object.assign(box,decls);
    if(attrs.style&&!attrs.style.includes('{{'))postcss.parse('x{'+attrs.style+'}').walkDecls(decl=>{box[decl.prop]=decl.value;});
    const parent=stack[stack.length-1],w=parseFloat(box.width),h=parseFloat(box.height)||parseFloat(box['line-height'])*(Number(box.lines)>0?Number(box.lines):1);
    const x=parent.x+(box.left!==undefined?parseFloat(box.left):parseFloat(parent.css.width)-parseFloat(box.right)-w);
    const y=parent.y+(box.top!==undefined?parseFloat(box.top):parseFloat(parent.css.height)-parseFloat(box.bottom)-h);
    // The root defines the coordinate origin. Relative flow is audited separately.
    const node={tag,css:box,x:classes.includes('page')?0:x,y:classes.includes('page')?0:y};
    const click=Object.hasOwn(attrs,'@click')||Object.hasOwn(attrs,'onclick');
    const backdrop=classes.some(name=>['network-shade','editor-menu-dismiss','console-content'].includes(name));
    // Script UI nodes get their geometry from uiLayout, not fixed page CSS.
    const runtimeNode=classes.includes('node-wrap')&&attrs.for==='{{node in uiNodes}}';
    if(click&&box.position==='absolute'&&!backdrop&&!runtimeNode) {safeBox(x,y,w,h,file+' .'+attrs.class);actionCount++;}
    if(!token.endsWith('/>'))stack.push(node);
  }
  assert.equal(stack.length,1,file+' unclosed template');
  pageCount++;
}
for(const file of cssFiles) {
  const relative=path.relative(base,file), watch=path.join(overlay,relative);
  assert.ok(fs.existsSync(watch),'Missing device CSS: '+relative);
  const css=styles(watch);
  if(relative.startsWith('pages')) {assert.equal(css['.page'].width,'432px',relative);assert.equal(css['.page'].height,'514px',relative);}
  if(relative.startsWith('pages'))checkPage(file.replace(/\.css$/,'.ux'),css);
}
const templateRoot=path.resolve(appRoot,'../vela-rpk-template');
const templateBase=path.join(templateRoot,'src');
const manifest=JSON.parse(fs.readFileSync(path.join(templateBase,'manifest.json'),'utf8'));
for(const [route,config]of Object.entries(manifest.router.pages)) {
  const relative=route+'/'+config.component;
  const cssFile=[path.join(templateRoot,'targets/redmi-watch5',relative+'.css'),path.join(overlay,relative+'.css')].find(file=>fs.existsSync(file));
  assert.ok(cssFile,'Missing template target stylesheet: '+relative);
  const css=styles(cssFile);
  assert.equal(css['.page'].width,'432px',relative);assert.equal(css['.page'].height,'514px',relative);
  checkPage(path.join(templateBase,relative+'.ux'),css);
}
const keyboard=styles(path.join(overlay,'components/InputMethod/InputMethod.css'));
assert.equal(keyboard['.keyboard-body'].height,'159px');
const k=name=>keyboard['.'+name],p=(name,prop)=>parseFloat(k(name)[prop]);
assert.ok(3*p('letter-row','height')+p('row-2','margin-top')+p('row-3','margin-top')<=p('keyboard-body','height'),'Letter rows overflow');
for(const name of ['keyboard-body','numeric-pad','keyboard-page-scroll'])safeBox(p(name,'left'),514-p('page','height')+p(name,'top'),p(name,'width'),p(name,'height'),name);
assert.equal(k('letter-key')['flex-shrink'],'0','QWERTY keys may shrink');
assert.ok(10*(p('letter-key','width')+p('letter-key','margin-right'))<=p('letter-rows','width'),'QWERTY content width');
assert.ok(3*(p('numeric-row','height')+p('numeric-row','margin-bottom'))<=p('numeric-pad','height'),'Numeric keyboard rows overflow');
assert.ok(p('keyboard-section-heading','height')+3*(p('symbol-row','height')+p('symbol-row','margin-bottom'))<=p('keyboard-page-scroll','height'),'Symbol keyboard rows overflow');
assert.ok(3*(p('snippet-row','height')+p('snippet-row','margin-bottom'))<=p('keyboard-page-scroll','height'),'Snippet keyboard rows overflow');
assert.ok(5*(p('state-button','width')+p('state-button','margin-right'))+p('toolbar-delete','width')<=p('action-row-five','width'),'Mode toolbar overflow');
assert.ok(p('mode-button-cn','width')+p('candidate-bar','margin-left')+p('candidate-bar','width')+p('delete-button-spaced','margin-left')+p('delete-button-spaced','width')<=p('action-row-cn','width'),'Chinese toolbar overflow');
assert.ok(p('candidate-scroll','width')+p('candidate-expand','width')+p('candidate-expand','right')<=p('candidate-bar','width')-2*p('candidate-bar','border'),'Candidate expand button overlaps words');
assert.ok(p('candidate-button','height')<=p('candidate-row','height'),'Candidate buttons overlap rows');
assert.ok(p('candidate-list','height')+p('candidate-collapse','margin-top')+p('candidate-collapse','height')<=p('candidate-overlay','height'),'Expanded candidates overflow');
const number=styles(path.join(overlay,'common/styles/dialog.css'));
assert.ok(parseFloat(number['.keys'].top)+5*(parseFloat(number['.key-row'].height)+3)<=514-30,'Number pad exceeds safe bottom');
assert.ok(parseFloat(number['.input-card'].top)+parseFloat(number['.input-card'].height)<=514-p('page','height'),'Text input overlaps keyboard');
assert.ok(3*parseFloat(number['.action-compact'].width)<=432-60,'Three confirmation actions overflow');
function verticalPadding(box) {
  const padding=box.padding.split(/\s+/).map(parseFloat);
  return padding[0]+(padding[2]===undefined?padding[0]:padding[2]);
}
for(const relative of ['pages/settings/cloud/cloud.css','pages/workspace/ai-generate/ai-generate.css']) {
  const css=styles(path.join(overlay,relative));
  const title=parseFloat((css['.item-title']||{})['line-height']);
  const description=css['.item-description'];
  assert.ok(title+Number(description.lines)*parseFloat(description['line-height'])+verticalPadding(css['.item'])<=parseFloat(css['.item'].height),'Multiline card clips text: '+relative);
}
const about=styles(path.join(overlay,'pages/settings/about/about.css'));
assert.ok(verticalPadding(about['.qrcode-card'])+parseFloat(about['.card-title']['line-height'])+parseFloat(about['.feedback-qrcode']['margin-top'])+parseFloat(about['.feedback-qrcode'].height)<=parseFloat(about['.qrcode-card'].height),'About QR code is compressed');
const menu=styles(path.join(overlay,'pages/workspace/editor/editor.css'));
assert.ok(verticalPadding(menu['.editor-menu-card'])+6*parseFloat(menu['.editor-menu-item'].height)<=parseFloat(menu['.editor-menu-card'].height),'Editor menu clips its final action');
function checkFloatingFooter(css,source,viewport,spacer,footerTop,label,height=514,gap=8) {
  const box=css[viewport],tail=css[spacer];
  assert.equal(parseFloat(box.top)+parseFloat(box.height),height,label+' scroll viewport stops above the screen bottom');
  const padding=(box.padding||'0').split(/\s+/).map(parseFloat);
  const bottom=box['padding-bottom']===undefined?(padding[2]===undefined?padding[0]:padding[2]):parseFloat(box['padding-bottom']);
  assert.equal(bottom,0,label+' footer space must scroll with content, not clip the viewport');
  assert.ok(parseFloat(tail.height)>=height-footerTop+gap,label+' final content cannot clear the floating controls');
  assert.equal(tail['flex-shrink'],'0',label+' end spacer may shrink');
  const block=source.match(/<(scroll|list)\b[^>]*>[\s\S]*?<\/\1>/);
  assert.ok(block&&block[0].includes('class="'+spacer.slice(1)+'"'),label+' missing scroll-content spacer');
}
for(const [relative,viewport]of [['pages/index/index','.list'],['pages/settings/cloud/files/files','.list'],['pages/tools/market/market','.scroll'],['pages/tools/market/view/view','.body'],['pages/overlay/confirm/confirm','.body']]) {
  checkFloatingFooter(styles(path.join(overlay,relative+'.css')),fs.readFileSync(path.join(base,relative+'.ux'),'utf8'),viewport,'.footer-spacer',relative.includes('/confirm/')?424:412,relative);
  checkFloatingFooter(styles(path.join(base,relative+'.css')),fs.readFileSync(path.join(base,relative+'.ux'),'utf8'),viewport,'.footer-spacer',relative.includes('/confirm/')?400:402,'Pro '+relative,480);
}
checkFloatingFooter(menu,fs.readFileSync(path.join(base,'pages/workspace/editor/editor.ux'),'utf8'),'.scroll','.code-bottom-spacer',412,'editor');
checkFloatingFooter(number,fs.readFileSync(path.join(templateBase,'pages/overlay/confirm/confirm.ux'),'utf8'),'.body','.footer-spacer',424,'standalone confirm');
checkFloatingFooter(styles(path.join(base,'pages/workspace/editor/editor.css')),fs.readFileSync(path.join(base,'pages/workspace/editor/editor.ux'),'utf8'),'.scroll','.code-bottom-spacer',402,'Pro editor',480,0);
checkFloatingFooter(styles(path.join(templateBase,'pages/overlay/confirm/confirm.css')),fs.readFileSync(path.join(templateBase,'pages/overlay/confirm/confirm.ux'),'utf8'),'.body','.footer-spacer',400,'Pro standalone confirm',480);
for(const file of files(base).filter(file=>file.endsWith('.ux'))) {
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/style="left:\s*(6|258)px;\s*top:\s*(6|402)px;/,'Inline device positions: '+file);
  for(const match of source.matchAll(/@import\s+['"]([^'"]+)['"]/g))assert.ok(fs.existsSync(path.resolve(path.dirname(file),match[1])),file+' style import');
}
console.log('Watch 5 static audit: '+pageCount+' routed pages, '+cssFiles.length+' app stylesheets, '+actionCount+' fixed actions; 90px corners and keyboard states verified.');
