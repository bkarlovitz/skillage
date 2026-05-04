<script lang="ts">
  import { onMount } from 'svelte';
  import { findSkillById } from './lib/detail';
  import { fixtureScenarios, getFixtureScenario, skillItemsFromFixtureScenario, type InventoryFixtureScenarioId } from './lib/inventory/fixtures';
  import { createEmptyScanSummary, type ScanSummary } from './lib/inventory/scan';
  import { capabilityClients } from './lib/inventory/types';
  import { runtimeLabel, scanRoot, scanStandardLocations } from './lib/native';
  import { paginate, sortSkillItems, type SortDirection, type SortKey } from './lib/table';
  import { applyTheme, getStoredTheme, resolveTheme, storeTheme, systemPrefersDark, type ThemePreference } from './lib/theme';
  import type { SkillItem, SkillTarget } from './lib/types';

  const targets: Array<'all' | SkillTarget> = ['all', 'claude-code', 'claude-desktop', 'codex', 'hermes', 'openclaw', 'cursor', 'generic'];
  const themeOptions: ThemePreference[] = ['system', 'light', 'dark'];
  const pageSizeOptions = [25, 50, 100];
  type AppMode = 'machine' | 'project' | 'clients' | 'cross-client' | 'detail';
  const defaultFixtureScenarioId: InventoryFixtureScenarioId = 'full-machine';
  const defaultFixtureScenario = getFixtureScenario(defaultFixtureScenarioId);
  const defaultFixtureItems = skillItemsFromFixtureScenario(defaultFixtureScenarioId);

  let items = $state<SkillItem[]>(defaultFixtureItems);
  let selectedId = $state(defaultFixtureItems[0]?.id ?? '');
  let activeFixtureScenarioId = $state<InventoryFixtureScenarioId>(defaultFixtureScenarioId);
  let activeScanSummary = $state<ScanSummary>(defaultFixtureScenario.summary);
  let dataSourceLabel = $state(`Fixture: ${defaultFixtureScenario.label}`);
  let query = $state('');
  let target = $state<'all' | SkillTarget>('all');
  let mode = $state<AppMode>('machine');
  let scanRootPath = $state('');
  let scanStatus = $state('');
  let advancedScanOpen = $state(false);
  let themePreference = $state<ThemePreference>('system');
  let page = $state(1);
  let pageSize = $state(25);
  let sortKey = $state<SortKey>('name');
  let sortDirection = $state<SortDirection>('asc');
  let includeInternalArtifacts = $state(false);
  const currentRuntime = runtimeLabel();

  const filtered = $derived(items.filter((item) => {
    const haystack = `${item.name} ${item.description} ${item.path} ${item.body} ${item.target} ${item.kind} ${item.scope} ${item.origin ?? ''} ${item.category ?? ''} ${item.container ?? ''}`.toLowerCase();
    const internalArtifact = item.scope === 'cache' || item.scope === 'temporary' || item.origin === 'cache' || item.origin === 'temporary';
    return (target === 'all' || item.target === target)
      && (includeInternalArtifacts || !internalArtifact)
      && haystack.includes(query.toLowerCase());
  }));

  const sorted = $derived(sortSkillItems(filtered, sortKey, sortDirection));
  const pageResult = $derived(paginate(sorted, { page, pageSize }));
  const visibleRows = $derived(pageResult.rows);
  const selected = $derived(findSkillById(items, selectedId));
  const issueCount = $derived(items.reduce((total, item) => total + item.issues.length, 0));
  const scanIssueCount = $derived(activeScanSummary.readErrors.length + activeScanSummary.parseErrors.length + activeScanSummary.skippedSensitiveStores.length + activeScanSummary.warnings.length);
  const sourceModeLabel = $derived(activeScanSummary.dataSource === 'fixture' ? 'Fixture/demo' : 'Local scan');
  const targetCounts = $derived(items.reduce<Record<string, number>>((counts, item) => {
    counts[item.target] = (counts[item.target] ?? 0) + 1;
    return counts;
  }, {}));
  const projectRows = $derived(items.filter((item) => {
    const statuses = Array.isArray(item.metadata.statuses) ? item.metadata.statuses.map(String) : [String(item.metadata.status ?? '')];
    return item.scope === 'project-shared'
      || item.scope === 'local-private'
      || statuses.includes('inherited')
      || statuses.includes('likely-active')
      || statuses.includes('needs-review');
  }));
  const clientSummaries = $derived(capabilityClients.map((client) => {
    const resources = items.filter((item) => item.target === client);
    const locations = activeScanSummary.knownClientLocations.filter((location) => location.client === client);
    return {
      client,
      resources,
      locations,
      found: resources.some((item) => item.metadata.status !== 'not-found') || locations.some((location) => location.exists)
    };
  }));
  const crossClientGroups = $derived(Object.values(items.reduce<Record<string, { key: string; name: string; kind: string; rows: SkillItem[]; clients: string[]; scopes: string[]; warnings: number }>>((groups, item) => {
    const key = `${item.name.toLowerCase()}::${item.kind}`;
    const group = groups[key] ?? {
      key,
      name: item.name,
      kind: item.kind,
      rows: [],
      clients: [],
      scopes: [],
      warnings: 0
    };
    group.rows.push(item);
    group.clients = Array.from(new Set([...group.clients, item.target]));
    group.scopes = Array.from(new Set([...group.scopes, item.scope]));
    group.warnings += item.issues.length;
    groups[key] = group;
    return groups;
  }, {})).sort((a, b) => b.clients.length - a.clients.length || a.name.localeCompare(b.name)));

  function selectItem(id: string) {
    selectedId = id;
    mode = 'detail';
  }

  function backToInventory() {
    mode = 'machine';
  }

  function resetPageAndSelection(rows: SkillItem[] = sorted) {
    page = 1;
    if (!rows.some((item) => item.id === selectedId)) {
      selectedId = rows[0]?.id ?? '';
    }
  }

  function changeTarget(nextTarget: 'all' | SkillTarget) {
    target = nextTarget;
    resetPageAndSelection(items.filter((item) => nextTarget === 'all' || item.target === nextTarget));
  }

  function updateQuery(value: string) {
    query = value;
    page = 1;
  }

  function sortLabel(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = key === 'issues' ? 'desc' : 'asc';
    }
    page = 1;
  }

  function goToPage(nextPage: number) {
    page = Math.min(Math.max(1, nextPage), pageResult.pageCount);
    const firstVisible = paginate(sorted, { page, pageSize }).rows[0];
    if (firstVisible) selectedId = firstVisible.id;
  }

  function updatePageSize(value: string) {
    pageSize = Number(value);
    page = 1;
    selectedId = sorted[0]?.id ?? '';
  }

  function setTheme(preference: ThemePreference) {
    themePreference = preference;
    const resolved = resolveTheme(preference, systemPrefersDark());
    applyTheme(document.documentElement, resolved);
    storeTheme(window.localStorage, preference);
  }

  function setRows(nextItems: SkillItem[]) {
    items = nextItems;
    selectedId = nextItems[0]?.id ?? '';
    page = 1;
  }

  function loadFixtureScenario(id: InventoryFixtureScenarioId) {
    const scenario = getFixtureScenario(id);
    activeFixtureScenarioId = scenario.id;
    activeScanSummary = scenario.summary;
    dataSourceLabel = `Fixture: ${scenario.label}`;
    target = 'all';
    setRows(skillItemsFromFixtureScenario(scenario.id));
    scanStatus = `${scenario.label} fixture loaded. No local scan ran.`;
  }

  async function scanStandard() {
    scanStatus = 'Scanning standard local skill locations...';
    try {
      const discovered = await scanStandardLocations();
      activeScanSummary = createEmptyScanSummary({
        id: 'local-standard-scan',
        generatedAt: new Date().toISOString(),
        dataSource: 'local-scan',
        scanRoots: [{
          path: 'standard locations',
          label: 'Standard local locations',
          status: 'scanned',
          evidence: {
            sourceLabel: 'Standard local locations',
            scannerRule: 'standard-locations',
            matchedPathPattern: 'known client homes and current working directory',
            readStatus: 'read',
            parseStatus: 'not-applicable'
          }
        }]
      });
      dataSourceLabel = 'Local scan: standard locations';
      target = 'all';
      setRows(discovered);
      scanStatus = discovered.length ? `Loaded ${discovered.length} asset(s) from standard locations.` : 'No local standard-location capabilities found.';
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Standard-location scan failed.';
    }
  }

  async function scanNativeRoot() {
    scanStatus = 'Scanning selected root...';
    try {
      const discovered = await scanRoot(scanRootPath.trim());
      activeScanSummary = createEmptyScanSummary({
        id: 'local-root-scan',
        generatedAt: new Date().toISOString(),
        dataSource: 'local-scan',
        scanRoots: [{
          path: scanRootPath.trim(),
          label: 'Selected scan root',
          status: 'scanned',
          evidence: {
            sourcePath: scanRootPath.trim(),
            scannerRule: 'selected-root',
            matchedPathPattern: scanRootPath.trim(),
            readStatus: 'read',
            parseStatus: 'not-applicable'
          }
        }]
      });
      dataSourceLabel = `Local scan: ${scanRootPath.trim()}`;
      target = 'all';
      setRows(discovered);
      scanStatus = discovered.length ? `Loaded ${discovered.length} asset(s).` : 'No matching capabilities found in the selected root.';
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Native scan failed.';
    }
  }

  onMount(() => {
    themePreference = getStoredTheme(window.localStorage);
    applyTheme(document.documentElement, resolveTheme(themePreference, systemPrefersDark()));

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (themePreference === 'system') {
        applyTheme(document.documentElement, resolveTheme('system', systemPrefersDark()));
      }
    };
    media?.addEventListener('change', handleSystemThemeChange);

    return () => media?.removeEventListener('change', handleSystemThemeChange);
  });
