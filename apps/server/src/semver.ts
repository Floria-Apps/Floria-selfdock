export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export type UpdateClassification =
  | 'current'
  | 'patch'
  | 'minor'
  | 'major'
  | 'unknown'
  | 'floating'
  | 'digest'
  | 'uncomparable'
  | 'error';

export function parseSemVer(tag: string): SemVer | null {
  const clean = tag.replace(/^v/, '');
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+[a-zA-Z0-9.-]+)?$/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4],
  };
}

export function classifyUpdate(currentTag: string, remoteTag: string, currentDigest?: string, remoteDigest?: string): UpdateClassification {
  if (currentTag.includes('@sha256:') || (currentDigest && remoteDigest && currentDigest === remoteDigest)) {
    if (currentTag === remoteTag || !remoteTag || remoteTag === 'latest') return 'current';
  }

  if (['latest', 'stable', 'alpine', 'edge', 'nightly', 'lts'].includes(currentTag)) {
    if (currentDigest && remoteDigest && currentDigest !== remoteDigest) return 'floating';
    return 'current';
  }

  const cur = parseSemVer(currentTag);
  const rem = parseSemVer(remoteTag);

  if (!cur || !rem) {
    if (currentDigest && remoteDigest && currentDigest !== remoteDigest) return 'unknown';
    return 'uncomparable';
  }

  if (rem.major > cur.major) return 'major';
  if (rem.major === cur.major && rem.minor > cur.minor) return 'minor';
  if (rem.major === cur.major && rem.minor === cur.minor && rem.patch > cur.patch) return 'patch';

  return 'current';
}
