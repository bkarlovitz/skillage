<script lang="ts">
  import { onMount } from 'svelte';
  import { findCapabilityResourceById } from './lib/detail';
  import { summarizeCoreClients } from './lib/inventory/clientSummary';
  import { fixtureScenarios, getFixtureScenario, resourcesFromFixtureScenario, type InventoryFixtureScenarioId } from './lib/inventory/fixtures';
  import type { ScanSummary } from './lib/inventory/scan';
  import { filterCapabilityResources } from './lib/inventory/tableModel';
  import { capabilityClients, type CapabilityClient, type CapabilityResource } from './lib/inventory/types';
  import { runtimeLabel, scanRoot, scanStandardLocations, selectProjectFolder } from './lib/native';
  import { paginate, sortCapabilityResources, type SortDirection, type SortKey } from './lib/table';
  import { applyTheme, getStoredTheme, resolveTheme, storeTheme, systemPrefersDark, type ThemePreference } from './lib/theme';

  const targets: Array<'all' | CapabilityClient> = ['all', ...capabilityClients];
  const themeOptions: ThemePreference[] = ['system', 'light', 'dark'];
  const pageSizeOptions = [25, 50, 100];
  type AppMode = 'machine' | 'project' | 'clients' | 'cross-client' | 'detail';
  const defaultFixtureScenarioId: InventoryFixtureScenarioId = 'full-machine';
  const defaultFixtureScenario = getFixtureScenario(defaultFixtureScenarioId);
  const defaultFixtureItems = resourcesFromFixtureScenario(defaultFixtureScenarioId);

  let items = $state<CapabilityResource[]>(defaultFixtureItems);
  let selectedId = $state(defaultFixtureItems[0]?.id ?? '');
  let activeFixtureScenarioId = $state<InventoryFixtureScenarioId>(defaultFixtureScenarioId);
  let activeScanSummary = $state<ScanSummary>(defaultFixtureScenario.summary);
  let dataSourceLabel = $state(`Fixture: ${defaultFixtureScenario.label}`);
  let query = $state('');
  let target = $state<'all' | CapabilityClient>('all');
  let mode = $state<AppMode>('machine');
  let scanRootPath = $state('');
  let scanStatus = $state('');
  let projectPath = $state('');
  let projectSelectionStatus = $state('');
  let advancedScanOpen = $state(false);
  let themePreference = $state<ThemePreference>('system');
  let page = $state(1);
  let pageSize = $state(25);
  let sortKey = $state<SortKey>('name');
  let sortDirection = $state<SortDirection>('asc');
  let includeInternalArtifacts = $state(false);
  const currentRuntime = runtimeLabel();

  const filtered = $derived(filterCapabilityResources(items, { query, target, includeInternalArtifacts }));

  const sorted = $derived(sortCapabilityResources(filtered, sortKey, sortDirection));
  const pageResult = $derived(paginate(sorted, { page, pageSize }));
  const visibleRows = $derived(pageResult.rows);
  const selected = $derived(findCapabilityResourceById(items, selectedId));
  const issueCount = $derived(items.reduce((total, item) => total + item.warnings.length, 0));
  const scanIssueCount = $derived(activeScanSummary.readErrors.length + activeScanSummary.parseErrors.length + activeScanSummary.skippedSensitiveStores.length + activeScanSummary.warnings.length);
  const sourceModeLabel = $derived(activeScanSummary.dataSource === 'fixture' ? 'Fixture/demo' : 'Local scan');
  const targetCounts = $derived(items.reduce<Record<string, number>>((counts, item) => {
    counts[item.client] = (counts[item.client] ?? 0) + 1;
    return counts;
  }, {}));
  const projectRows = $derived(items.filter((item) => {
    const statuses = item.statuses ?? [item.status];
    return item.scope === 'project-shared'
      || item.scope === 'local-private'
      || statuses.includes('inherited')
      || statuses.includes('likely-active')
      || statuses.includes('needs-review');
  }));
  const clientSummaries = $derived(summarizeCoreClients(activeScanSummary));
  const coreClientPanels = $derived(clientSummaries.map((summary) => {
    const groups = Object.values(summary.resources.reduce<Record<string, { resourceType: string; rows: CapabilityResource[] }>>((accumulator, resource) => {
      const group = accumulator[resource.resourceType] ?? { resourceType: resource.resourceType, rows: [] };
      group.rows.push(resource);
      accumulator[resource.resourceType] = group;
      return accumulator;
    }, {})).sort((a, b) => a.resourceType.localeCompare(b.resourceType));
    return { ...summary, groups };
  }));
  const scannerProblemRows = $derived([
    ...activeScanSummary.readErrors.map((error) => ({ id: error.id, severity: 'error', label: 'Read error', message: error.message, path: error.path })),
    ...activeScanSummary.parseErrors.map((error) => ({ id: error.id, severity: 'error', label: 'Parse error', message: error.message, path: error.path })),
    ...activeScanSummary.skippedSensitiveStores.map((store) => ({ id: store.id, severity: 'warning', label: 'Skipped sensitive', message: store.reason, path: store.path })),
    ...activeScanSummary.warnings.map((warning) => ({ id: warning.id, severity: warning.severity, label: 'Scanner warning', message: warning.message, path: warning.evidence?.sourcePath ?? warning.evidence?.sourceLabel ?? '' }))
  ]);
  const crossClientGroups = $derived(Object.values(items.reduce<Record<string, { key: string; name: string; kind: string; rows: CapabilityResource[]; clients: string[]; scopes: string[]; warnings: number }>>((groups, item) => {
    const key = `${item.name.toLowerCase()}::${item.resourceType}`;
    const group = groups[key] ?? {
      key,
      name: item.name,
      kind: item.resourceType,
      rows: [],
      clients: [],
      scopes: [],
      warnings: 0
    };
    group.rows.push(item);
    group.clients = Array.from(new Set([...group.clients, item.client]));
    group.scopes = Array.from(new Set([...group.scopes, item.scope]));
    group.warnings += item.warnings.length;
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

  function resetPageAndSelection(rows: CapabilityResource[] = sorted) {
    page = 1;
    if (!rows.some((item) => item.id === selectedId)) {
      selectedId = rows[0]?.id ?? '';
    }
  }

  function changeTarget(nextTarget: 'all' | CapabilityClient) {
    target = nextTarget;
    resetPageAndSelection(items.filter((item) => nextTarget === 'all' || item.client === nextTarget));
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

  function previewSnippet(item: CapabilityResource): string {
    const text = item.contentPreview?.text;
    if (!text || item.contentPreview?.policy === 'unread-sensitive') return '';
    const compact = text.replace(/\s+/g, ' ').trim();
    return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
  }

  function resourceSourcePath(item: CapabilityResource): string {
    return item.path ?? item.evidence[0]?.sourcePath ?? 'No source path';
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = key === 'warnings' ? 'desc' : 'asc';
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

  function setRows(nextItems: CapabilityResource[]) {
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
    setRows(resourcesFromFixtureScenario(scenario.id));
    scanStatus = `${scenario.label} fixture loaded. No local scan ran.`;
  }

  async function scanStandard() {
    scanStatus = 'Scanning standard local skill locations...';
    try {
      const summary = await scanStandardLocations();
      activeScanSummary = summary;
      dataSourceLabel = 'Local scan: standard locations';
      target = 'all';
      setRows(summary.resources);
      scanStatus = summary.resources.length ? `Loaded ${summary.resources.length} asset(s) from standard locations.` : 'No local standard-location capabilities found.';
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Standard-location scan failed.';
    }
  }

  async function scanNativeRoot() {
    scanStatus = 'Scanning selected root...';
    try {
      const summary = await scanRoot(scanRootPath.trim());
      activeScanSummary = summary;
      dataSourceLabel = `Local scan: ${scanRootPath.trim()}`;
      target = 'all';
      setRows(summary.resources);
      scanStatus = summary.resources.length ? `Loaded ${summary.resources.length} asset(s).` : 'No matching capabilities found in the selected root.';
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Native scan failed.';
    }
  }

  async function chooseProjectFolder() {
    projectSelectionStatus = 'Selecting project folder...';
    try {
      const selection = await selectProjectFolder(projectPath);
      projectPath = selection.selectedPath;
      activeScanSummary = {
        ...activeScanSummary,
        selectedProject: {
          rootPath: selection.selectedPath,
          displayName: selection.displayName,
          trustState: 'unknown'
        }
      };
      mode = 'project';
      projectSelectionStatus = `Selected ${selection.selectedPath}.`;
    } catch (error) {
      projectSelectionStatus = error instanceof Error ? error.message : 'Project selection failed.';
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
  <meta name="description" content="Local-first capability inventory for developer agent ecosystems" />
</svelte:head>

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="mark" aria-hidden="true">S</div>
      <div>
        <h1>Skillage</h1>
        <p>Local-first capability inventory</p>
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
      <div class="metric-row"><span>Warnings</span><strong>{issueCount}</strong></div>
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

      <section class="core-client-grid" aria-label="Core client inventory">
        {#each coreClientPanels as summary}
          <article class="core-client-card">
            <div class="client-card-header">
              <h3>{summary.client}</h3>
              <span class:ok-status={summary.status === 'configured' || summary.status === 'installed'} class:partial-status={summary.status === 'partially-configured'} class="client-status">{summary.status}</span>
            </div>
            <dl class="meta compact-meta core-meta">
              <div><dt>Resources</dt><dd>{summary.resourceCount}</dd></div>
              <div><dt>Warnings</dt><dd>{summary.warningCount}</dd></div>
              <div><dt>Profiles</dt><dd>{summary.profileCount}</dd></div>
              <div><dt>Stores</dt><dd>{summary.sensitiveStoreCount + summary.logSessionStoreCount}</dd></div>
              <div><dt>Readable</dt><dd>{summary.readableCount}</dd></div>
              <div><dt>Parsed</dt><dd>{summary.parseableCount}</dd></div>
            </dl>
            <div class="core-resource-groups">
              {#each summary.groups as group}
                <section class="core-resource-group" aria-label={`${summary.client} ${group.resourceType}`}>
                  <div class="core-group-heading">
                    <strong>{group.resourceType}</strong>
                    <span>{group.rows.length}</span>
                  </div>
                  {#each group.rows.slice(0, 3) as item (item.id)}
                    <button class="core-resource-row" onclick={() => selectItem(item.id)}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.scope} · {item.status} · {resourceSourcePath(item)}</small>
                        {#if previewSnippet(item)}<code>{previewSnippet(item)}</code>{/if}
                      </span>
                      {#if item.warnings.length}
                        <span class="issue-badge table-issue-badge">{item.warnings.length}</span>
                      {:else}
                        <span class="zero-issues">0</span>
                      {/if}
                    </button>
                  {/each}
                </section>
              {:else}
                <div class="empty small-empty">No resources for this client in the active data set.</div>
              {/each}
            </div>
            {#if summary.caveats.length}
              <ul class="core-caveats">
                {#each summary.caveats as caveat}
                  <li>{caveat}</li>
                {/each}
              </ul>
            {/if}
          </article>
        {/each}
      </section>

      <section class="scanner-metadata-grid" aria-label="Scanner metadata">
        <article class="metadata-panel">
          <h3>Scan roots</h3>
          <div class="metadata-list">
            {#each activeScanSummary.scanRoots as root}
              <div class="metadata-row">
                <span><strong>{root.label}</strong><small>{root.path}</small></span>
                <span class="badge">{root.status}</span>
              </div>
            {:else}
              <div class="empty small-empty">No scan roots recorded for this data set.</div>
            {/each}
          </div>
        </article>

        <article class="metadata-panel">
          <h3>Known locations</h3>
          <div class="metadata-list">
            {#each activeScanSummary.knownClientLocations.slice(0, 8) as location}
              <div class="metadata-row">
                <span><strong>{location.client}</strong><small>{location.path ?? location.label}</small></span>
                <span class:ok-status={location.exists} class="client-status">{location.exists ? 'found' : 'not found'}</span>
              </div>
            {:else}
              <div class="empty small-empty">No known client locations recorded yet.</div>
            {/each}
          </div>
        </article>

        <article class="metadata-panel">
          <h3>Scanner records</h3>
          <div class="metadata-list">
            {#each scannerProblemRows.slice(0, 8) as problem}
              <div class="metadata-row">
                <span><strong>{problem.label}</strong><small>{problem.message}</small>{#if problem.path}<code>{problem.path}</code>{/if}</span>
                <span class="badge">{problem.severity}</span>
              </div>
            {:else}
              <div class="empty small-empty">No scanner errors or warnings in this data set.</div>
            {/each}
          </div>
        </article>
      </section>

      {#if activeScanSummary.dataSource === 'local-scan' && items.length === 0}
        <section class="empty local-empty-state">
          <strong>No local capability resources found.</strong>
          <span>The scan stayed empty. Use the fixture selector for demo data or scan another root.</span>
        </section>
      {/if}

      <section class="filters" aria-label="Inventory filters">
        <label class="field search-field">
          <span>Search</span>
          <input value={query} oninput={(event) => updateQuery(event.currentTarget.value)} placeholder="Search names, paths, clients, types..." />
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
                  <th class="target-column" scope="col" aria-sort={ariaSort('client')}>
                    <button class="sort-header" onclick={() => toggleSort('client')}>Client <span>{sortLabel('client')}</span></button>
                  </th>
                  <th class="kind-column" scope="col" aria-sort={ariaSort('resourceType')}>
                    <button class="sort-header" onclick={() => toggleSort('resourceType')}>Type <span>{sortLabel('resourceType')}</span></button>
                  </th>
                  <th class="scope-column" scope="col" aria-sort={ariaSort('scope')}>
                    <button class="sort-header" onclick={() => toggleSort('scope')}>Scope <span>{sortLabel('scope')}</span></button>
                  </th>
                  <th class="origin-column" scope="col" aria-sort={ariaSort('status')}>
                    <button class="sort-header" onclick={() => toggleSort('status')}>Status <span>{sortLabel('status')}</span></button>
                  </th>
                  <th class="category-column" scope="col">
                    <span class="sort-header">Preview</span>
                  </th>
                  <th class="issues-column" scope="col" aria-sort={ariaSort('warnings')}>
                    <button class="sort-header" onclick={() => toggleSort('warnings')}>Warnings <span>{sortLabel('warnings')}</span></button>
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
                    <td><span class="badge">{item.client}</span></td>
                    <td>{item.resourceType}</td>
                    <td>{item.scope}</td>
                    <td>{item.status}</td>
                    <td>{item.previewPolicy ?? 'metadata-only'}</td>
                    <td>
                      {#if item.warnings.length}
                        <span class="issue-badge table-issue-badge">{item.warnings.length}</span>
                      {:else}
                        <span class="zero-issues">0</span>
                      {/if}
                    </td>
                    <td><code class="table-path">{item.path ?? item.evidence[0]?.sourcePath ?? '—'}</code></td>
                  </tr>
                {:else}
                  <tr>
                    <td colspan="8"><div class="empty table-empty">No matching capability resources. Clear search or switch source.</div></td>
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

      <section class="scan-panel" aria-label="Project folder selection">
        <label class="field inline">
          <span>Project folder</span>
          <input bind:value={projectPath} placeholder="/home/you/project or \\wsl.localhost\\Ubuntu\\home\\you\\project" />
        </label>
        <button class="button secondary" onclick={chooseProjectFolder} disabled={!projectPath.trim()}>Select project</button>
      </section>

      {#if projectSelectionStatus}<p class="status-line">{projectSelectionStatus}</p>{/if}

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
              <span class="resource-meta"><span class="badge">{item.client}</span><span>{item.scope}</span><span>{item.status}</span></span>
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
              <span class:ok-status={summary.status === 'configured' || summary.status === 'installed'} class:partial-status={summary.status === 'partially-configured'} class="client-status">{summary.status}</span>
            </div>
            <dl class="meta compact-meta">
              <div><dt>Resources</dt><dd>{summary.resourceCount}</dd></div>
              <div><dt>Known locations</dt><dd>{summary.knownLocationCount}</dd></div>
              <div><dt>Profiles</dt><dd>{summary.profileCount}</dd></div>
              <div><dt>Stores</dt><dd>{summary.sensitiveStoreCount + summary.logSessionStoreCount}</dd></div>
            </dl>
            <div class="resource-list compact-list">
              {#each summary.resources.slice(0, 4) as item (item.id)}
                <button class="resource-row compact-row" onclick={() => selectItem(item.id)}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.resourceType} · {item.scope}</small>
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
                <th class="issues-column" scope="col">Warnings</th>
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
                <div class="detail-kicker"><span class="badge large">{selected.client}</span><span>{selected.resourceType}</span><span>{selected.scope}</span></div>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
              <button class="button ghost" onclick={() => navigator.clipboard?.writeText(selected.path ?? selected.evidence[0]?.sourcePath ?? '')}>Copy path</button>
            </div>

            <dl class="meta detail-meta">
              <div><dt>Type</dt><dd>{selected.resourceType}</dd></div>
              <div><dt>Scope</dt><dd>{selected.scope}</dd></div>
              <div><dt>Status</dt><dd>{selected.status}</dd></div>
              <div><dt>Preview</dt><dd>{selected.previewPolicy ?? 'metadata-only'}</dd></div>
              <div><dt>Scanner</dt><dd>{selected.evidence[0]?.scannerRule ?? '—'}</dd></div>
              <div><dt>Path</dt><dd>{selected.path ?? selected.evidence[0]?.sourcePath ?? '—'}</dd></div>
            </dl>

            <section class="detail-section">
              <h3>Validation</h3>
              {#if selected.warnings.length}
                <ul class="issues">
                  {#each selected.warnings as issue}
                    <li class={issue.severity}><strong>{issue.severity}</strong><span>{issue.message}</span></li>
                  {/each}
                </ul>
              {:else}
                <p class="ok">No warnings detected.</p>
              {/if}
            </section>

            <section class="detail-section">
              <h3>Source evidence</h3>
              <pre>{selected.evidence.map((evidence) => `${evidence.sourcePath ?? evidence.sourceLabel ?? 'unknown source'}\nrule: ${evidence.scannerRule ?? 'unknown'}\nread: ${evidence.readStatus}\nparse: ${evidence.parseStatus}`).join('\n\n')}</pre>
            </section>
          </article>
        {:else}
          <div class="empty detail-empty">
            <strong>Resource not found.</strong>
            <span>The selected resource may have disappeared after a scan. Return to the inventory and choose another asset.</span>
          </div>
        {/if}
      </section>
    {/if}
  </main>
</div>
