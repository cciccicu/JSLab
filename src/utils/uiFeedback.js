import prompt from '@system.prompt';
import vibrator from '@system.vibrator';

export function vibrate(mode) {
  if (mode) vibrator.vibrate({ mode });
}

export function showToast(message, duration) {
  const options = { message };
  if (duration !== undefined) options.duration = duration;
  prompt.showToast(options);
}

export function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

export default {
  vibrate,
  showToast,
  getErrorMessage
};
