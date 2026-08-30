#!/usr/bin/env bash
#
# Point git at the hooks kept in this repository.
#
# `core.hooksPath` rather than copying files into .git/hooks: a copy is a second version
# that stops being updated the day somebody edits the original, and .git/hooks is not
# checked in, so nobody can see whether a clone has the hook or a stale copy of it.
#
# It is per-clone and has to be run once per checkout — git will not read hooks out of a
# repository it just cloned, for the obvious reason that cloning would then execute code.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
echo "hooks installed: .githooks (post-commit keeps the changelog, roadmap, README and handoff current)."
echo "To undo:  git config --unset core.hooksPath"
