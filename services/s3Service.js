import AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET || 'qa-zync-jobs';

export async function uploadResumeToS3(buffer, originalName) {
  const key = `resumes/${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
  await s3.upload({ Bucket: BUCKET, Key: key, Body: buffer }).promise();
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
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
  const key = url.pathname.slice(1);
  const head = await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
  return {
    stream: s3.getObject({ Bucket: BUCKET, Key: key }).createReadStream(),
    contentType: head.ContentType || 'application/pdf',
    contentLength: head.ContentLength
  };
}

// ===== COMPANY PROFILE IMAGE UPLOADS =====

/**
 * Upload company logo to S3
 */
export async function uploadCompanyLogoToS3(buffer, companyId, originalName) {
  const extension = originalName.split('.').pop().toLowerCase();
  const key = `company-logos/${companyId}-logo-${Date.now()}.${extension}`;
  
  const uploadParams = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: getContentType(extension),
    CacheControl: 'max-age=31536000', // 1 year cache
    ACL: 'public-read' // Make publicly accessible
  };
  
  await s3.upload(uploadParams).promise();
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}

/**
 * Upload company cover image to S3
 */
export async function uploadCompanyCoverToS3(buffer, companyId, originalName) {
  const extension = originalName.split('.').pop().toLowerCase();
  const key = `company-covers/${companyId}-cover-${Date.now()}.${extension}`;
  
  const uploadParams = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: getContentType(extension),
    CacheControl: 'max-age=31536000', // 1 year cache
    ACL: 'public-read' // Make publicly accessible
  };
  
  await s3.upload(uploadParams).promise();
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}

/**
 * Delete company image from S3
 */
export async function deleteCompanyImageFromS3(fileUrl) {
  try {
    const url = new URL(fileUrl);
    const key = url.pathname.slice(1);
    await s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
    return true;
  } catch (error) {
    console.error('Error deleting company image from S3:', error);
    return false;
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(extension) {
  const contentTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
  };
  
  return contentTypes[extension.toLowerCase()] || 'image/jpeg';
}
