'use strict';

const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { readOptions } = require('./options.cjs');
const { openDatabase } = require('./database.cjs');
const { createAccounts } = require('./accounts.cjs');

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset-password');
  const fromStdin = args.includes('--stdin');
  if (args.some((arg) => !['--reset-password', '--stdin'].includes(arg))) throw new Error('用法：npm run setup -- [--reset-password] [--stdin]');
  let username, password;
  if (fromStdin) {
    // Automation supplies one JSON object through stdin, never command-line credentials.
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 4096) throw new Error('输入过长。');
    }
    ({ username, password } = JSON.parse(input));
  } else {
    if (!process.stdin.isTTY) throw new Error('请在终端运行；自动化可使用 --stdin 输入账户 JSON。');
    let hidden = false;
    const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding); callback(); } });
    const terminal = readline.createInterface({ input: process.stdin, output, terminal: true });
    try {
      username = (await terminal.question(reset ? '重置密码的用户名：' : '管理员用户名：')).trim();
      process.stdout.write('密码（至少 12 位，输入不显示）：');
      hidden = true;
      password = await terminal.question('');
      process.stdout.write('\n确认密码：');
      const confirm = await terminal.question('');
      if (password !== confirm) throw new Error('两次输入的密码不同。');
    } finally { terminal.close(); process.stdout.write('\n'); }
  }
  const { db } = openDatabase(readOptions());
  try {
    const accounts = createAccounts(db);
    if (reset) await accounts.resetPassword(username, password);
    else await accounts.create({ username, password, role: 'admin' });
    console.log(reset ? `已更新 ${username} 的密码，原网页登录会话已失效。` : `已创建管理员 ${username}。运行 npm start 启动服务。`);
  } finally { db.close(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
