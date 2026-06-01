import AWS from 'aws-sdk';
import crypto from 'crypto';

const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET || 'zyncjobs.com';

export async function uploadResumeToS3(buffer, originalName) {
  const key = `resumes/${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
  await s3.upload({ Bucket: BUCKET, Key: key, Body: buffer }).promise();
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
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
      fileUrl: `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`,
      fileHash: hash,
      alreadyExists: true
    };
  } catch (err) {
    if (err.code !== 'NotFound' && err.statusCode !== 404) throw err;
  }

  await s3.upload({ Bucket: BUCKET, Key: key, Body: buffer }).promise();
  console.log(`[S3] Talent resume uploaded: ${key}`);
  return {
    fileUrl: `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`,
    fileHash: hash,
    alreadyExists: false
  };
}

export async function deleteResumeFromS3(fileUrl) {
  try {
    const url = new URL(fileUrl);
    const key = url.pathname.slice(1);
    await s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
  } catch (_) {}
}

export function getSignedResumeUrl(fileUrl, expires = 60) {
  const url = new URL(fileUrl);
  const key = url.pathname.slice(1);
  return s3.getSignedUrl('getObject', { Bucket: BUCKET, Key: key, Expires: expires });
}

export async function getResumeStreamFromS3(fileUrl) {
  const url = new URL(fileUrl);
  const key = decodeURIComponent(url.pathname.slice(1));
  console.log(`[S3] Streaming key: ${key}`);
  const head = await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
  return {
    stream: s3.getObject({ Bucket: BUCKET, Key: key }).createReadStream(),
    contentType: head.ContentType || 'application/pdf',
    contentLength: head.ContentLength
  };
}
