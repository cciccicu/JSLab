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

// Only visible pages keep a clock timer. Timer handles are not reactive data.
const pageClocks = new WeakMap();

export function stopPageClock(page) {
  if (!pageClocks.has(page)) return;
  clearTimeout(pageClocks.get(page));
  pageClocks.delete(page);
}

export function startPageClock(page) {
  stopPageClock(page);
  const tick = () => {
    const date = new Date();
    const value = formatClock(date);
    if (page.nowTime !== value) page.nowTime = value;
    pageClocks.set(page, setTimeout(tick, 60000 - (date.getSeconds() * 1000 + date.getMilliseconds())));
  };
  tick();
}
