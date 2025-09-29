import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const bucket = process.env.EMAIL_BUCKET;

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,GET',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };

  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const query = event.queryStringParameters || {};

  if (method === 'OPTIONS') {
    // Handle CORS preflight
    return { statusCode: 204, headers, body: '' };
  }

  if (method === 'GET' && path === '/') {
    // === Return all subdomain index files ===
    try {
      // List all index files (per subdomain)
      const list = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'index/',
      }));

      const indexFiles = list.Contents || [];
      const response = {};

      for (const file of indexFiles) {
        const folder = file.Key.replace('index/', '').replace('.json', '');
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: file.Key }));
        const body = await obj.Body.transformToString();
        response[folder] = JSON.parse(body);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response)
      };
    } catch (err) {
      console.error("Error loading index files:", err);
      return { statusCode: 500, headers, body: 'Failed to load email index.' };
    }
  }

  if (method === 'GET' && path === '/email') {
    // === Return full JSON content of an individual email ===
    const key = query.key;
    if (!key || !/^[a-z0-9.\-/]+\.(json)$/i.test(key)) {
      return { statusCode: 400, headers, body: 'Invalid email key.' };
    }

    try {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const json = await result.Body.transformToString();
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: json
      };
    } catch (err) {
      console.error("Email not found:", err);
      return { statusCode: 404, headers, body: 'Email not found.' };
    }
  }

  if (method === 'GET' && path === '/download') {
    // === Return file download (.eml, .txt, or .json) ===
    const key = query.key;
    if (!key || !/^[a-zA-Z0-9._\-\/]+$/i.test(key)) {
      return { statusCode: 400, headers, body: 'Invalid download key.' };
    }

    try {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bodyBuffer = await result.Body.transformToByteArray();
      const extension = key.split('.').pop();
      const contentType = {
        eml: 'message/rfc822',
        txt: 'text/plain',
        json: 'application/json'
      }[extension] || 'application/octet-stream';

      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          ...headers,
          'Content-Type': result.ContentType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`
        },
        body: Buffer.from(bodyBuffer).toString('base64')
      };
    } catch (err) {
      console.error("Download failed:", err);
      return { statusCode: 404, headers, body: 'File not found.' };
    }
  }

  // Fallback for unsupported routes
  return {
    statusCode: 404,
    headers,
    body: 'Not found.'
  };
};
