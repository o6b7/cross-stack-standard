/**
 * Commit message rules: Conventional Commits (the shared config) with a 100-character header,
 * the same limit Prettier uses for code. Pull request titles are checked with the same rules in
 * CI because squash merges turn the title into the commit header on dev.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
  },
};
