# Bugfix Execution TODO

- [x] Create regression tests for design system color mapping bug.
- [x] Run the new color mapping tests and confirm they fail for the current implementation.
- [x] Fix the design system color field mapping in source and bundled scripts.
- [x] Re-run the color mapping tests and confirm they pass.
- [x] Create regression tests for stack search support.
- [x] Run the new stack search tests and confirm they fail for the current implementation.
- [x] Restore stack search support in source data/config and bundled assets.
- [x] Re-run the full test suite and confirm all tests pass.
- [x] Review the final diff and record results below.
- [ ] Commit with a bug-specific message and push the branch to GitHub.

## Review

- Added CLI-level regression tests covering design-system color output and documented stack search support for both source scripts and bundled CLI assets.
- Fixed design-system color mapping to read `Primary` / `Secondary` / `Accent` / `Background` / `Foreground` from `colors.csv`.
- Restored stack search support by syncing missing `stacks/*.csv` files into `src`, auto-discovering stacks from the filesystem, and making help text reflect the discovered values.
- Updated the root README to list the exact `--stack` values the CLI accepts.
- Verification:
  - `python3 -m unittest discover -s tests -p 'test_*.py' -v`
  - `python3 src/ui-ux-pro-max/scripts/search.py "gaming app" --design-system -f markdown`
  - `python3 src/ui-ux-pro-max/scripts/search.py "App Router" --stack nextjs`
  - `python3 cli/assets/scripts/search.py "gaming app" --design-system -f markdown`
  - `git diff --check`
