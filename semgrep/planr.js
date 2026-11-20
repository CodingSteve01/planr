// Fixtures for semgrep/planr.yml (`npm run security:test`). Each line marked
// `ruleid` must be found, each marked `ok` must not.

// ruleid: planr-no-eval
eval(text);
// ruleid: planr-no-eval
const f = new Function('a', body);
// ruleid: planr-no-eval
setTimeout("run()", 10);
// ok: planr-no-eval
setTimeout(() => run(), 10);

// ruleid: planr-no-raw-html
el.innerHTML = name;
// ruleid: planr-no-raw-html
el.insertAdjacentHTML('beforeend', name);
// ok: planr-no-raw-html
el.textContent = name;

// ruleid: planr-no-remote-code
import('https://example.com/x.js');
// ok: planr-no-remote-code
import('./utils/demoProject.js');

// ruleid: planr-no-network-calls
fetch('/api');
// ruleid: planr-no-network-calls
new WebSocket('wss://example.com');
// ok: planr-no-network-calls
localStorage.getItem('planr_v2');
