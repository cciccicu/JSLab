'use strict';

const { createApp } = require('./app.cjs');

const runtime = createApp();
if (!runtime.accounts.hasAdmin()) {
  runtime.close();
  console.error('请先运行 npm run setup 创建管理员账户。');
  process.exitCode = 1;
} else {
  const { host, port, dataDir } = runtime.options;
  const server = runtime.app.listen(port, host, () => {
    console.log(`JSLab Cloud: http://${host}:${port}/jslab-cloud`);
    console.log(`Data: ${dataDir}`);
  });
  server.on('error', (error) => { console.error(error.message); runtime.close(); process.exitCode = 1; });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => runtime.close());
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
