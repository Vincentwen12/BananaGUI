(function () {
  try {
    var requested = new URLSearchParams(location.search).get('theme');
    if (requested === 'light' || requested === 'dark' || requested === 'system') {
      if (requested === 'system') {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.setAttribute('data-theme-source', 'system');
      } else {
        document.documentElement.setAttribute('data-theme', requested);
      }
      return;
    }
    var saved = localStorage.getItem('banana-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (saved === 'system') {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.setAttribute('data-theme-source', 'system');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
