# Parser Strategy

Skillage parses agent client configuration only far enough to inventory resources safely. Parsers must be passive: they never execute commands, load plugins, follow includes outside the scanner policy, or resolve secret values.

## Supported formats

- JSON configs use native JSON parsing plus typed key-path helpers. JSON extraction preserves the source file path and parsed key path in `CapabilityEvidence`.
- TOML configs use an explicit best-effort parser for the subset needed by Codex-style configs: scalar assignments, arrays, inline tables, standard tables, dotted tables, and arrays of tables. It is not a general TOML compliance layer.
- YAML-like files are limited to the existing markdown frontmatter parser. Skillage does not parse arbitrary YAML configs in v1.

## Unsupported constructs

- JSON with comments, trailing commas, JSON5 syntax, or duplicate-key diagnostics is unsupported.
- TOML datetime typing, multiline strings, numeric separators, binary/octal/hex numbers, escaped unicode validation, and full spec-level error recovery are unsupported.
- YAML anchors, aliases, nested objects, multiline block scalars, and arbitrary YAML documents are unsupported outside simple markdown frontmatter.
- Environment variables and secret references are recorded as references only. The scanner does not expand them.

## Parser guarantees

- Parsed resources include source evidence with `sourcePath`, `scannerRule`, `matchedPathPattern`, and `parsedKeyPath` where a specific key created the resource.
- Parse failures create inventory-visible records with `parseStatus: "parse-error"` and resource status `parse-error` or scanner-level parse errors.
- Redacted previews may show sanitized config snippets, but raw config bodies are not required by the table, filters, or summary views.
- Sensitive-looking inline values emit `secret-auth-concern` warnings and are redacted before preview.
- MCP extraction reads command, package, URL, args, and env key names as metadata. It does not start MCP commands or validate connectivity.

## Inventory representation

Config parsers return structured parse results rather than throwing for ordinary malformed input. A malformed file can still become a `config-file` resource with parse-error evidence so users can see the exact path that needs attention. Nested resources such as MCP servers add their own evidence pointing back to the same source path and a parsed key path like `mcpServers.github.command`.
