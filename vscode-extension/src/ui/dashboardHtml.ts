import type * as vscode from 'vscode';

/**
 * Markup for the activity bar dashboard view.
 *
 * Deliberately a slimmer view than the marketplace panel: just the aggregate
 * stats (mirroring the public "State of Actions" page) plus quick links into
 * the rest of the extension. Search results live in the full panel, not here.
 *
 * Per the data exposure policy in `Decision Records/requirements.md`,
 * vulnerability counts and other security posture signals are not surfaced
 * here even though the website's "State of Actions" page shows them.
 */

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}

export function getDashboardHtml(webview: vscode.Webview): string {
  const nonce = createNonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Actions Marketplace</title>
<style>
  body {
    margin: 0;
    padding: 12px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: transparent;
  }

  h2 {
    font-size: 1em;
    font-weight: 600;
    margin: 16px 0 8px;
  }

  h2:first-child { margin-top: 0; }

  .subtitle {
    color: var(--vscode-descriptionForeground);
    margin: 0 0 12px;
  }

  .notice {
    padding: 10px;
    border: 1px dashed var(--vscode-panel-border, var(--vscode-editorWidget-border));
    border-radius: 4px;
    color: var(--vscode-descriptionForeground);
  }

  .notice.warning {
    border-style: solid;
    border-color: var(--vscode-editorWarning-foreground);
    color: var(--vscode-foreground);
    margin-bottom: 12px;
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
  }

  .card {
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    border-radius: 4px;
    padding: 8px 10px;
    background: var(--vscode-editorWidget-background);
  }

  .card .value {
    font-size: 1.3em;
    font-weight: 600;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .card .label {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    margin-top: 2px;
  }

  .card .detail {
    color: var(--vscode-descriptionForeground);
    font-size: 0.8em;
    margin-top: 4px;
  }

  .bars { display: flex; flex-direction: column; gap: 6px; }

  .bar-row .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.85em;
    margin-bottom: 2px;
  }

  .bar-track {
    height: 6px;
    border-radius: 3px;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--vscode-charts-blue, var(--vscode-textLink-foreground));
  }

  .actions { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }

  button {
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: 1px solid transparent;
    border-radius: 2px;
    padding: 5px 10px;
    cursor: pointer;
    text-align: left;
  }

  button:hover { background: var(--vscode-button-hoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

  button.secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

  .hidden { display: none !important; }
</style>
</head>
<body>
  <p class="subtitle" id="freshness">Loading dataset&hellip;</p>

  <div id="error" class="notice warning hidden"></div>

  <h2>Key metrics</h2>
  <section class="stats" id="stats" aria-label="Dataset statistics"></section>

  <div class="notice" id="empty">No dataset cached yet. Use "Refresh dataset now" below to download it.</div>

  <h2 id="typesHeading" class="hidden">Action types</h2>
  <div class="bars" id="types"></div>

  <h2>Quick links</h2>
  <div class="actions">
    <button id="refresh" class="secondary" type="button">Refresh dataset now</button>
    <button id="explorer" type="button">Open Marketplace Explorer</button>
    <button id="search" class="secondary" type="button">Search Actions&hellip;</button>
    <button id="website" class="secondary" type="button">Open State of Actions website</button>
  </div>

<script nonce="${nonce}">
(function () {
  const vscodeApi = acquireVsCodeApi();

  const els = {
    freshness: document.getElementById('freshness'),
    error: document.getElementById('error'),
    stats: document.getElementById('stats'),
    empty: document.getElementById('empty'),
    typesHeading: document.getElementById('typesHeading'),
    types: document.getElementById('types'),
    refresh: document.getElementById('refresh'),
    explorer: document.getElementById('explorer'),
    search: document.getElementById('search'),
    website: document.getElementById('website')
  };

  const number = (value) => (typeof value === 'number' ? value.toLocaleString('en-US') : '-');

  function card(value, label, detail) {
    const node = document.createElement('div');
    node.className = 'card';

    const valueNode = document.createElement('div');
    valueNode.className = 'value';
    valueNode.textContent = value;
    node.appendChild(valueNode);

    const labelNode = document.createElement('div');
    labelNode.className = 'label';
    labelNode.textContent = label;
    node.appendChild(labelNode);

    if (detail) {
      const detailNode = document.createElement('div');
      detailNode.className = 'detail';
      detailNode.textContent = detail;
      node.appendChild(detailNode);
    }

    return node;
  }

  function renderStats(stats, status) {
    els.stats.replaceChildren();
    els.types.replaceChildren();

    if (!stats) {
      els.empty.classList.remove('hidden');
      els.typesHeading.classList.add('hidden');
      return;
    }
    els.empty.classList.add('hidden');

    const archivedPercent = stats.total > 0 ? Math.round((stats.archived / stats.total) * 100) : 0;
    const verifiedPercent = stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0;
    const ossfPercent = stats.total > 0 ? Math.round((stats.withOssf / stats.total) * 100) : 0;

    els.stats.appendChild(card(number(stats.total), 'total actions', 'in the marketplace'));
    els.stats.appendChild(card(number(stats.verified), 'verified actions', verifiedPercent + '% verified'));
    els.stats.appendChild(card(number(stats.archived), 'archived', archivedPercent + '% archived'));
    els.stats.appendChild(card(number(stats.withOssf), 'with OpenSSF score',
      ossfPercent + '% have OpenSSF data' + (stats.averageOssfScore === null ? '' : ' \\u00b7 avg ' + stats.averageOssfScore)));

    const types = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);
    if (types.length > 0) {
      els.typesHeading.classList.remove('hidden');
      for (const [type, count] of types) {
        const percent = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

        const row = document.createElement('div');
        row.className = 'bar-row';

        const label = document.createElement('div');
        label.className = 'bar-label';
        const name = document.createElement('span');
        name.textContent = type;
        const value = document.createElement('span');
        value.textContent = number(count) + ' (' + percent + '%)';
        label.appendChild(name);
        label.appendChild(value);
        row.appendChild(label);

        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = percent + '%';
        track.appendChild(fill);
        row.appendChild(track);

        els.types.appendChild(row);
      }
    } else {
      els.typesHeading.classList.add('hidden');
    }
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'state') {
      const status = message.status;
      els.refresh.disabled = status.refreshing;

      if (status.refreshing) {
        els.freshness.textContent = 'Refreshing dataset\\u2026';
      } else if (!status.ready) {
        els.freshness.textContent = 'No dataset cached yet.';
      } else {
        els.freshness.textContent = number(status.count) + ' actions \\u00b7 generated ' + status.age;
      }

      if (status.lastError) {
        els.error.textContent = 'Last refresh failed: ' + status.lastError;
        els.error.classList.remove('hidden');
      } else {
        els.error.classList.add('hidden');
      }

      renderStats(message.stats, status);
    }
  });

  els.refresh.addEventListener('click', () => {
    els.refresh.disabled = true;
    vscodeApi.postMessage({ type: 'refresh' });
  });
  els.explorer.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'openExplorer' });
  });
  els.search.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'quickSearch' });
  });
  els.website.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'openWebsite' });
  });

  vscodeApi.postMessage({ type: 'ready' });
}());
</script>
</body>
</html>`;
}
