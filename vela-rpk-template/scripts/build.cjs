const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname,'..');
execFileSync(process.execPath,[path.join(__dirname,'sync-runtime.cjs')],{cwd:root,stdio:'inherit'});
// Reuse the workspace toolkit when available; no server/watch/device commands.
const modules=[path.join(root,'node_modules'),path.resolve(root,'../vela-quickapp/node_modules')];
const toolkit=modules.find(dir => fs.existsSync(path.join(dir,'aiot-toolkit/lib/bin.js')));
if (!toolkit) throw new Error('请先 npm install 安装模板开发依赖');
execFileSync(process.execPath,[path.join(toolkit,'aiot-toolkit/lib/bin.js'),'build'],{cwd:root,stdio:'inherit',env:{...process.env,NODE_PATH:toolkit}});
execFileSync(process.execPath,[path.join(__dirname,'export-template.cjs')],{cwd:root,stdio:'inherit',env:{...process.env,NODE_PATH:toolkit}});
