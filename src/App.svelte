<script lang="ts">
  import { onMount } from 'svelte';
  import { runtimeLabel, scanRoot, scanStandardLocations } from './lib/native';
  import { sampleItems } from './lib/sampleData';
  import type { SkillItem, SkillTarget } from './lib/types';

  const targets: Array<'all' | SkillTarget> = ['all', 'claude-code', 'codex', 'hermes', 'openclaw', 'cursor', 'generic'];

  let items = $state<SkillItem[]>(sampleItems);
  let selectedId = $state(sampleItems[0]?.id ?? '');
  let query = $state('');
  let target = $state<'all' | SkillTarget>('all');
  let mode = $state<'inventory' | 'create' | 'research'>('inventory');
  let scanRootPath = $state('');
  let scanStatus = $state('');
  const currentRuntime = runtimeLabel();

  const filtered = $derived(items.filter((item) => {
    const haystack = `${item.name} ${item.description} ${item.path} ${item.body} ${item.target}`.toLowerCase();
    return (target === 'all' || item.target === target) && haystack.includes(query.toLowerCase());
  }));

  const selected = $derived(filtered.find((item) => item.id === selectedId) ?? filtered[0]);
  const issueCount = $derived(items.reduce((total, item) => total + item.issues.length, 0));

  function selectItem(id: string) {
    selectedId = id;
    mode = 'inventory';
  }

  async function scanStandard() {
    scanStatus = 'Scanning standard local skill locations...';
    try {
      const discovered = await scanStandardLocations();
      items = discovered.length ? discovered : sampleItems;
      selectedId = items[0]?.id ?? '';
      scanStatus = discovered.length ? `Loaded ${discovered.length} asset(s) from standard locations.` : 'No local standard-location skills found; restored sample data.';
    } catch (error) {
      scanStatus = error instanceof Error ? error.message : 'Standard-location scan failed.';
    }
  }

  async function scanNativeRoot() {
    scanStatus = 'Scanning...';
    try {
      const discovered = await scanRoot(scanRootPath.trim());
      items = discovered.length ? discovered : sampleItems;
      selectedId = items[0]?.id ?? '';
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
    mode = 'inventory';
  }

  onMount(() => {
    void scanStandard();
  });
</script>

<svelte:head>
  <title>Skillage</title>
  <meta name="description" content="Local-first skill and rule management for coding agents" />
</svelte:head>

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="mark">S</div>
      <div>
        <h1>Skillage</h1>
        <p>Local-first skill management for coding agents</p>
      </div>
    </div>

    <nav class="tabs" aria-label="Primary">
      <button class:active={mode === 'inventory'} onclick={() => (mode = 'inventory')}>Inventory</button>
      <button class:active={mode === 'create'} onclick={() => (mode = 'create')}>Create</button>
      <button class:active={mode === 'research'} onclick={() => (mode = 'research')}>Product notes</button>
    </nav>

    <label class="field">
      <span>Search</span>
      <input bind:value={query} placeholder="name, path, body..." />
    </label>

    <label class="field">
      <span>Target</span>
      <select bind:value={target}>
        {#each targets as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>

    <div class="stats">
      <div><strong>{items.length}</strong><span>assets</span></div>
      <div><strong>{issueCount}</strong><span>issues</span></div>
      <div><strong>MIT</strong><span>license</span></div>
    </div>

    <div class="source-note">
      <strong>{currentRuntime}</strong>
      <p>Desktop mode scans through narrow Tauri/Rust commands. Browser dev mode uses a local Vite scanner only for development.</p>
    </div>
  </aside>

  <main class="main">
    {#if mode === 'inventory'}
      <section class="toolbar">
        <div>
          <h2>Detected skills and rules</h2>
          <p>Normalized view across Claude Code, Codex AGENTS.md, Hermes-style SKILL.md, OpenClaw placeholders, and Cursor rules.</p>
        </div>
        <button class="secondary" onclick={scanStandard}>Scan standard locations</button>
        <button class="primary" onclick={createSampleSkill}>New draft skill</button>
      </section>

      <section class="scan-panel" aria-label="Local scanner">
        <label class="field inline">
          <span>Scan root</span>
          <input bind:value={scanRootPath} placeholder="/home/you/project, /home/you/.claude, or \\wsl.localhost\\Ubuntu\\home\\you" />
        </label>
        <button onclick={scanNativeRoot} disabled={!scanRootPath.trim()}>Scan root</button>
        {#if scanStatus}<p>{scanStatus}</p>{/if}
      </section>

      <section class="content-grid">
        <div class="list" aria-label="Skill inventory">
          {#each filtered as item (item.id)}
            <button class:selected={selected?.id === item.id} class="card" onclick={() => selectItem(item.id)}>
              <span class="pill">{item.target}</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <small>{item.path}</small>
              {#if item.issues.length}
                <span class="issue-badge">{item.issues.length} issue{item.issues.length === 1 ? '' : 's'}</span>
              {/if}
            </button>
          {:else}
            <div class="empty">No matching skills or rules.</div>
          {/each}
        </div>

        <article class="detail">
          {#if selected}
            <div class="detail-header">
              <span class="pill large">{selected.target}</span>
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
            </div>

            <dl class="meta">
              <div><dt>Kind</dt><dd>{selected.kind}</dd></div>
              <div><dt>Scope</dt><dd>{selected.scope}</dd></div>
              <div><dt>Path</dt><dd>{selected.path}</dd></div>
              <div><dt>Entry</dt><dd>{selected.entryFile ?? 'single file'}</dd></div>
            </dl>

            <h3>Validation</h3>
            {#if selected.issues.length}
              <ul class="issues">
                {#each selected.issues as issue}
                  <li class={issue.severity}>{issue.severity}: {issue.message}</li>
                {/each}
              </ul>
            {:else}
              <p class="ok">No validation issues detected.</p>
            {/if}

            <h3>Body preview</h3>
            <pre>{selected.body}</pre>
          {:else}
            <div class="empty">Select a skill or rule to inspect it.</div>
          {/if}
        </article>
      </section>
    {:else if mode === 'create'}
      <section class="panel">
        <h2>Create skill</h2>
        <p>The MVP creates a safe draft object and shows the target file layout. Native writes should go through the Tauri backend with backup + diff preview.</p>
        <button class="primary" onclick={createSampleSkill}>Create Claude/Hermes-compatible SKILL.md draft</button>
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
