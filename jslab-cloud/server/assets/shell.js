'use strict';

const themeKey = 'jslab-cloud-theme';
const root = document.documentElement;
root.dataset.bsTheme = localStorage.getItem(themeKey) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
  root.dataset.bsTheme = root.dataset.bsTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(themeKey, root.dataset.bsTheme);
});
