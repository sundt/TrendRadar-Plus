# Viewer Categories Specification

## ADDED Requirements

### Requirement: Category Settings Modal Simplification
The system SHALL simplify the category settings modal UI without changing existing configuration semantics.

#### Scenario: Remove redundant section title
- **WHEN** user opens the category settings modal
- **THEN** the UI SHALL NOT display the section title text `栏目管理`

#### Scenario: Remove global one-click toggle
- **WHEN** user opens the category settings modal
- **THEN** the UI SHALL NOT display a global toggle labelled `一键开闭`

#### Scenario: Reduce modal height
- **WHEN** user opens the category settings modal
- **THEN** the modal height SHALL be reduced compared to the previous layout
- **AND** the modal header (title bar) height/padding SHALL be reduced to avoid excessive space usage
- **AND** the modal max-height (or height ratio) SHALL be reduced if needed
- **AND** the modal content remains usable without blocking excessive screen space

#### Scenario: Default collapse category list on open
- **WHEN** user opens the category settings modal
- **THEN** the category list SHALL be collapsed by default
- **AND** user can expand it via the existing collapse/expand control
