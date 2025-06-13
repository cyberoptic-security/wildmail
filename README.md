# wildmail

wildmail is an email inbox that allows receiving email to any name @ any subdomain of a specified domain without having to create the account first e.g. user@company1.example.com, user2@company2.example.com, user1@company2.example.com. When email is received by wildmail, it is automatically stored in a folder that matches the subdomain, this folder will be automatically created if it doesn't already exist. Emails can then be viewed through the front end client.

The purpose of wildmail is for when you want to test systems for yourself or clients. For instance if you are testing a web application you may want multiple user accounts for testing different scenarios. 

wildmail will consider anything prepending the configured root domain as the folder.  e.g. user1@customer1.example.com will go in to the folder 'customer1', user1@app1.customer2.example.com will go in to the folder 'app1.customer2'.

wildmail is built using Amazon SES to receive the email and store in an S3 bucket. SES has the ability to receive email that is sent to any subdomain of a particular domain which makes it ideal for this purpose. It also allows us to trigger actions once mail has arrived. SES stores the original email in an S3 bucket, then triggers a lambda that processes the email. This lambda identifies the subdomain and stores the email in the correct folder, and then updates the index file.

A second lambda runs an API that allows us to pull down lists of emails, and email content. It also allows downloading of email files in .eml, .json, or .txt format.

Viewing of emails is via a React SPA. There are two version of this, one that does not have any auth built in, so acccess to the system must be added separately or based off network access. And an auth version that uses Cognito and Entra for authentication. auth also needs to have the API secured via CloudFront or similar.

## Installation

Install Node.js and npm if you don't already have it: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
This is required for building one of the lambdas, and for the front end SPA. 

Next step is to configure your AWS environment. You will need need an SES identity, and two S3 buckets.

### S3
  We need an S3 bucket for the storage of emails, and an s3 bucket to host the SPA.

  Create a bucket for storing the emails and call it something sensible, it will be referred to here as <wildmail-storage>. S3 buckets need globally unique names so choose your own one. This bucket will need some permissions assigned but AWS won't let us do this until the other bits are set up.
  Configure retention on this bucket if you do not want to keep the emails forever.

  Create a bucket for storing the SPA, and call that something sensible as well, it will be referred to here as <wildmail-spa>. This bucket needs to be configured for static website hosting, this option is at the bottom of the Properties tab for the bucket. Copy the S3 URL when it is turned on, this will be the address for your email client. You can use CloudFront if you would like to use a custom domain.
    This bucket will need to have 'Block all public access' disabled, and a permissions policy to allow access like:
```
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "PublicReadGetObject",
          "Effect": "Allow",
          "Principal": "*",
          "Action": "s3:GetObject",
          "Resource": "arn:aws:s3:::<wildmail-spa>/*"
        }
      ]
    }
```

### IAM

  We need to create two user roles that we can use to allow the two lambdas and the SES identity to access the S3 bucket.
  Create a policy in IAM called `wildmail-s3-write` and give it this permission policy:
  ```
  {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::<wildmail-storage>/*",
                "arn:aws:s3:::<wildmail-storage>"
            ]
        }
    ]
}
```

Create another policy in IAM called `wildmail-s3-read` and give it this permission policy:

  ```
  {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::<wildmail-storage>/*",
                "arn:aws:s3:::<wildmail-storage>"
            ]
        }
    ]
  }
  ```

We will use this to allow SES to put mail in the S3 bucket, and for the lambdas to process and read the email. 


### Lambdas

  There are two lambdas required, one to process the inbound email, wildmail-email-processor, and one for the API, wildmail-api. 

  #### wildmail-api
  This is the easy one so we'll do it first. Create a new lambda in your AWS account, and upload this code ensuring the file name is index.mjs.
  Allow the Lambda to create a role (if you haven't done it manually) and give it the `wildmail-s3-write` policy
  Create an environment variable for the lambda with the key `EMAIL_BUCKET` and the value of your S3 storage bucket.

  #### wildmail-email-processor
  Because this one needs to import some stuff from somewhere, then it needs to be built locally then the zip file uploaded. 
  in the wildmail-email-processor file run
  
  `npm init -y`
  
  and install the required dependencies
  
  `npm install mailparser @aws-sdk/client-s3`
  
  Then create a zip file containing the `index.mjs` file and the `node_modules` folder
  
  `zip -r wildmail-email-processor.zip index.js node_modules`

  Create a new lambda in AWS and upload this zip file.
    Allow the Lambda to create a role (if you haven't done it manually) and give it the `wildmail-s3-write` policy
    Create an environment variable for the lambda with the key `EMAIL_BUCKET` and the value of your S3 storage bucket.


### SES
  SES is used for receiving the emails. You will need to have control of the domain that you will be using, then create an identity for that domain in SES. Ensure that the idenity has been verified in SES before continuing. (or if it is taking some time then carry on and go back to it later)
  For the identity you then need to create two actions, one to store the incoming raw email in the S3 bucket, and a second to invoke the lambda for processing the email.

  Next is to ensure that your DNS is configured with a catchall MX record for email. In Route53 this can be done by creating an MX record and putting a * in the Record name field, other DNS hosts might be slightly different. Ensure the record points to the correct address for SES in your region. 

#### SES actions

  In SES go to Email receiving under Configuration. Create a rule set for your domain, and within the rule set create a rule. Set the recipient condition of the rule to be your domain name with a dot at the start e.g. `.example.com` This tells the rule to accept all email addressed to an example.com subdomain, but not to the root domain.
  Then create two Actions in the rule. 
  Action 1 is to store the email in your S3 bucket that yo uset up for email storage (not the one for hosting the SPA) with the Object key prefix to be `emails/`. This stores all incoming emails in the /emails/ folder in the email storage bucket.

  Action 2 is to invoke the wildmail-email-processor lambda. The invocation type is Event invocation.

  At some point it will want a role. Make one and give it the `wildmail-s3-write` policy.

### SPA

The front end is written in ReactJS. 
There are two folders in the `wildmail-spa` fodler . One with no auth, and one that has auth configured using Cognito and Entra. 

init your local environment and install dependecies
`npm install @chakra-ui/react@2 @emotion/react @emotion/styled framer-motion axios react-split react-icons`

update the .env file to ensure it has the correct API URL for the `wildmail-email-api` lambda.

test the SPA locally

`npm start`

one it is good to go, build it and upload the contents of the build folder to the <wildmail-spa> S3 bucket
`npm build`

