import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { simpleParser } from "mailparser";

const s3Client = new S3Client();
const bucket = process.env.EMAIL_BUCKET;

export const handler = async (event) => {
  try {
    for (const record of event.Records) {
      // Extract SES message ID and retrieve the raw email from S3
      const messageId = record.ses.mail.messageId;
      const rawEmail = await getRawEmail(messageId);

      // Parse the raw email content using mailparser
      const parsed = await simpleParser(rawEmail);

      // Extract the subdomain (used as folder name) from the recipient address
      const subdomain = extractSubdomain(parsed.to?.value?.[0]?.address || '');

      // Use timestamp to create a unique base key for storing files
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseKey = `${subdomain}/${timestamp}`;

      // Construct a plain text version of the email
      const txtContent = [
        `From: ${parsed.from?.text ?? ''}`,
        `To: ${parsed.to?.text ?? ''}`,
        '',
        parsed.text ?? '[No text body]'
      ].join('\n');

      // Upload the original email (.eml), JSON metadata, and plain text version
      await Promise.all([
        s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `${baseKey}.eml`,
          Body: rawEmail
        })),
        s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `${baseKey}.json`,
          Body: JSON.stringify({
            from: parsed.from?.text,
            to: parsed.to?.text,
            subject: parsed.subject,
            date: parsed.date,
            text: parsed.text,
            html: parsed.html,
            attachments: (parsed.attachments || []).map(att => ({
              filename: att.filename,
              contentType: att.contentType,
              size: att.size
            }))
          }),
          ContentType: 'application/json'
        })),
        
        s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `${baseKey}.txt`,
          Body: txtContent,
          ContentType: 'text/plain'
        }))
      ]);
      for (const attachment of parsed.attachments || []) {
        const key = `${baseKey}_attachments/${attachment.filename}`;
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: attachment.content,
          ContentType: attachment.contentType
        }));
      }
      // Define the path to the summary index file for this subdomain
      const indexKey = `index/${subdomain}.json`;

      // Create a new entry for the email
      const newEntry = {
        id: baseKey,
        from: parsed.from?.text,
        to: parsed.to?.text,
        subject: parsed.subject,
        date: parsed.date,
        folder: subdomain
      };

      let index = [];

      // Attempt to retrieve the existing index file
      try {
        const existing = await s3Client.send(new GetObjectCommand({
          Bucket: bucket,
          Key: indexKey
        }));
        const body = await existing.Body.transformToString();
        index = JSON.parse(body);
      } catch (err) {
        // If the index file doesn't exist yet, that's okay
        if (err.name !== 'NoSuchKey') throw err;
      }

      // Keep only entries from the last 30 days
      const now = new Date();
      index = index.filter(item => {
        const age = now - new Date(item.date);
        return age < 1000 * 60 * 60 * 24 * 30; // 30 days in ms
      });

      // Add the new email entry to the index
      index.push(newEntry);

      // Upload the updated index back to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: indexKey,
        Body: JSON.stringify(index),
        ContentType: 'application/json'
      }));
    }

    return { statusCode: 200 };
  } catch (err) {
    console.error("Email processing failed:", err);
    throw err;
  }
};

// Retrieves the raw .eml file stored by SES under the 'emails/' prefix
async function getRawEmail(messageId) {
  const result = await s3Client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: `emails/${messageId}`
  }));
  return await result.Body.transformToString();
}

// Extracts the subdomain from the email address, e.g. support@acme.comail.co.nz → 'acme'
function extractSubdomain(address) {
  const match = address.toLowerCase().match(/@(.+?)\.comail\.co\.nz$/);
  return match ? match[1] : 'unknown';
}

// Extracts the subdomain from the email address, e.g. support@acme.example.co.nz → 'acme'
function extractSubdomain(address) {
  const match = address.toLowerCase().match(/@(.+?)\.example\.co\.nz$/);
  return match ? match[1] : 'unknown';
}
