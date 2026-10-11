# Scratch repository

This directory is the starting content of the `repo` harness host. The fixture runner copies
it into a temporary directory, runs `git init`, and commits it as the initial commit. Fixture
layers then add files, and optional `base`/`head` directories become two more commits.
