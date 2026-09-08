export function isProtectedArtifactPath(path) {
  return path.split(/[\\/]/).some(part => part.startsWith(".") || /^(node_modules|credentials|secrets)$/i.test(part))
    || /\.(pem|key|p12|sqlite\d*|db\d*|mdb|accdb)(?:-(?:wal|shm|journal))?$/i.test(path);
}

export function hasSqliteHeader(bytes) {
  return bytes.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"));
}
