# Contributing to Paperditor

Thank you for your interest in contributing! Every contribution is welcome and appreciated.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Submitting Code](#submitting-code)
- [Development Setup](#development-setup)
- [Commit Messages](#commit-messages)
- [Pull Request Guidelines](#pull-request-guidelines)

---

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating. We expect all contributors to follow it.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/paperditor.git
   cd paperditor
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feat/your-feature-name
   ```

---

## How to Contribute

### Reporting Bugs

Before opening a bug report, please:
- Search [existing issues](https://github.com/guisaldanha/paperditor/issues) to avoid duplicates.
- Try to reproduce the bug on the latest release.

When opening a bug report, use the **Bug Report** template and include:
- Operating system and version
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots or screen recordings if applicable

### Suggesting Features

Open a **Feature Request** issue and describe:
- The problem your feature solves
- A clear description of what you want
- Any alternatives you have considered

### Submitting Code

For small fixes (typos, minor bugs), you can open a PR directly.
For larger changes or new features, **open an issue first** to discuss the approach before writing code.

---

## Development Setup

> Requirements: **Node.js 18+** and **npm**

```bash
# Start the dev server with hot reload
npm run dev

# Type-check without emitting
npx tsc --noEmit

# Lint the codebase
npm run lint

# Build the production installer
npm run build
```

The compiled installer will be placed in `release/<version>/`.

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(toolbar): add strikethrough button
fix(pdf): correct page margins on export
docs: update keyboard shortcuts table
```

---

## Pull Request Guidelines

- **Keep PRs focused** — one feature or fix per PR.
- **Update the CHANGELOG** if your change is user-facing.
- **Add or update tests** if applicable.
- **Ensure the build passes** (`npm run build`) before submitting.
- Fill in the PR template completely.

---

Thank you for helping make Paperditor better! ❤️
