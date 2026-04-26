<script lang="ts">
  import { onMount } from 'svelte';
  import { runtimeLabel, scanRoot, scanStandardLocations } from './lib/native';
  import { sampleItems } from './lib/sampleData';
  import { paginate, sortSkillItems, type SortDirection, type SortKey } from './lib/table';
  import { applyTheme, getStoredTheme, resolveTheme, storeTheme, systemPrefersDark, type ThemePreference } from './lib/theme';
  import type { SkillItem, SkillTarget } from './lib/types';

  const targets: Array<'all' | SkillTarget> = ['all', 'claude-code', 'codex', 'hermes', 'openclaw', 'cursor', 'generic'];
  const themeOptions: ThemePreference[] = ['system', 'light', 'dark'];
  const pageSizeOptions = [25, 50, 100];

  let items = $state<SkillItem[]>(sampleItems);
  let selectedId = $state(sampleItems[0]?.id ?? '');
  let query = $state('');
  let target = $state<'all' | SkillTarget>('all');
  let mode = $state<'inventory' | 'create' | 'research'>('inventory');
  let scanRootPath = $state('');
  let scanStatus = $state('');
  let advancedScanOpen = $state(false);
  let themePreference = $state<ThemePreference>('system');
  let page = $state(1);
  let pageSize = $state(25);
  let sortKey = $state<SortKey>('name');
  let sortDirection = $state<SortDirection>('asc');
  const currentRuntime = runtimeLabel();

  const filtered = $derived(items.filter((item) => {
    const haystack = `${item.name} ${item.description} ${item.path} ${item.body} ${item.target}`.toLowerCase();
    return (target === 'all' || item.target === target) && haystack.includes(query.toLowerCase());
  }));

  const sorted = $derived(sortSkillItems(filtered, sortKey, sortDirection));
  const pageResult = $derived(paginate(sorted, { page, pageSize }));
  const visibleRows = $derived(pageResult.rows);
  const selected = $derived(sorted.find((item) => item.id === selectedId) ?? visibleRows[0] ?? sorted[0]);
  const issueCount = $derived(items.reduce((total, item) => total + item.issues.length, 0));
  const targetCounts = $derived(items.reduce<Record<string, number>>((counts, item) => {
    counts[item.target] = (counts[item.target] ?? 0) + 1;
    return counts;
  }, {}));

  function selectItem(id: string) {
    selectedId = id;
    mode = 'inventory';
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

  async function scanStandard() {
    scanStatus = 'Scanning standard local skill locations...';
    try {
      const discovered = await scanStandardLocations();
      items = discovered.length ? discovered : sampleItems;
      selectedId = items[0]?.id ?? '';
      page = 1;
      scanStatus = discovered.length ? `Loaded ${discovered.length} asset(s) from standard locations.` : 'No local standard-location skills found; restored sample data.';
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Standard-location scan failed.';
    }
  }

  async function scanNativeRoot() {
    scanStatus = 'Scanning selected root...';
    try {
      const discovered = await scanRoot(scanRootPath.trim());
      items = discovered.length ? discovered : sampleItems;
      selectedId = items[0]?.id ?? '';
      page = 1;
      scanStatus = discovered.length ? `Loaded ${discovered.length} asset(s).` : 'No matching files found; restored sample data.';
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Native scan failed.';
    }
  }

  function createSampleSkill() {
    const next: SkillItem = {
      id: `draft:${crypto.randomUUID()}`,
      name: 'new-skill',
      description: 'Describe when an agent should use this skill.',
      target: 'claude-code',
      kind: 'skill',
      scope: 'sample',
      path: '~/.claude/skills/new-skill/SKILL.md',
      entryFile: 'SKILL.md',
      body: '# New Skill\n\nWrite crisp operational instructions here. Add scripts/references only when needed.',
      tags: ['draft'],
      metadata: { name: 'new-skill', description: 'Describe when an agent should use this skill.' },
      issues: [{ severity: 'info', message: 'Draft only. Native write support is planned for the Tauri backend with backup + diff preview.' }]
    };
    items = [next, ...items];
    selectedId = next.id;
    page = 1;
    mode = 'inventory';
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

    void scanStandard();

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
      <button class:active={mode === 'inventory'} onclick={() => (mode = 'inventory')}>Inventory</button>
      <button class:active={mode === 'create'} onclick={() => (mode = 'create')}>Create</button>
      <button class:active={mode === 'research'} onclick={() => (mode = 'research')}>Product notes</button>
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
      <div class="metric-row"><span>Visible</span><strong>{filtered.length}</strong></div>
      <div class="metric-row"><span>Validation issues</span><strong>{issueCount}</strong></div>
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
    {#if mode === 'inventory'}
      <section class="topbar">
        <div>
          <p class="eyebrow">Inventory</p>
          <h2>Detected skills and rules</h2>
          <p>Normalized across Claude Code, Codex, Hermes, OpenClaw, Cursor rules, and generic agent files.</p>
        </div>
        <div class="topbar-actions">
          <button class="button secondary" onclick={() => (advancedScanOpen = !advancedScanOpen)}>{advancedScanOpen ? 'Hide scan root' : 'Advanced scan'}</button>
          <button class="button secondary" onclick={scanStandard}>Scan standard locations</button>
          <button class="button primary" onclick={createSampleSkill}>New draft skill</button>
        </div>
      </section>

      <section class="filters" aria-label="Inventory filters">
        <label class="field search-field">
          <span>Search</span>
          <input value={query} oninput={(event) => updateQuery(event.currentTarget.value)} placeholder="Search names, paths, descriptions, body..." />
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

      <section class="content-grid table-layout">
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
                    <button class="sort-header" onclick={() => toggleSort('target')}>Target <span>{sortLabel('target')}</span></button>
                  </th>
                  <th class="kind-column" scope="col" aria-sort={ariaSort('kind')}>
                    <button class="sort-header" onclick={() => toggleSort('kind')}>Kind <span>{sortLabel('kind')}</span></button>
                  </th>
                  <th class="scope-column" scope="col" aria-sort={ariaSort('scope')}>
                    <button class="sort-header" onclick={() => toggleSort('scope')}>Scope <span>{sortLabel('scope')}</span></button>
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
                  <tr class:selected={selected?.id === item.id}>
                    <td>
                      <button class="table-name-button" aria-current={selected?.id === item.id ? 'true' : undefined} onclick={() => selectItem(item.id)}>
                        <strong>{item.name}</strong>
                        <span>{item.description}</span>
                      </button>
                    </td>
                    <td><span class="badge">{item.target}</span></td>
                    <td>{item.kind}</td>
                    <td>{item.scope}</td>
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
                    <td colspan="6"><div class="empty table-empty">No matching skills or rules. Clear search or switch source.</div></td>
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

        <article class="detail">
          {#if selected}
            <div class="detail-header">
              <div>
                <div class="detail-kicker"><span class="badge large">{selected.target}</span><span>{selected.kind}</span></div>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
              <button class="button ghost" onclick={() => navigator.clipboard?.writeText(selected.path)}>Copy path</button>
            </div>

            <dl class="meta">
              <div><dt>Kind</dt><dd>{selected.kind}</dd></div>
              <div><dt>Scope</dt><dd>{selected.scope}</dd></div>
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
          {:else}
            <div class="empty">Select a skill or rule to inspect it.</div>
          {/if}
        </article>
      </section>
    {:else if mode === 'create'}
      <section class="panel create-panel">
        <p class="eyebrow">Draft workflow</p>
        <h2>Create skill</h2>
        <p>The MVP creates a safe draft object and shows the target file layout. Native writes should go through the Tauri backend with backup + diff preview.</p>
        <button class="button primary" onclick={createSampleSkill}>Create Claude/Hermes-compatible SKILL.md draft</button>
        <pre>~/.claude/skills/new-skill/SKILL.md
---
name: new-skill
description: Describe when an agent should use this skill.
---

# New Skill

Operational instructions...</pre>
      </section>
    {:else}
      <section class="panel prose">
        <p class="eyebrow">Product strategy</p>
        <h2>Research-backed wedge</h2>
        <p><strong>Skillage should not be just a prompt manager.</strong> The high-value wedge is an effective-context inspector, validator, and converter for developer agent instructions.</p>
        <ul>
          <li>Developers are juggling CLAUDE.md, AGENTS.md, SKILL.md directories, Cursor MDC rules, MCP config, and project/global overrides.</li>
          <li>The common complaint is not knowing which instruction is active, why it was ignored, and how to keep formats in sync.</li>
          <li>Local-first is the right default because these files often include private project conventions and paths.</li>
          <li>Tauri is the right long-term shell for size and security; Svelte keeps the frontend light.</li>
        </ul>
      </section>
    {/if}
  </main>
</div>
