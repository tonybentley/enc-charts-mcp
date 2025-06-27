# GitHub Actions Workflows

This directory contains CI/CD workflows for the enc-charts-mcp project.

## Workflows

### ci.yml - Continuous Integration

The main CI pipeline that runs on all pushes to `main` and `develop` branches, and on all pull requests to `main`.

#### Jobs

1. **Lint** - Runs ESLint and checks code formatting
2. **Type Check** - Runs TypeScript type checking
3. **Unit Tests** - Runs unit tests on Node.js 18.x, 20.x, and 22.x
   - Generates coverage reports on Node.js 20.x
   - Uploads coverage to Codecov
   - Comments on PRs with coverage report
4. **Build** - Builds the TypeScript project and uploads artifacts

#### Coverage Thresholds

The project enforces the following minimum coverage thresholds:

| Metric | Global | Handlers | Services |
|--------|--------|----------|----------|
| Lines | 83% | 98% | 85% |
| Branches | 65% | 85% | 65% |
| Functions | 76% | 100% | 90% |
| Statements | 82% | 98% | 85% |

### gdal-detection.yml - GDAL Detection Test

Tests GDAL detection across different operating systems.

## Badge Integration

To add status badges to your README:

```markdown
![CI](https://github.com/YOUR_USERNAME/enc-charts-mcp/workflows/CI/badge.svg)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/enc-charts-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/enc-charts-mcp)
```

## Required Secrets

- `CODECOV_TOKEN` - Token for uploading coverage to Codecov (optional but recommended)
- `GIST_TOKEN` - GitHub token with gist scope for updating coverage badges (optional)

## Local Testing

You can test workflows locally using [act](https://github.com/nektos/act):

```bash
# List all workflows
act -l

# Run specific job
act -j test

# Run with specific Node version
act -j test --matrix node-version:20.x
```