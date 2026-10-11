/**
 * JSON Merge Patch (RFC 7396), used to apply a fixture's `manifestOverlay` to
 * `.cross-stack/standard.json`: objects merge recursively, `null` deletes a key, and arrays and
 * scalars replace the target value.
 *
 * @module
 */

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) setOwn(out, key, cloneJson(child));
  return out;
}

/**
 * Apply a JSON Merge Patch to a JSON value without mutating either argument.
 *
 * @param {unknown} target Current JSON value.
 * @param {unknown} patch Merge patch.
 * @returns {unknown} The patched value.
 */
export function applyMergePatch(target, patch) {
  if (!isPlainObject(patch)) return cloneJson(patch);
  const result = isPlainObject(target) ? cloneJson(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      const current = Object.prototype.hasOwnProperty.call(result, key) ? result[key] : undefined;
      setOwn(result, key, applyMergePatch(current, value));
    }
  }
  return result;
}
