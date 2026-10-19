// Runs before the stylesheet paints, so a saved colourway shows with no flash.
(function () {
  try {
    var t = localStorage.getItem('lifequest:theme');
    if (t && /^[a-z]+$/.test(t)) document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked */ }
})();
