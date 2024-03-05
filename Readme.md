# Disclaimer: This repo is not production-ready
This repo only serves as a starting point to deploy n8n on top of AWS EKS in a scalable way.  
However it is [missing some key things](#currently-not-implemented) before it could be considered production-ready.
If you decide to deploy this to a production, please make sure to follow the infrastructure best practices in your organization.

# Multi-instance n8n setup on AWS EKS

This repo contains the code to:

1. Deploy an EKS cluster with recommended best practices
2. Deploy nginx ingress controller, with TLS termination on AWS NLBs
3. Deploy **multiple instances of n8n** as Helm installations, either as single pods, or in a scalable architecture.

## Setup

To run this code, you'd need to have

1. the latest [Node.js](https://nodejs.org/) installed.
2. [AWS CLI](https://github.com/aws/aws-cli) setup and configured with credentials that allow creating new Cloudformation stacks.
3. [Kubernetes CLI client `kubectl`](https://kubernetes.io/docs/reference/kubectl/)
4. [Helm CLI client](https://helm.sh/docs/intro/install/)
5. A domain to run this infrastructure on. You can either set this domain in the env variable `DOMAIN_NAME`, or edit the value directly in [`bin/n8n-eks-cluster.ts`](bin/n8n-eks-cluster.ts#L12)
6. You can also change the AWS region to deploy this to by setting the env variable `AWS_REGION` to the region name. This defaults to `eu-central-1`

After setting these up, and cloning this repo, go through the following steps to deploy an EKS cluster:

1. run `corepack prepare --activate` to tell Node.js to setup the correct version of the package manager used in this repo.
2. run `pnpm install` to install all the dependencies
3. run `pnpm run deploy` to deploy the Cloudformation stack that includes the EKS cluster, and all the addons needed for it.

Once the deploy process is finished (it can take between 10-20 minutes), you'll see a `aws eks update-kubeconfig ...` in the console. Run that command to setup the `kubectl` context, to be able to talk to the Kubernetes API.

Once these steps are done, you will have a fully functional Kubernetes cluster with nginx as ingress controller, ready to accept n8n deployments.

## Deploying an n8n instance

To deploy an n8n instance, you first need to pick a name for the instance.
This name will be used in naming resources, and also for DNS.
For this example, we'll go with the name `test`, and the domain `aws.8n8.io`

1. Create a namespace to deploy all instance specific resources into: `kubectl create namespace test`.
2. Customize `n8n/values.yaml` to customize the instance.
3. Deploy the instance with `helm install -n test test n8n --wait --timeout=180s`, and wait a couple of minutes for the command to finish.
4. Go to https://test.aws.8n8.io/ to access the instance.

### Customizing the instance

You can customize the instance by changing the values in `n8n/values.yaml`.

- `n8n.baseDomainName`: This the base domain name for all instances. Every instance gets a subdomain based on the instance name and this base domain.
- `n8n.encryptionKey`: This is the encryption key that n8n uses to encrypt all it's data.
- `n8n.deploymentMode`:
  - When set to `single`, this will deploy a single instance, and use sqlite as the DB (backed by an EBS for persistence). This can be used for test/staging instances, but not recommended to be used for production workloads.
  - When set to `scale`, this will deploy postgres, redis, and 3 separate n8n services
    - `main`: The frontend, and the REST API for n8n. This cannot be scaled up right now.
    - `webhook`: The http server to handle all incoming webhook requests. This can be scaled to handle higher volumes of traffic.
    - `worker`: This service performs the actual workflow executions. This can also be scaled to increase the system's throughput.
- `n8n.storageSize`: This is the size of the persistent storage volumes. Defaults to 10 GB.
- `n8n.concurrency`: This determines how many parallel executions an n8n worker would process at any time. Defaults to 20.
- `resources.memoryLimit`: This is set as the maximum memory available to any container in the system.


## Currently Not Implemented
- **External Postgres**: This setup currently deploy postgres as a container in the same namespace as n8n. This setup is missing key things for the database like high-availability, automatic backups, automatic failover, etc. We highly recommend using RDS or some other mature postgres deployment mechanism for any production usage.
- **Pod autoscaling**: Underlying EC2 setup already uses autoscaling groups, however the kubernetes deployments of n8n aren't using any autoscaling mechanism yet. Until this is implemented, the kubernetes deployments need to be manually scaled.
- **Secrets management**: The example encryption Key for n8n, and the database credentials for postgres are defined in [n8n/values.yaml](n8n/values.yaml). If you chose to deploy this to production, you'd need to modify these values manually, and make sure to not check in these values into this git repo. We are evaluating adding support for [AWS secrets manager](https://aws.amazon.com/secrets-manager/) and/or [External Secrets Operator](https://external-secrets.io), but there is currently no ETA on this.
- **Multi-main**: In the current setup, while worker and webhook deployments can scale, there is only one container running the main API that the frontend talks to to. To make sure that this API is highly available, we need to switch over to a multi-main mode. This is already implemented in core n8n, and is currently under heavy testing. Once we deem it ready for production usage, we'll update this repo.
- **Binary Data Storage on S3**: N8N can store workflow binary data either on S3 or on a local filesystem. This repo currently uses local filesystem backed by kubernetes persistent volumes. This needs to change before we can support multi-main mode in this repo. 
- **Automatic Disaster Recovery**: This is out of scope for this repo.
