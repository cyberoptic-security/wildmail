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
Email to anything@sub.example.comail.co.nz
        │
        ▼
  Amazon SES (receive rule)
        │
        ├─▶ S3 (emails/)
        └─▶ Lambda (wildmail-email-processor)
                 │
                 ├─ Extract subdomain
                 ├─ Parse email using mailparser
                 ├─ Save .eml, .txt, .json to S3 (e.g. subdomain/timestamp.json)
                 └─ Update index/subdomain.json
```

---

## Technology Stack

* **Amazon SES** – for receiving email to wildcard subdomains.
* **AWS Lambda** – for processing inbound emails and exposing an API.
* **Amazon S3** – to store email content and host the front-end SPA.
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
* Two S3 buckets:

  * One for **email storage** (e.g. `wildmail-storage`)
  * One for **hosting the SPA** (e.g. `wildmail-spa`)

---

### 2. S3 Buckets

#### Storage Bucket

* Create an S3 bucket to store emails (e.g. `wildmail-storage`)
* Enable retention or lifecycle rules if you don't want to store email forever.

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

Create two policies in IAM:

#### `wildmail-s3-write`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::wildmail-storage/*",
        "arn:aws:s3:::wildmail-storage"
      ]
    }
  ]
}
```

#### `wildmail-s3-read`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::wildmail-storage/*",
        "arn:aws:s3:::wildmail-storage"
      ]
    }
  ]
}
```

---

### 4. Lambda Functions

#### `wildmail-email-processor` (build locally)

```bash
npm init -y
npm install mailparser @aws-sdk/client-s3
zip -r wildmail-email-processor.zip index.js node_modules
```

Upload to Lambda, set environment variable:

```
EMAIL_BUCKET=wildmail-storage
```

Attach the `wildmail-s3-write` IAM policy.

#### `wildmail-api` (simple Lambda)

* Upload `index.mjs` from `wildmail-api` folder
* Attach the same environment variable:

  ```
  EMAIL_BUCKET=wildmail-storage
  ```
* Attach the `wildmail-s3-write` policy

---

### 5. SES Setup

1. **Verify your domain in SES** (e.g. `comail.co.nz`)

2. **Set up wildcard MX in DNS**
   For Route 53:

   * Record name: `*`
   * Type: `MX`
   * Value: `10 inbound-smtp.your-region.amazonaws.com`

3. **SES Rule Set:**

   * Create a rule set for `.example.com` to match all subdomains
   * Rule 1: Store raw email in S3 → prefix `emails/`
   * Rule 2: Invoke Lambda `wildmail-email-processor`

Make sure SES and Lambda have the necessary IAM permissions.

---

### 6. Front-End SPA

Choose:

* `wildmail-spa/no-auth/` — no login, protected via VPC/network
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
