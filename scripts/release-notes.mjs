import assert from "node:assert/strict";

export function releaseNotes(changelog, version) {
  assert(/^\d+\.\d+\.\d+$/.test(version));
  const sections = changelog.replace(/\r\n/g, "\n").split(/^## /m).slice(1);
  const matches = sections.filter((section) => section.split("\n", 1)[0] === version);
  assert.equal(matches.length, 1, `Expected one changelog section for ${version}`);
  const notes = matches[0].slice(version.length).trim();
  assert(notes, "Release notes must not be empty");
  return notes + "\n";
}
