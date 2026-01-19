# EZComm Setup Guide

## GitHub Secrets Required

Add these secrets in your GitHub repository:
Settings → Secrets and variables → Actions → New repository secret

### Required Secrets:
1. **AWS_ACCESS_KEY_ID** - AWS IAM user access key
2. **AWS_SECRET_ACCESS_KEY** - AWS IAM user secret key
3. **AWS_REGION** (optional, default: us-east-1)
4. **EC2_HOST** - Your EC2 instance public IP
5. **EC2_SSH_KEY** - Private SSH key for EC2 access

### How to Get AWS Credentials:
1. Go to AWS Console → IAM → Users
2. Create new user with programmatic access
3. Attach policies: `AmazonEC2FullAccess`
4. Copy Access Key ID and Secret Access Key

### How to Generate SSH Key for EC2:
```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -f ~/.ssh/ezcomm-ec2

# Copy private key content
cat ~/.ssh/ezcomm-ec2

# Add public key to EC2
ssh-copy-id -i ~/.ssh/ezcomm-ec2.pub ubuntu@your-ec2-ip