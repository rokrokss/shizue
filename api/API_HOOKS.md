# Pre-commit Hooks for API

This project uses pre-commit hooks to ensure API code quality before commits.

## Setup

1. Install dependencies:
```bash
cd api && make sync
```

2. Install pre-commit hooks:
```bash
cd api && make install-hooks
```

## What it does

When you commit Python files in the `api/` directory (from anywhere in the repository), the following checks will run automatically:
- **Format**: Auto-format code with Black and isort
- **Check**: Verify formatting and linting rules
- **Test**: Run unit tests

## Manual Usage

To run pre-commit on all files manually:
```bash
cd api && make pre-commit
```

Or from the root directory:
```bash
source api/.venv/bin/activate && pre-commit run --all-files
```

To skip hooks temporarily (not recommended):
```bash
git commit --no-verify
```

## Troubleshooting

If hooks fail:
1. Check the error message
2. Run `cd api && make format` to auto-fix formatting issues
3. Run `cd api && make test` to see detailed test failures
4. Fix any remaining issues and try committing again

## Note

The pre-commit configuration is located at `/.pre-commit-config.yaml` (repository root) but only affects Python files in the `api/` directory.