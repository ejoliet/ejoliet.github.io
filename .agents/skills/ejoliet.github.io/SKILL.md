```markdown
# ejoliet.github.io Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions observed in the `ejoliet.github.io` repository. The codebase is written in TypeScript and does not use a specific framework. It emphasizes consistent file naming, import/export styles, and basic testing patterns. This guide will help you quickly align with the project's established practices.

## Coding Conventions

### File Naming
- **Style:** camelCase
- **Example:**  
  - `myComponent.ts`
  - `userProfile.test.ts`

### Import Style
- **Relative imports are used.**
- **Example:**
  ```typescript
  import { myFunction } from './utils';
  ```

### Export Style
- **Named exports are preferred.**
- **Example:**
  ```typescript
  export function myFunction() { ... }
  ```

### Commit Messages
- **Freeform style, no enforced prefixes**
- **Average length:** ~51 characters

## Workflows

### Add a New Module
**Trigger:** When adding a new feature or utility  
**Command:** `/add-module`

1. Create a new TypeScript file using camelCase (e.g., `newFeature.ts`).
2. Implement the feature using named exports.
3. Use relative imports to include dependencies.
4. If applicable, create a corresponding test file (e.g., `newFeature.test.ts`).

### Update an Existing Module
**Trigger:** When modifying or enhancing existing code  
**Command:** `/update-module`

1. Locate the relevant `.ts` file.
2. Apply changes, maintaining named exports and relative imports.
3. Update or add tests in the corresponding `*.test.ts` file.

### Write and Run Tests
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Create or update a test file matching the pattern `*.test.ts`.
2. Write tests using the project's preferred (unspecified) testing framework.
3. Run tests using the project's test runner (framework not specified; check project docs or scripts).

## Testing Patterns

- **File Pattern:** Test files use the `*.test.ts` naming convention.
- **Framework:** Not explicitly specified; follow existing patterns.
- **Example:**
  ```typescript
  import { myFunction } from './myFunction';

  test('should return correct value', () => {
    expect(myFunction()).toBe('expectedValue');
  });
  ```

## Commands
| Command         | Purpose                                      |
|-----------------|----------------------------------------------|
| /add-module     | Scaffold and add a new module or feature     |
| /update-module  | Update or enhance an existing module         |
| /run-tests      | Run all test files in the repository         |
```
