# AWS-RDP-PRODUCTIVITY

Fetch files from multiple RDPs using the RDP protocol and AWS Lambda + S3 as file-hosts, and have the ability to run commands on RDPs

## Setup

### Disable Startup app program whitelist on RDPs

1. Launch RDP
1. Run `regedit.exe`.
1. Navigate to `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Terminal Server\TSAppAllowList`.
1. Locate and change `fDisableAllowList` from `0` to `1`.

OR

1. Launch RDP
2. Run `/lib/RemoveWhitelist.reg` on RDP

### Avoiding S3 Global Namespace Conflicts

1. CTRL+SHIFT+F "aws-rdp-productivity-backend-v1", replace with a service name of your choosing. This service-name is used in 2 key place, ensure it is consistent in those 2 places.

    `backend/serverless.yml -> "service" property`

    `lib/config.json -> "upload_bucket_url" property`

    `binary/package.json -> "host" script`

    `/package.json -> "fetch" script`

### Serverless Infrastructure

1. Setup and configure AWS-CLI with AWS credentials
2. Install the serverless framework library

    `npm install serverless -g`

3. Deploy the serverless infrastructure

    `cd backend`

    `npm run deploy`

4. Copy the "/upload" and "/clear" endpoints outputted in the CLI to /lib/config.json

### Binary

1. Build the binary

    `cd binary`

    `npm run build`

2. Host the binary on the S3 bucket

    `npm run host`

3. The program will assume the URL for the hosted binary is `https://aws-rdp-productivity-backend-v1-upload-bucket.s3.amazonaws.com/aws-rdp-productivity-upload.exe`, although this can be changed in the config, if necessary. If you changed the service-name, make sure the URL for this hosted-binary is updated with the correct service-name.

4. If you receive build errors, try installing NASM or VSCode build tools, more info can be found on the NEXE repository

## Usage

1. Configure /lib/config.json with the following properties

```js
{
    "path": "C:\\Users\\Admin\\Desktop\\test-directory", // Path to upload directory
    "prefix": "test", // Prefix of upload file; first matching file is uploaded
    "username": "Administrator", // Username of RDPs
    "password": "ASD2Q3ERAEFWE", // Password of RDPs
    "rdp_delay": 30000, // Delay to wait for initialization and connection to RDP
    "terminate_delay": 90000, // Delay to wait until complete termination of all RDP processes
    "instances": [
        "192.168.1.1" // RDP IPs
    ],
    "upload_endpoint": "https://abc.execute-api.us-east-1.amazonaws.com/upload", // Upload endpoint configured in the serverless infrastructure setup
    "clear_endpoint": "https://abc.execute-api.us-east-1.amazonaws.com/clear", // Clear endpoint configured in the serverless infrastructure setup
    "upload_bucket_url": "https://aws-rdp-productivity-backend-v1-upload-bucket.s3.amazonaws.com/upload.exe" // The hosted upload executable, by default this is static unless changed.

}
```

2. Install dependencies and run the program

    `npm run start`

3. Explore output at /parsed and /raw

## How it works

AWS Lambda & S3 are used as file-hosts. Files are uploaded to these file-hosts through an executable, hosted on S3 and executed on the remote machines through the RDP protocol. Upon uploading all files, the files are downloaded locally, and removed from S3.

## Notes

-   Beware of certificate warnings upon first launch of RDPs, check mark the warnings, and make sure they're not re-emitted.
-   If the RDP delay is not long enough, the RDP windows will terminate upon the initialization function being returned; ensure the delay is long enough.
