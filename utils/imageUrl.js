export const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);

const buildCloudinaryUrl = (publicId) => {
  if (!publicId) return null;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || 'dlhp3v3fd';
  return `https://res.cloudinary.com/${cloud}/image/upload/${publicId}`;
};

const buildUploadsUrl = (filename) => {
  if (!filename) return null;
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  return `${base}/uploads/${filename}`;
};

// Heuristic to detect cloudinary public id-ish strings
const looksLikePublicId = (s) => typeof s === 'string' && /^(v\d+\/)?[\w\-\/]+(\.[a-zA-Z0-9]+)?$/.test(s);

export const resolveMediaUrl = (value) => {
  if (!value) return null;

  // If object from SDK
  if (typeof value === 'object') {
    const { secure_url, url, public_id, publicId, path } = value;
    return secure_url || url || (public_id || publicId ? buildCloudinaryUrl(public_id || publicId) : (path ? buildUploadsUrl(path) : null));
  }

  const s = String(value);
  if (isHttpUrl(s)) return s; // already a URL
  if (s.includes('cloudinary') || s.includes('res.cloudinary.com')) return s; // domain in string
  if (looksLikePublicId(s)) return buildCloudinaryUrl(s);
  return buildUploadsUrl(s); // legacy local filename
};