</script>

<svelte:head>
  <title>Skillage</title>
  <meta name="description" content="Local-first skill and rule management for coding agents" />
</svelte:head>

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="mark" aria-hidden="true">S</div>
      <div>
        <h1>Skillage</h1>
        <p>Local-first skill management</p>
      </div>
    </div>

    <nav class="tabs" aria-label="Primary">
      <button class:active={mode === 'machine' || mode === 'detail'} onclick={() => (mode = 'machine')}>Machine Inventory</button>
      <button class:active={mode === 'project'} onclick={() => (mode = 'project')}>Project Inventory</button>
      <button class:active={mode === 'clients'} onclick={() => (mode = 'clients')}>Clients</button>
      <button class:active={mode === 'cross-client'} onclick={() => (mode = 'cross-client')}>Cross-Client</button>
    </nav>

    <section class="sidebar-section" aria-labelledby="sources-heading">
      <div class="section-heading" id="sources-heading">Sources</div>
      <button class:active={target === 'all'} class="source-row" onclick={() => changeTarget('all')}>
        <span>All assets</span><strong>{items.length}</strong>
      </button>
      {#each targets.filter((option) => option !== 'all') as option}
        <button class:active={target === option} class="source-row" onclick={() => changeTarget(option)}>
          <span>{option}</span><strong>{targetCounts[option] ?? 0}</strong>
        </button>
      {/each}
    </section>

    <section class="sidebar-section compact" aria-label="Summary">
      <div class="metric-row"><span>Data</span><strong>{sourceModeLabel}</strong></div>
      <div class="metric-row"><span>Visible</span><strong>{filtered.length}</strong></div>
      <div class="metric-row"><span>Validation issues</span><strong>{issueCount}</strong></div>
      <div class="metric-row"><span>Scan caveats</span><strong>{scanIssueCount}</strong></div>
      <div class="metric-row"><span>License</span><strong>MIT</strong></div>
    </section>

    <section class="sidebar-section compact" aria-label="Appearance">
      <label class="field">
        <span>Theme</span>
        <select bind:value={themePreference} onchange={() => setTheme(themePreference)}>
          {#each themeOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    </section>

    <div class="runtime-note">
      <strong>{currentRuntime}</strong>
      <p>Desktop scans use narrow Tauri/Rust commands. Browser dev scans use the local Vite bridge.</p>
    </div>
  </aside>

  <main class="main">
    {#if mode === 'machine'}
      <section class="topbar">
        <div>
          <p class="eyebrow">Machine Inventory</p>
          <h2>Local capability inventory</h2>
          <p>Normalized across Claude Code, Claude Desktop, Codex, Cursor, Hermes, and OpenClaw.</p>
        </div>
        <div class="topbar-actions">
          <label class="field demo-scenario-field">
            <span>Demo scenario</span>
            <select value={activeFixtureScenarioId} onchange={(event) => loadFixtureScenario(event.currentTarget.value as InventoryFixtureScenarioId)}>
              {#each fixtureScenarios as scenario}
                <option value={scenario.id}>{scenario.label}</option>
              {/each}
            </select>
          </label>
          <button class="button secondary" onclick={() => (advancedScanOpen = !advancedScanOpen)}>{advancedScanOpen ? 'Hide scan root' : 'Advanced scan'}</button>
          <button class="button secondary" onclick={scanStandard}>Scan standard locations</button>
        </div>
      </section>

      <p class="status-line data-source-line"><strong>{sourceModeLabel}</strong><span>{dataSourceLabel}</span></p>

      <section class="filters" aria-label="Inventory filters">
        <label class="field search-field">
          <span>Search</span>
          <input value={query} oninput={(event) => updateQuery(event.currentTarget.value)} placeholder="Search names, paths, descriptions, body..." />
        </label>
        <label class="toggle-field">
          <input type="checkbox" bind:checked={includeInternalArtifacts} onchange={() => resetPageAndSelection()} />
          <span>Include cache/temp artifacts</span>
        </label>
      </section>

      {#if advancedScanOpen}
        <section class="scan-panel" aria-label="Local scanner">
          <label class="field inline">
            <span>Scan root</span>
            <input bind:value={scanRootPath} placeholder="/home/you/project, /home/you/.claude, or \\wsl.localhost\\Ubuntu\\home\\you" />
          </label>
          <button class="button secondary" onclick={scanNativeRoot} disabled={!scanRootPath.trim()}>Scan root</button>
        </section>
      {/if}

      {#if scanStatus}<p class="status-line">{scanStatus}</p>{/if}

      <section class="inventory-table-page">
        <section class="table-panel" aria-label="Skill inventory">
          <div class="table-toolbar">
            <div>
              <strong>{pageResult.total} asset{pageResult.total === 1 ? '' : 's'}</strong>
              <span>Showing {pageResult.start}–{pageResult.end} of {pageResult.total}</span>
            </div>
            <label class="page-size-control">
              <span>Rows</span>
              <select value={pageSize} onchange={(event) => updatePageSize(event.currentTarget.value)}>
                {#each pageSizeOptions as option}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="table-scroll" role="region" aria-label="Skill inventory table">
            <table class="inventory-table">
              <thead>
                <tr>
                  <th class="name-column" scope="col" aria-sort={ariaSort('name')}>
                    <button class="sort-header" onclick={() => toggleSort('name')}>Name <span>{sortLabel('name')}</span></button>
                  </th>
                  <th class="target-column" scope="col" aria-sort={ariaSort('target')}>
                    <button class="sort-header" onclick={() => toggleSort('target')}>Source <span>{sortLabel('target')}</span></button>
                  </th>
                  <th class="kind-column" scope="col" aria-sort={ariaSort('kind')}>
                    <button class="sort-header" onclick={() => toggleSort('kind')}>Kind <span>{sortLabel('kind')}</span></button>
                  </th>
                  <th class="scope-column" scope="col" aria-sort={ariaSort('scope')}>
                    <button class="sort-header" onclick={() => toggleSort('scope')}>Scope <span>{sortLabel('scope')}</span></button>
                  </th>
                  <th class="origin-column" scope="col" aria-sort={ariaSort('origin')}>
                    <button class="sort-header" onclick={() => toggleSort('origin')}>Origin <span>{sortLabel('origin')}</span></button>
                  </th>
                  <th class="category-column" scope="col" aria-sort={ariaSort('category')}>
                    <button class="sort-header" onclick={() => toggleSort('category')}>Category <span>{sortLabel('category')}</span></button>
                  </th>
                  <th class="issues-column" scope="col" aria-sort={ariaSort('issues')}>
                    <button class="sort-header" onclick={() => toggleSort('issues')}>Issues <span>{sortLabel('issues')}</span></button>
                  </th>
                  <th class="path-column" scope="col" aria-sort={ariaSort('path')}>
                    <button class="sort-header" onclick={() => toggleSort('path')}>Path <span>{sortLabel('path')}</span></button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {#each visibleRows as item (item.id)}
                  <tr>
                    <td>
                      <button class="table-name-button" onclick={() => selectItem(item.id)} aria-label={`Open details for ${item.name}`}>
                        <strong>{item.name}</strong>
                        <span>{item.description}</span>
                      </button>
                    </td>
                    <td><span class="badge">{item.target}</span></td>
                    <td>{item.kind}</td>
                    <td>{item.scope}</td>
                    <td>{item.origin ?? '—'}</td>
                    <td>{item.category ?? item.container ?? '—'}</td>
                    <td>
                      {#if item.issues.length}
                        <span class="issue-badge table-issue-badge">{item.issues.length}</span>
                      {:else}
                        <span class="zero-issues">0</span>
                      {/if}
                    </td>
                    <td><code class="table-path">{item.path}</code></td>
                  </tr>
                {:else}
                  <tr>
                    <td colspan="8"><div class="empty table-empty">No matching skills or rules. Clear search or switch source.</div></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="pagination-bar" aria-label="Pagination">
            <span>Page {pageResult.page} of {pageResult.pageCount}</span>
            <div class="pagination-controls">
              <button class="button ghost compact" disabled={pageResult.page <= 1} onclick={() => goToPage(1)}>First</button>
              <button class="button ghost compact" disabled={pageResult.page <= 1} onclick={() => goToPage(pageResult.page - 1)}>Previous</button>
              <button class="button ghost compact" disabled={pageResult.page >= pageResult.pageCount} onclick={() => goToPage(pageResult.page + 1)}>Next</button>
              <button class="button ghost compact" disabled={pageResult.page >= pageResult.pageCount} onclick={() => goToPage(pageResult.pageCount)}>Last</button>
            </div>
          </div>
        </section>
      </section>
    {:else if mode === 'project'}
      <section class="topbar">
        <div>
          <p class="eyebrow">Project Inventory</p>
          <h2>{activeScanSummary.selectedProject?.displayName ?? 'Selected project'}</h2>
          <p>{activeScanSummary.selectedProject?.rootPath ?? 'Fixture scenarios can include a selected project context; local scans currently show root-level capability matches.'}</p>
        </div>
      </section>

      <section class="panel">
        <div class="table-toolbar embedded">
          <div>
            <strong>{projectRows.length} project-relevant resource{projectRows.length === 1 ? '' : 's'}</strong>
            <span>Includes project-shared, local/private, inherited, likely active, and needs-review records.</span>
          </div>
        </div>
        <div class="resource-list">
          {#each projectRows as item (item.id)}
            <button class="resource-row" onclick={() => selectItem(item.id)}>
              <span>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
              <span class="resource-meta"><span class="badge">{item.target}</span><span>{item.scope}</span><span>{item.metadata.status}</span></span>
            </button>
          {:else}
            <div class="empty">No project-scoped or inherited capability resources in this data set.</div>
          {/each}
        </div>
      </section>
    {:else if mode === 'clients'}
      <section class="topbar">
        <div>
          <p class="eyebrow">Clients</p>
          <h2>Supported client coverage</h2>
          <p>Client cards combine known locations with normalized resources from the active fixture or local scan.</p>
        </div>
      </section>

      <section class="client-grid">
        {#each clientSummaries as summary}
          <article class="client-card">
            <div class="client-card-header">
              <h3>{summary.client}</h3>
              <span class:ok-status={summary.found} class="client-status">{summary.found ? 'found' : 'not found'}</span>
            </div>
            <dl class="meta compact-meta">
              <div><dt>Resources</dt><dd>{summary.resources.length}</dd></div>
              <div><dt>Known locations</dt><dd>{summary.locations.length}</dd></div>
            </dl>
            <div class="resource-list compact-list">
              {#each summary.resources.slice(0, 4) as item (item.id)}
                <button class="resource-row compact-row" onclick={() => selectItem(item.id)}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.kind} · {item.scope}</small>
                  </span>
                </button>
              {:else}
                <div class="empty small-empty">No resources in this data set.</div>
              {/each}
            </div>
          </article>
        {/each}
      </section>
    {:else if mode === 'cross-client'}
      <section class="topbar">
        <div>
          <p class="eyebrow">Cross-Client</p>
          <h2>Capability groups</h2>
          <p>Resources are grouped by normalized name and type so duplicate names can be compared without assuming they are identical.</p>
        </div>
      </section>

      <section class="panel">
        <div class="table-scroll cross-client-scroll" role="region" aria-label="Cross-client capability groups">
          <table class="inventory-table">
            <thead>
              <tr>
                <th class="name-column" scope="col">Capability</th>
                <th class="kind-column" scope="col">Type</th>
                <th scope="col">Clients</th>
                <th scope="col">Scopes</th>
                <th class="issues-column" scope="col">Issues</th>
              </tr>
            </thead>
            <tbody>
              {#each crossClientGroups as group (group.key)}
                <tr>
                  <td><strong>{group.name}</strong></td>
                  <td>{group.kind}</td>
                  <td>{group.clients.join(', ')}</td>
                  <td>{group.scopes.join(', ')}</td>
                  <td>{group.warnings}</td>
                </tr>
              {:else}
                <tr>
                  <td colspan="5"><div class="empty table-empty">No capability groups in this data set.</div></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {:else if mode === 'detail'}
      <section class="detail-page">
        <button class="button ghost back-button" onclick={backToInventory}>← Back to inventory</button>
        {#if selected}
          <article class="detail full-detail">
            <div class="detail-header">
              <div>
                <div class="detail-kicker"><span class="badge large">{selected.target}</span><span>{selected.kind}</span><span>{selected.scope}</span></div>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
              <button class="button ghost" onclick={() => navigator.clipboard?.writeText(selected.path)}>Copy path</button>
            </div>

            <dl class="meta detail-meta">
              <div><dt>Kind</dt><dd>{selected.kind}</dd></div>
              <div><dt>Scope</dt><dd>{selected.scope}</dd></div>
              <div><dt>Origin</dt><dd>{selected.origin ?? '—'}</dd></div>
              <div><dt>Category</dt><dd>{selected.category ?? '—'}</dd></div>
              <div><dt>Container</dt><dd>{selected.container ?? '—'}</dd></div>
              <div><dt>Entry</dt><dd>{selected.entryFile ?? 'single file'}</dd></div>
              <div><dt>Path</dt><dd>{selected.path}</dd></div>
            </dl>

            <section class="detail-section">
              <h3>Validation</h3>
              {#if selected.issues.length}
                <ul class="issues">
                  {#each selected.issues as issue}
                    <li class={issue.severity}><strong>{issue.severity}</strong><span>{issue.message}</span></li>
                  {/each}
                </ul>
              {:else}
                <p class="ok">No validation issues detected.</p>
              {/if}
            </section>

            <section class="detail-section">
              <h3>Body preview</h3>
              <pre>{selected.body}</pre>
            </section>
          </article>
        {:else}
          <div class="empty detail-empty">
            <strong>Skill not found.</strong>
            <span>The selected skill may have disappeared after a scan. Return to the inventory and choose another asset.</span>
          </div>
        {/if}
      </section>
    {/if}
  </main>
</div>
