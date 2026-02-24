# Wildmail

**Wildmail** is a self-hosted email inbox system that lets you receive email to **any address at any subdomain** of a domain you control — without having to create mailboxes first. For example:

* `user@company1.example.com`
* `test1@dev.clientsite.example.com`
* `alice@projectX.example.com`

Emails are automatically stored in a folder based on the **subdomain**, which is created if it doesn't already exist. You can then view and manage emails using a simple front-end web interface.

---

## Use Case

Wildmail is ideal for testing environments where you want to generate multiple user accounts for client applications or internal systems without manually creating inboxes.

Example:

* Testing signup flows with `user1@client.example.com`, `user2@client.example.com`, etc.

---

## How It Works

```
Email to anything@sub.example.co.nz
        │
        ▼
  Amazon SES (receive rule)
        │
        └─▶ S3 (inbound/<messageId>)
                 │
                 ▼
        Lambda (wildmail-email-processor)
                 │
                 ├─ Extract subdomain from recipient address
                 ├─ Parse email using mailparser
                 ├─ Save .eml, .txt, .json to S3 (mail/<subdomain>/<messageId>.*)
                 ├─ Save attachments to S3 (mail/<subdomain>/<messageId>_attachments/)
                 ├─ Write email summary to DynamoDB
                 └─ Delete raw inbound email from S3
```

---

## Technology Stack

* **Amazon SES** – for receiving email to wildcard subdomains.
* **AWS Lambda** – for processing inbound emails and exposing an API.
* **Amazon S3** – to store email content and host the front-end SPA.
* **Amazon DynamoDB** – for fast email listing with automatic TTL expiry.
* **React SPA** – for viewing emails in-browser (with and without auth).
* **Cognito + Entra ID** – for optional authentication.

---

## Installation

### 1. Prerequisites

Install Node.js and npm:

> [https://docs.npmjs.com/downloading-and-installing-node-js-and-npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

You’ll also need:

* An AWS account
* A verified SES domain
* An S3 bucket for **email storage** (e.g. `wildmail-storage`)
* An S3 bucket for **hosting the SPA** (e.g. `wildmail-spa`)
* A DynamoDB table for **email indexing** (e.g. `wildmail-emails`)

---

### 2. S3 Buckets

#### Storage Bucket

* Create an S3 bucket to store emails (e.g. `wildmail-storage`)
* Add a lifecycle rule with prefix `mail/` to expire objects after 30 days

#### SPA Bucket

* Create another S3 bucket to host the front-end (e.g. `wildmail-spa`)
* Enable **Static Website Hosting** in the Properties tab.
* Disable "Block all public access".
* Add this bucket policy to allow public access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::wildmail-spa/*"
    }
  ]
}
```

---

### 3. IAM Policies

Create two IAM policies (replace `wildmail-storage` and `wildmail-emails` with your actual resource names):

#### Processor Lambda Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::wildmail-storage/*"
    },
    {
      "Effect": "Allow",
      "Action": "dynamodb:PutItem",
      "Resource": "arn:aws:dynamodb:*:*:table/wildmail-emails"
    }
  ]
}
```

#### API Lambda Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::wildmail-storage/*"
    },
    {
      "Effect": "Allow",
      "Action": "dynamodb:Scan",
      "Resource": "arn:aws:dynamodb:*:*:table/wildmail-emails"
    }
  ]
}
```

---

### 4. DynamoDB Table

Create a DynamoDB table for email indexing:

* **Table name**: e.g. `wildmail-emails`
* **Partition key**: `subdomain` (String)
* **Sort key**: `messageId` (String)
* **Capacity mode**: On-demand
* **TTL**: Enable on attribute `ttl` (auto-deletes items after 30 days)

---

### 5. Lambda Functions

#### `wildmail-email-processor` (build locally)

```bash
cd wildmail-email-processor
npm install
zip -r wildmail-email-processor.zip index.mjs node_modules
```

Upload to Lambda (Node.js 18+ runtime), set environment variables:

```
EMAIL_BUCKET=wildmail-storage
EMAIL_TABLE=wildmail-emails
EMAIL_DOMAIN=example.co.nz
```

Attach the **Processor Lambda Policy** from step 3.

#### `wildmail-email-api` (simple Lambda)

* Upload `index.mjs` from `wildmail-email-api/` folder (no `npm install` needed — uses Lambda runtime SDK)
* Set environment variables:

  ```
  EMAIL_BUCKET=wildmail-storage
  EMAIL_TABLE=wildmail-emails
  ```
* Attach the **API Lambda Policy** from step 3
* Create an HTTP API in API Gateway and point it to this Lambda

---

### 6. SES Setup

1. **Verify your domain in SES** (e.g. `example.co.nz`)

2. **Set up wildcard MX in DNS**
   For Route 53:

   * Record name: `*`
   * Type: `MX`
   * Value: `10 inbound-smtp.your-region.amazonaws.com`

3. **SES Rule Set:**

   * Create a rule set for `.example.com` to match all subdomains
   * Rule 1: Store raw email in S3 → prefix `inbound/`
   * Rule 2: Invoke Lambda `wildmail-email-processor`

Make sure SES and Lambda have the necessary IAM permissions.

---

### 7. Front-End SPA

Choose:

* `wildmail-spa/no auth/` — no login, protected via VPC/network
* `wildmail-spa/auth/` — uses Cognito + Entra ID

Install dependencies:

```bash
npm install @chakra-ui/react@2 @emotion/react @emotion/styled framer-motion axios react-split react-icons
```

Set your `.env`:

```env
REACT_APP_API_URL=https://<your-api-url>
REACT_APP_COGNITO_CLIENT_ID=...
REACT_APP_COGNITO_DOMAIN=https://...
```

Run locally:

```bash
npm start
```

Build for production:

```bash
npm run build
```

Upload contents of the `build/` folder to your SPA S3 bucket.

---

## License / Credit

Original idea inspired by [Michael Fincham](https://git.sr.ht/~fincham/) — this is a clean rewrite. All issues are the responsibility of this repo.
