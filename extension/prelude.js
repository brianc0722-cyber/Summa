// Runs before widget.js on every page load (via content_scripts).
// Tells the widget to show its button quietly instead of popping the
// panel open on every navigation. The toolbar icon overrides this.
window.__psumNoAutoOpen = true;
