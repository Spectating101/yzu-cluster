import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-location-provider-direct";

const FOLDER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

function folderRow(name, sub, pill) {
  return `<li><button type="button" class="row" data-kind="folder"><span class="rd-v2-row-icon">${FOLDER_ICON}</span><span class="text"><span class="row-title">${name}</span><span class="row-sub">${sub}</span></span><span class="rd-v2-pill muted">${pill}</span></button></li>`;
}

async function setup(page) {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockV2Api(page);
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-folders-root").click();
  await expect(page.getByTestId("library-directory")).toBeVisible();

  await page.addStyleTag({ content: `
    .rd-v2-library-location-filter { display:none !important; }
    .rd-v2-library-location-direct { display:grid; gap:4px; min-width:max-content; }
    .rd-v2-library-location-direct > span { color:var(--rd-muted); font-family:var(--rd-mono); font-size:8px; font-weight:750; letter-spacing:.055em; text-transform:uppercase; }
    .rd-v2-library-location-direct-options { display:inline-flex; align-items:center; min-height:29px; overflow:hidden; border:1px solid var(--rd-border2); border-radius:6px; background:rgba(255,255,255,.58); }
    .rd-v2-library-location-direct-options button { min-height:27px; padding:0 10px; border:0; border-left:1px solid var(--rd-border); background:transparent; color:var(--rd-body); font:inherit; font-size:10px; cursor:pointer; }
    .rd-v2-library-location-direct-options button:first-child { border-left:0; }
    .rd-v2-library-location-direct-options button.active { background:var(--rd-active-bg); color:var(--rd-text); font-weight:720; box-shadow:inset 0 0 0 1px rgba(39,84,133,.12); }
    .rd-v2-library-location-direct-options button:disabled { color:var(--rd-muted); opacity:.38; cursor:not-allowed; background:rgba(38,52,72,.025); }
    .rd-v2-library-location-direct-options button.connected:not(.active) { color:var(--rd-body); opacity:1; }
    .rd-v2-provider-note { display:inline-flex; align-items:center; gap:6px; margin-left:6px; color:var(--rd-muted); font-family:var(--rd-mono); font-size:9px; }
    .rd-v2-provider-note::before { content:""; width:6px; height:6px; border-radius:50%; background:#6d8b78; }
  `});
}

async function setDirectChrome(page, { active = "all", googleConnected = false, dropboxConnected = false }) {
  await page.evaluate(({ active, googleConnected, dropboxConnected }) => {
    document.querySelector('[data-testid="location-direct-prototype"]')?.remove();
    const filters = document.querySelector('.rd-v2-library-toolbar-filters');
    const wrap = document.createElement('div');
    wrap.className = 'rd-v2-library-location-direct';
    wrap.dataset.testid = 'location-direct-prototype';
    wrap.innerHTML = `<span>Location</span><div class="rd-v2-library-location-direct-options" role="group" aria-label="Folder location"><button data-loc="all">All</button><button data-loc="google_drive">Google Drive</button><button data-loc="dropbox">Dropbox</button></div>`;
    filters?.appendChild(wrap);
    for (const button of wrap.querySelectorAll('button')) {
      const loc = button.dataset.loc;
      button.classList.toggle('active', loc === active);
      if (loc === 'google_drive') {
        button.disabled = !googleConnected;
        button.classList.toggle('connected', googleConnected);
      }
      if (loc === 'dropbox') {
        button.disabled = !dropboxConnected;
        button.classList.toggle('connected', dropboxConnected);
      }
    }
  }, { active, googleConnected, dropboxConnected });
}

