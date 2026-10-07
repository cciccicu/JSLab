import prompt from '@system.prompt';
import vibrator from '@system.vibrator';

export function vibrate(mode) {
  if (mode) vibrator.vibrate({ mode });
}

export function showToast(message, duration) {
  const milliseconds = Number(duration);
  prompt.showToast({
    message: String(message == null ? '' : message),
    duration: isFinite(milliseconds) ? Math.min(10000, Math.max(1500, milliseconds)) : 1500
  });
}
