export function formatClock(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hourText = hours < 10 ? '0' + hours : String(hours);
  const minuteText = minutes < 10 ? '0' + minutes : String(minutes);
  return hourText + ':' + minuteText;
}

export function getCurrentClock() {
  return formatClock(new Date());
}