async function setProviderDirectory(page, { provider, path, folders, assetCount = 0 }) {
  await page.evaluate(({ provider, path, folders, assetCount, folderIcon }) => {
    const breadcrumb = document.querySelector('.rd-v2-breadcrumb');
    if (breadcrumb) {
      const parts = ['Library', 'Folders', provider, ...path];
      breadcrumb.innerHTML = parts.map((name, index) => {
        const last = index === parts.length - 1;
        return `<span class="rd-v2-crumb-item">${index ? '<span class="sep">›</span>' : ''}${last ? `<span class="here">${name}</span>` : `<button type="button">${name}</button>`}</span>`;
      }).join('');
    }

    const current = path.length ? path[path.length - 1] : provider;
    const pathcopy = document.querySelector('.rd-v2-library-pathcopy');
    if (pathcopy) {
      pathcopy.querySelector('strong').textContent = current;
      pathcopy.querySelector('p').textContent = path.length
        ? `Indexed ${provider} directory · ${folders.length} child folders`
        : `Connected ${provider} account · browse its indexed directory without leaving Library`;
    }
    const stats = document.querySelector('.rd-v2-library-pathstats');
    if (stats) stats.innerHTML = `<span>${folders.length} folder${folders.length === 1 ? '' : 's'}</span><span>${assetCount} indexed asset${assetCount === 1 ? '' : 's'}</span><span>${provider} connected</span>`;

    const listWrap = document.querySelector('[data-testid="library-directory"]');
    if (listWrap) {
      listWrap.innerHTML = `<ul class="rd-v2-catalog rd-v2-catalog-list" aria-label="Catalog">${folders.map((folder) => `<li><button type="button" class="row" data-kind="folder"><span class="rd-v2-row-icon">${folderIcon}</span><span class="text"><span class="row-title">${folder.name}</span><span class="row-sub">${folder.sub}</span></span><span class="rd-v2-pill muted">${folder.pill}</span></button></li>`).join('')}</ul>`;
    }

    const rail = document.querySelector('.rd-v2-library-folder-inspector');
    if (rail) {
      const summary = rail.querySelector('.rd-v2-library-folder-summary .rd-v2-rail-section-label');
      if (summary) summary.textContent = `${provider} folder storage`;
      const h3 = rail.querySelector('.rd-v2-library-folder-summary h3');
      if (h3) h3.textContent = `${assetCount} indexed asset${assetCount === 1 ? '' : 's'}`;
      const contextLabel = rail.querySelector('.rd-v2-library-folder-context .rd-v2-rail-section-label');
      if (contextLabel) contextLabel.textContent = 'Scope & location';
      const note = rail.querySelector('.rd-v2-library-folder-context .rd-v2-rail-note');
      if (note) note.textContent = `Connected ${provider} directory. Folder names and paths come from the linked account; selecting recognized evidence still opens the canonical Library dossier.`;
    }
  }, { provider, path, folders, assetCount, folderIcon: FOLDER_ICON });
}

test('direct Location chrome shows faded disconnected providers and connected Google Drive directories', async ({ page }) => {
  await setup(page);

  await setDirectChrome(page, { active: 'all', googleConnected: false, dropboxConnected: false });
  await page.screenshot({ path: `${OUT}/01-disconnected-visible-faded-1440.png`, fullPage: false });

  await setDirectChrome(page, { active: 'google_drive', googleConnected: true, dropboxConnected: false });
  await setProviderDirectory(page, {
    provider: 'Google Drive',
    path: [],
    assetCount: 41,
    folders: [
      { name: 'My Drive', sub: 'Account-owned folders and files', pill: '34 assets' },
      { name: 'Shared with me', sub: 'Files and folders shared into this account', pill: '5 assets' },
      { name: 'Shared drives', sub: 'Organization and lab shared spaces', pill: '2 assets' },
    ],
  });
  await page.screenshot({ path: `${OUT}/02-google-drive-connected-root-1440.png`, fullPage: false });

  await setProviderDirectory(page, {
    provider: 'Google Drive',
    path: ['My Drive'],
    assetCount: 34,
    folders: [
      { name: 'Research projects', sub: 'Google Drive / My Drive / Research projects', pill: '16 assets' },
      { name: 'Thesis', sub: 'Google Drive / My Drive / Thesis', pill: '7 assets' },
      { name: 'Datasets', sub: 'Google Drive / My Drive / Datasets', pill: '6 assets' },
      { name: 'Teaching & students', sub: 'Google Drive / My Drive / Teaching & students', pill: '3 assets' },
      { name: 'Archive', sub: 'Google Drive / My Drive / Archive', pill: '2 assets' },
    ],
  });
  await page.screenshot({ path: `${OUT}/03-google-drive-my-drive-1440.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: `${OUT}/04-google-drive-my-drive-mobile.png`, fullPage: false });
});
