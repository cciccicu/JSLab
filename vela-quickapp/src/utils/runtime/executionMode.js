export function detectExecutionMode(name) {
  return /\.ui\.js$/i.test(String(name || '')) ? 'ui' : 'console';
}

export function getExecutionRoute(name) {
  return detectExecutionMode(name) === 'ui' ? 'runUi' : 'runConsole';
}

export default { detectExecutionMode, getExecutionRoute };
