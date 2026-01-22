## ADDED Requirements

### Requirement: Canonical AI Context Entry
The repository MUST provide a canonical AI context entry document at `docs/ai/AI_CONTEXT.md`.

#### Scenario: New assistant session bootstrap
- **WHEN** an assistant session starts in any supported tool
- **THEN** the tool-specific instruction entry MUST direct the assistant to read `docs/ai/AI_CONTEXT.md` first

### Requirement: Multi-Tool Entry Compatibility
The repository MUST provide multiple entry files to support different AI tools, while keeping a single source of truth.

#### Scenario: Tool-specific entry file resolution
- **WHEN** a tool reads `CLAUDE.md`, `WINDSURF.md`, or `CURSOR.md`
- **THEN** each entry MUST direct the assistant to `docs/ai/AI_CONTEXT.md` and `openspec/AGENTS.md`

### Requirement: Documentation Migration Without Breaking Links
The repository MUST preserve access to legacy docs paths after migration.

#### Scenario: Legacy docs link remains valid
- **WHEN** a user opens a legacy docs path that was migrated
- **THEN** the legacy document MUST remain present as a stub redirecting to the new canonical location

### Requirement: OpenSpec Authority Preservation
The repository MUST keep `openspec/AGENTS.md` as the authority for OpenSpec workflow requirements.

#### Scenario: Proposal workflow
- **WHEN** a change request involves a proposal/spec/architecture shift
- **THEN** the assistant MUST follow `openspec/AGENTS.md` and SHALL NOT begin implementation before approval

### Requirement: Secret Hygiene in Documentation
The canonical AI context documents MUST NOT contain secrets (tokens, webhooks, passwords).

#### Scenario: Adding configuration examples
- **WHEN** adding configuration examples to docs
- **THEN** the examples MUST use placeholders and MUST NOT include real secret values
