import AWS from 'aws-sdk';
import crypto from 'crypto';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Force path-style so SDK never generates dotted virtual-hosted URLs
// (*.s3.amazonaws.com wildcard cert doesn't cover bucket names with dots like zyncjobs.com)
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'ap-south-1',
  s3ForcePathStyle: true,
});
const BUCKET = process.env.S3_BUCKET || 'zyncjobs.com';

// Extract S3 key from any S3 URL format (virtual-hosted or path-style)
function extractS3Key(fileUrl) {
  const url = new URL(fileUrl);
  // path-style: s3.amazonaws.com/bucket/key  → pathname = /bucket/key
  if (url.hostname === 's3.amazonaws.com' || (url.hostname.startsWith('s3.') && !url.hostname.includes(BUCKET))) {
    return decodeURIComponent(url.pathname.replace(`/${BUCKET}/`, '/').slice(1));
  }
  // virtual-hosted: bucket.s3.region.amazonaws.com/key → pathname = /key
  return decodeURIComponent(url.pathname.slice(1));
}

// Convert any S3 URL to safe path-style URL (avoids SSL cert error for bucket names with dots)
export function toSafeS3Url(fileUrl) {
  if (!fileUrl) return fileUrl;
  try {
    const url = new URL(fileUrl);
    const region = process.env.AWS_REGION || 'ap-south-1';
    // Already path-style — return as-is
    if (url.hostname.startsWith('s3.') && !url.hostname.includes(BUCKET)) return fileUrl;
    // Virtual-hosted with dot bucket → convert to path-style
    if (url.hostname.includes(BUCKET)) {
      const key = decodeURIComponent(url.pathname.slice(1));
      return `https://s3.${region}.amazonaws.com/${BUCKET}/${key}`;
    }
    return fileUrl;
  } catch {
    return fileUrl;
  }
}

export async function uploadResumeToS3(buffer, originalName) {
  const key = `resumes/${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
  await s3.upload({ Bucket: BUCKET, Key: key, Body: buffer }).promise();
  return `https://s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${BUCKET}/${key}`;
}

// Hash-based upload for talent resumes — same file always gets same S3 key, no duplicates
export async function uploadTalentResumeToS3(buffer, originalName, fileHash) {
  const ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase() || '.pdf';
  const safeName = originalName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._\-]/g, '').replace(ext, '');
  const hash = fileHash || crypto.createHash('sha256').update(buffer).digest('hex');
  const shortHash = hash.substring(0, 8);
  const key = `talent-resumes/${safeName}_${shortHash}${ext}`;

  // Check if already exists in S3 — skip upload if so
  try {
    await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
    console.log(`[S3] Talent resume already exists, skipping upload: ${key}`);
    return {
      fileUrl: `https://s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${BUCKET}/${key}`,
      fileHash: hash,
      alreadyExists: true
    };
  } catch (err) {
    if (err.code !== 'NotFound' && err.statusCode !== 404) throw err;
  }

  await s3.upload({ Bucket: BUCKET, Key: key, Body: buffer }).promise();
  console.log(`[S3] Talent resume uploaded: ${key}`);
  return {
    fileUrl: `https://s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${BUCKET}/${key}`,
    fileHash: hash,
    alreadyExists: false
  };
}

// Upload job banner image — resizes to 1200x400, compresses, strips metadata
export async function uploadJobBannerToS3(buffer, originalName) {
  const ext = '.jpg';
  const timestamp = Date.now();
  const safeName = originalName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '')
    .replace(/\.[^.]+$/, '')
    .substring(0, 40);
  const key = `job-banners/${safeName}_${timestamp}${ext}`;

  let processedBuffer;
  try {
    processedBuffer = await sharp(buffer)
      .resize(1200, 400, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error('[S3] Sharp processing failed:', err.message);
    throw new Error('Image processing failed: ' + err.message);
  }

  await s3.upload({
    Bucket: BUCKET,
    Key: key,
    Body: processedBuffer,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable'
  }).promise();

  const fileUrl = `https://s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${BUCKET}/${key}`;
  console.log(`[S3] Job banner uploaded: ${key}`);
  return fileUrl;
}

// Upload job banner to local disk as fallback
export async function uploadJobBannerToDisk(buffer, originalName, uploadDir) {
  const ext = '.jpg';
  const timestamp = Date.now();
  const safeName = originalName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '')
    .replace(/\.[^.]+$/, '')
    .substring(0, 40);
  const filename = `${safeName}_${timestamp}${ext}`;
  const filePath = path.join(uploadDir, filename);

  let processedBuffer;
  try {
    processedBuffer = await sharp(buffer)
      .resize(1200, 400, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error('[Disk] Sharp processing failed:', err.message);
    throw new Error('Image processing failed: ' + err.message);
  }

  await fs.promises.mkdir(uploadDir, { recursive: true });
  await fs.promises.writeFile(filePath, processedBuffer);
  console.log(`[Disk] Job banner saved: ${filePath}`);
  return `/uploads/job-banners/${filename}`;
}

export async function deleteResumeFromS3(fileUrl) {
  try {
    const key = extractS3Key(fileUrl);
    await s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
  } catch (_) {}
}

export function getSignedResumeUrl(fileUrl, expires = 60) {
  const key = extractS3Key(fileUrl);
  return s3.getSignedUrl('getObject', { Bucket: BUCKET, Key: key, Expires: expires });
}

export async function getResumeStreamFromS3(fileUrl) {
  const key = extractS3Key(fileUrl);
  console.log(`[S3] Streaming key: ${key}`);
  const head = await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
  return {
    stream: s3.getObject({ Bucket: BUCKET, Key: key }).createReadStream(),
    contentType: head.ContentType || 'application/pdf',
    contentLength: head.ContentLength
  };
}
