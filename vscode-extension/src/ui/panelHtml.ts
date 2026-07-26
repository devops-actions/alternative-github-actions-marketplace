import type * as vscode from 'vscode';

/**
 * Markup for the marketplace panel.
 *
 * Everything is inline behind a nonce-based CSP: the panel has no external
 * assets and no build step of its own, which keeps the bundle to a single file.
 */

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}

export function getPanelHtml(webview: vscode.Webview): string {
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
  :root {
    --gap: 12px;
    --radius: 6px;
  }

  body {
    margin: 0;
    padding: 16px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: transparent;
  }

  h1 {
    font-size: 1.3em;
    font-weight: 600;
    margin: 0 0 4px;
  }

  .subtitle {
    color: var(--vscode-descriptionForeground);
    margin: 0 0 var(--gap);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  button {
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: 1px solid transparent;
    border-radius: 2px;
    padding: 3px 10px;
    cursor: pointer;
  }

  button:hover { background: var(--vscode-button-hoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

  button.secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

  button.link {
    background: none;
    color: var(--vscode-textLink-foreground);
    padding: 0;
    border: none;
    text-decoration: none;
  }
  button.link:hover { text-decoration: underline; background: none; }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--gap);
    margin-bottom: 20px;
  }

  .card {
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    border-radius: var(--radius);
    padding: 10px 12px;
    background: var(--vscode-editorWidget-background);
  }

  .card .value {
    font-size: 1.5em;
    font-weight: 600;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .card .label {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    margin-top: 2px;
  }

  .card .detail {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    margin-top: 6px;
  }

  .controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: var(--gap);
  }

  input[type="text"], select {
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 4px 8px;
  }

  input[type="text"]:focus, select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  #query { flex: 1 1 260px; min-width: 180px; }

  label.check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  .result-count {
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }

  ul.results { list-style: none; margin: 0; padding: 0; }

  li.result {
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    padding: 10px 2px;
    display: flex;
    gap: var(--gap);
    align-items: baseline;
    flex-wrap: wrap;
  }

  li.result:last-child { border-bottom: none; }

  .result-main { flex: 1 1 320px; min-width: 0; }

  .result-ref {
    font-weight: 600;
    word-break: break-all;
  }

  .result-meta {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    margin-top: 3px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .sha {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.9em;
  }

  .sha.unknown {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-family: inherit;
  }

  .badge {
    font-size: 0.8em;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    white-space: nowrap;
  }

  .badge.archived {
    color: var(--vscode-editorWarning-foreground);
    border-color: var(--vscode-editorWarning-foreground);
  }

  .badge.verified {
    color: var(--vscode-charts-green, var(--vscode-terminal-ansiGreen));
    border-color: currentColor;
  }

  .result-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  .empty, .notice {
    padding: 14px;
    border: 1px dashed var(--vscode-panel-border, var(--vscode-editorWidget-border));
    border-radius: var(--radius);
    color: var(--vscode-descriptionForeground);
  }

  .notice.warning {
    border-style: solid;
    border-color: var(--vscode-editorWarning-foreground);
    color: var(--vscode-foreground);
    margin-bottom: var(--gap);
  }

  .hidden { display: none !important; }
</style>
</head>
<body>
  <h1>Alternative GitHub Actions Marketplace</h1>
  <p class="subtitle">
    <span id="freshness">Loading dataset&hellip;</span>
    <button id="refresh" class="secondary" type="button">Refresh now</button>
  </p>

  <div id="error" class="notice warning hidden"></div>

  <section class="stats" id="stats" aria-label="Dataset statistics"></section>

  <section aria-label="Search">
    <div class="controls">
      <input id="query" type="text" placeholder="Search by owner or action name, e.g. setup node" autocomplete="off" spellcheck="false" />
      <select id="type" aria-label="Action type">
        <option value="">All types</option>
        <option value="Node">Node</option>
        <option value="Docker">Docker</option>
        <option value="Composite">Composite</option>
      </select>
      <label class="check"><input id="verified" type="checkbox" /> Verified only</label>
      <label class="check"><input id="archived" type="checkbox" /> Include archived</label>
    </div>

    <div class="result-count" id="count"></div>
    <ul class="results" id="results"></ul>
    <div class="empty hidden" id="empty">No actions match this search.</div>
  </section>

<script nonce="${nonce}">
(function () {
  const vscodeApi = acquireVsCodeApi();

  const els = {
    freshness: document.getElementById('freshness'),
    refresh: document.getElementById('refresh'),
    error: document.getElementById('error'),
    stats: document.getElementById('stats'),
    query: document.getElementById('query'),
    type: document.getElementById('type'),
    verified: document.getElementById('verified'),
    archived: document.getElementById('archived'),
    count: document.getElementById('count'),
    results: document.getElementById('results'),
    empty: document.getElementById('empty')
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
    if (!stats) {
      return;
    }

    const types = Object.entries(stats.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => type + ' ' + number(count))
      .join(' \\u00b7 ');

    const shaPercent = stats.withLatestVersion > 0
      ? Math.round((stats.withSha / stats.withLatestVersion) * 100)
      : 0;

    els.stats.appendChild(card(number(stats.total), 'actions in the dataset', types));
    els.stats.appendChild(card(number(stats.withLatestVersion), 'with a published version',
      number(stats.total - stats.withLatestVersion) + ' have no release or tag'));
    els.stats.appendChild(card(number(stats.withSha), 'with a commit SHA',
      shaPercent + '% of versioned actions can be SHA-pinned'));
    els.stats.appendChild(card(number(stats.verified), 'verified owners'));
    els.stats.appendChild(card(number(stats.archived), 'archived repositories',
      'avoid recommending these'));
    els.stats.appendChild(card(number(stats.withOssf), 'with an OpenSSF score',
      stats.averageOssfScore === null ? undefined : 'average ' + stats.averageOssfScore));

    if (status && status.generatedAt) {
      els.stats.appendChild(card(status.age.replace(' ago', ''), 'dataset age',
        'generated ' + status.generatedAt));
    }
  }

  function renderResults(payload) {
    els.results.replaceChildren();

    const hasQuery = payload.query && payload.query.trim().length > 0;
    if (payload.rows.length === 0) {
      els.empty.classList.toggle('hidden', !hasQuery);
      els.count.textContent = hasQuery ? '' : 'Type to search the dataset.';
      return;
    }

    els.empty.classList.add('hidden');
    els.count.textContent = payload.truncated
      ? 'Showing the first ' + payload.rows.length + ' matches. Narrow the search to see fewer.'
      : payload.rows.length + ' match' + (payload.rows.length === 1 ? '' : 'es') + '.';

    for (const row of payload.rows) {
      const item = document.createElement('li');
      item.className = 'result';

      const main = document.createElement('div');
      main.className = 'result-main';

      const heading = document.createElement('div');
      heading.className = 'result-ref';
      heading.textContent = row.ref;
      if (row.latestVersion) {
        const version = document.createElement('span');
        version.textContent = ' @' + row.latestVersion;
        heading.appendChild(version);
      }
      if (row.verified) {
        const badge = document.createElement('span');
        badge.className = 'badge verified';
        badge.textContent = 'verified';
        heading.append(' ', badge);
      }
      if (row.archived) {
        const badge = document.createElement('span');
        badge.className = 'badge archived';
        badge.textContent = 'archived';
        heading.append(' ', badge);
      }
      main.appendChild(heading);

      const meta = document.createElement('div');
      meta.className = 'result-meta';

      const sha = document.createElement('span');
      if (row.shortSha) {
        sha.className = 'sha';
        sha.textContent = row.shortSha;
        sha.title = row.latestSha;
      } else {
        sha.className = 'sha unknown';
        sha.textContent = 'no commit SHA in dataset';
      }
      meta.appendChild(sha);

      const published = document.createElement('span');
      published.textContent = row.publishedAt
        ? 'published ' + row.publishedAt.slice(0, 10)
        : 'publish date unknown';
      meta.appendChild(published);

      if (row.actionType) {
        const type = document.createElement('span');
        type.textContent = row.actionType;
        meta.appendChild(type);
      }

      const dependents = document.createElement('span');
      dependents.textContent = number(row.dependents) + ' dependents';
      meta.appendChild(dependents);

      if (typeof row.ossfScore === 'number') {
        const score = document.createElement('span');
        score.textContent = 'OpenSSF ' + row.ossfScore;
        meta.appendChild(score);
      }

      main.appendChild(meta);
      item.appendChild(main);

      const actions = document.createElement('div');
      actions.className = 'result-actions';

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'secondary';
      copyButton.textContent = row.shortSha ? 'Copy SHA-pinned ref' : 'Copy ref';
      copyButton.title = row.pinnedRef;
      copyButton.addEventListener('click', () => {
        vscodeApi.postMessage({ type: 'copy', value: row.pinnedRef });
      });
      actions.appendChild(copyButton);

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'link';
      openButton.textContent = 'Open details';
      openButton.addEventListener('click', () => {
        vscodeApi.postMessage({ type: 'open', url: row.url });
      });
      actions.appendChild(openButton);

      item.appendChild(actions);
      els.results.appendChild(item);
    }
  }

  function search() {
    vscodeApi.postMessage({
      type: 'search',
      query: els.query.value,
      filters: {
        actionType: els.type.value,
        verifiedOnly: els.verified.checked,
        includeArchived: els.archived.checked
      }
    });
  }

  let debounce;
  function scheduleSearch() {
    clearTimeout(debounce);
    debounce = setTimeout(search, 150);
  }

  els.query.addEventListener('input', scheduleSearch);
  els.type.addEventListener('change', search);
  els.verified.addEventListener('change', search);
  els.archived.addEventListener('change', search);
  els.refresh.addEventListener('click', () => {
    els.refresh.disabled = true;
    vscodeApi.postMessage({ type: 'refresh' });
  });

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
        els.freshness.textContent = number(status.count) + ' actions \\u00b7 generated ' + status.age
          + ' \\u00b7 synced ' + (status.lastSyncedAt ? status.lastSyncedAt.slice(0, 16).replace('T', ' ') + ' UTC' : 'never');
      }

      if (status.lastError) {
        els.error.textContent = 'Last refresh failed: ' + status.lastError;
        els.error.classList.remove('hidden');
      } else {
        els.error.classList.add('hidden');
      }

      renderStats(message.stats, status);
      if (status.ready && !els.count.textContent) {
        search();
      }
    } else if (message.type === 'results') {
      renderResults(message);
    }
  });

  vscodeApi.postMessage({ type: 'ready' });
}());
</script>
</body>
</html>`;
}
