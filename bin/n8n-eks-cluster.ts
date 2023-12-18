#!/usr/bin/env node
import 'source-map-support/register'
import { App, aws_ec2, aws_eks } from 'aws-cdk-lib'
import {
  addons,
  AckServiceName,
  MngClusterProvider,
  CreateCertificateProvider,
  EksBlueprint,
  LookupHostedZoneProvider,
} from '@aws-quickstart/eks-blueprints'
import assert = require('assert')
import { ACM } from 'aws-sdk';

const domainName = process.env.DOMAIN_NAME ?? 'aws.8n8.io'
const region = process.env.AWS_REGION ?? 'eu-central-1'

assert(domainName, 'DOMAIN_NAME env variable not set')

async function checkCertificates(domain_name: string,) {
  const acm = new ACM({ region }); 
  try {
    const certificates = await acm.listCertificates({}).promise();

    let rootCertExists = false;
    let wildcardCertExists = false;
    
    certificates.CertificateSummaryList?.forEach((cert) => {
      if (cert.DomainName === domain_name) {
        rootCertExists = true;
      }
      if (cert.DomainName === `*.${domain_name}`) {
        wildcardCertExists = true;
      }
    });

    return { rootCertExists, wildcardCertExists };
  } catch (error) {
    console.error("Error checking certificates:", error);
    throw error; // Rethrow the error to be handled by the caller
  }
}

(async () => {
  const { rootCertExists, wildcardCertExists } = await checkCertificates(domainName);

  const blueprint = EksBlueprint.builder()
  .version('auto')
  .region(region)
  .resourceProvider('hostedZone', new LookupHostedZoneProvider(domainName))
  .clusterProvider(new MngClusterProvider({
    id: 'n8n-eks-nodes',
    minSize: 8,
    maxSize: 10,
    desiredSize: 8,
    instanceTypes: [new aws_ec2.InstanceType('m5.large')],
  }))
  .addOns(
    new addons.VpcCniAddOn(),
    new addons.CoreDnsAddOn(),
    new addons.ExternalDnsAddOn({
      hostedZoneResources: ['hostedZone']
    }),
    new addons.EbsCsiDriverAddOn(),
    new addons.AwsLoadBalancerControllerAddOn(),
    new addons.NginxAddOn({
      externalDnsHostname: domainName,
      certificateResourceName: 'wildcardCert',
    }),
    new addons.MetricsServerAddOn(),
    new addons.KubeProxyAddOn(),
    new addons.AckAddOn({
      id: "rds-ack",
      serviceName: AckServiceName.RDS,
      saName: "rds-chart",
      name: "rds-chart",
      chart: "rds-chart",
      release: "rds-chart",
      version: "1.1.8",
      repository: "oci://public.ecr.aws/aws-controllers-k8s/rds-chart",
      managedPolicyName: "AmazonRDSFullAccess",
      createNamespace: true,
    }),
    // new addons.ClusterAutoScalerAddOn(),
  );
  
  if (!rootCertExists) {
    blueprint.resourceProvider('rootCert', new CreateCertificateProvider('rootCert', domainName, 'hostedZone'));
  }

  if (!wildcardCertExists) {
    blueprint.resourceProvider('wildcardCert', new CreateCertificateProvider('wildcardCert', `*.${domainName}`, 'hostedZone'));
  }

  blueprint.useDefaultSecretEncryption(true)
    .build(new App(), 'n8n-eks-cluster');
})();

/**
 * TODO:
 * - setup CNAME for `*.domainName`
 */
