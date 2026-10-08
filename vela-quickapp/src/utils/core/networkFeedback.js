// Keep a custom loading dialog alive while a watch network request is pending.
const activeFeedback = new WeakMap();
const pageVisibility = new WeakMap();
const DOTS = ['.', '..', '...', '....', '.....', '......'];

export function startNetworkFeedback(page, label) {
  stopNetworkFeedback(page);
  const state = { dots: 0, timer: null };
  activeFeedback.set(page, state);
  page.networkStage = label;
  page.networkStatus = '加载中' + DOTS[state.dots];
  setNetworkFeedbackVisible(page, pageVisibility.get(page) !== false);
}

export function updateNetworkFeedback(page, label) {
  if (activeFeedback.has(page)) page.networkStage = label;
}

export function setNetworkFeedbackVisible(page, visible) {
  pageVisibility.set(page, visible);
  const state = activeFeedback.get(page);
  if (!state) return;
  if (!visible) {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    return;
  }
  if (state.timer) return;
  state.timer = setInterval(() => {
    if (activeFeedback.get(page) !== state) return;
    state.dots = (state.dots + 1) % DOTS.length;
    page.networkStatus = '加载中' + DOTS[state.dots];
  }, 500);
}

export function stopNetworkFeedback(page) {
  const state = activeFeedback.get(page);
  if (state) clearInterval(state.timer);
  activeFeedback.delete(page);
  page.networkStatus = '';
  page.networkStage = '';
}
