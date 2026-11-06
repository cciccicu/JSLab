(function () {
  'use strict';

  var navigation = document.querySelector('[data-docs-navigation]');
  if (!navigation) return;
  var mobile = window.matchMedia('(max-width: 900px)');
  var groups = Array.from(navigation.querySelectorAll('[data-docs-group]'));
  var storageKey = 'jslab-cloud:docs:expanded';

  // Native details keep all navigation usable even without JavaScript.
  var saved;
  try { saved = JSON.parse(window.sessionStorage.getItem(storageKey)); } catch (_) {}
  groups.forEach(function (group) {
    if (Array.isArray(saved)) {
      group.open = saved.includes(group.dataset.docsGroup) || !!group.querySelector('[aria-current="page"]');
    }
  });
  groups.forEach(function (group) {
    var previousOpen = group.open;
    group.addEventListener('toggle', function () {
      if (group.open === previousOpen) return;
      previousOpen = group.open;
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(groups.filter(function (item) {
          return item.open;
        }).map(function (item) { return item.dataset.docsGroup; })));
      } catch (_) {}
    });
  });

  function resizeNavigation() { navigation.open = !mobile.matches; }
  resizeNavigation();
  mobile.addEventListener('change', resizeNavigation);
  navigation.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && mobile.matches && navigation.open) {
      navigation.open = false;
      navigation.querySelector('summary').focus();
    }
  });
}());
