<script lang="ts">
  import { onMount } from 'svelte';
  import { findCapabilityResourceById } from './lib/detail';
  import { fixtureScenarios, getFixtureScenario, resourcesFromFixtureScenario, type InventoryFixtureScenarioId } from './lib/inventory/fixtures';
  import { capabilityResourcesFromSkillItems } from './lib/inventory/legacy';
  import { buildLocalScanResult } from './lib/inventory/localScan';
  import type { ScanSummary } from './lib/inventory/scan';
  import { capabilityClients, type CapabilityClient, type CapabilityResource } from './lib/inventory/types';
  import { runtimeLabel, scanRoot, scanStandardLocations } from './lib/native';
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
  let advancedScanOpen = $state(false);
  let themePreference = $state<ThemePreference>('system');
  let page = $state(1);
  let pageSize = $state(25);
  let sortKey = $state<SortKey>('name');
  let sortDirection = $state<SortDirection>('asc');
  let includeInternalArtifacts = $state(false);
  const currentRuntime = runtimeLabel();

  const filtered = $derived(items.filter((item) => {
    const warningText = item.warnings.map((warning) => warning.message).join(' ');
    const evidenceText = item.evidence.map((evidence) => `${evidence.sourcePath ?? ''} ${evidence.sourceLabel ?? ''} ${evidence.scannerRule ?? ''}`).join(' ');
    const haystack = `${item.name} ${item.description} ${item.path ?? ''} ${item.client} ${item.resourceType} ${item.scope} ${item.status} ${item.statuses?.join(' ') ?? ''} ${item.tags.join(' ')} ${warningText} ${evidenceText}`.toLowerCase();
    const internalArtifact = item.scope === 'plugin-bundled' && (item.metadata.legacyScope === 'cache' || item.metadata.legacyScope === 'temporary');
    return (target === 'all' || item.client === target)
      && (includeInternalArtifacts || !internalArtifact)
      && haystack.includes(query.toLowerCase());
  }));

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
  const clientSummaries = $derived(capabilityClients.map((client) => {
    const resources = items.filter((item) => item.client === client);
    const locations = activeScanSummary.knownClientLocations.filter((location) => location.client === client);
    return {
      client,
      resources,
      locations,
      found: resources.some((item) => item.status !== 'not-found') || locations.some((location) => location.exists)
    };
  }));
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
      const discovered = capabilityResourcesFromSkillItems(await scanStandardLocations());
      const result = buildLocalScanResult({
        scanId: 'local-standard-scan',
        rootPath: 'standard locations',
        rootLabel: 'Standard local locations',
        scannerRule: 'standard-locations',
        matchedPathPattern: 'known client homes and current working directory',
        dataSourceLabel: 'Local scan: standard locations',
        resources: discovered,
        loadedStatus: `Loaded ${discovered.length} asset(s) from standard locations.`,
        emptyStatus: 'No local standard-location capabilities found.'
      });
      activeScanSummary = result.summary;
      dataSourceLabel = result.dataSourceLabel;
      target = 'all';
      setRows(result.resources);
      scanStatus = result.statusText;
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Standard-location scan failed.';
    }
  }

  async function scanNativeRoot() {
    scanStatus = 'Scanning selected root...';
    try {
      const discovered = capabilityResourcesFromSkillItems(await scanRoot(scanRootPath.trim()));
      const result = buildLocalScanResult({
        scanId: 'local-root-scan',
        rootPath: scanRootPath.trim(),
        rootLabel: 'Selected scan root',
        scannerRule: 'selected-root',
        matchedPathPattern: scanRootPath.trim(),
        dataSourceLabel: `Local scan: ${scanRootPath.trim()}`,
        resources: discovered,
        loadedStatus: `Loaded ${discovered.length} asset(s).`,
        emptyStatus: 'No matching capabilities found in the selected root.'
      });
      activeScanSummary = result.summary;
      dataSourceLabel = result.dataSourceLabel;
      target = 'all';
      setRows(result.resources);
      scanStatus = result.statusText;
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
