import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { simpleParser } from "mailparser";

const s3Client = new S3Client();
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient());
const bucket = process.env.EMAIL_BUCKET;
const table = process.env.EMAIL_TABLE;
const emailDomain = process.env.EMAIL_DOMAIN; // e.g. "example.co.nz"

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

      // Use SES message ID as the file key (guaranteed unique, no collisions)
      const baseKey = `mail/${subdomain}/${messageId}`;

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
        })),
        // Write email summary to DynamoDB for fast listing
        ddbClient.send(new PutCommand({
          TableName: table,
          Item: {
            subdomain,
            messageId,
            baseKey,
            from: parsed.from?.text || '',
            to: parsed.to?.text || '',
            subject: parsed.subject || '',
            date: parsed.date?.toISOString() || new Date().toISOString(),
            ttl: Math.floor((parsed.date || new Date()).getTime() / 1000) + (30 * 24 * 60 * 60),
          }
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

      console.log(`Processed email ${messageId} → ${baseKey}`);

      // Delete the raw SES email (non-critical, don't block on failure)
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: `inbound/${messageId}`
        }));
      } catch (delErr) {
        console.warn(`Could not delete raw email ${messageId}:`, delErr.message);
      }
    }

    return { statusCode: 200 };
  } catch (err) {
    console.error("Email processing failed:", err);
    throw err;
  }
};

// Retrieves the raw .eml file deposited by SES into the 'inbound/' prefix
async function getRawEmail(messageId) {
  const result = await s3Client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: `inbound/${messageId}`
  }));
  return await result.Body.transformToString();
}

// Extracts the subdomain from the email address, e.g. support@acme.example.co.nz → 'acme'
function extractSubdomain(address) {
  const escaped = emailDomain.replace(/\./g, '\\.');
  const match = address.toLowerCase().match(new RegExp(`@(.+?)\\.${escaped}$`));
  return match ? match[1] : 'unknown';
}
