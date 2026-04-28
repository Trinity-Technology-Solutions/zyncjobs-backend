import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET || 'qa-zync-jobs';

export async function uploadResumeToS3(buffer, originalName) {
  const key = `resumes/${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
  await new Upload({
    client: s3,
    params: { Bucket: BUCKET, Key: key, Body: buffer }
  }).done();
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}

export async function deleteResumeFromS3(fileUrl) {
  try {
    const url = new URL(fileUrl);
    const key = url.pathname.slice(1);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (_) {}
}

export async function getResumeStreamFromS3(fileUrl) {
  const url = new URL(fileUrl);
  const key = url.pathname.slice(1);
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return {
    stream: response.Body,
    contentType: response.ContentType || 'application/pdf',
    contentLength: response.ContentLength
  };
}
