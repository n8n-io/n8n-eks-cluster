#!/usr/bin/env node
import 'source-map-support/register'
import { App } from 'aws-cdk-lib'
import {
  addons,
  CreateCertificateProvider,
  EksBlueprint,
  LookupHostedZoneProvider,
} from '@aws-quickstart/eks-blueprints'
import assert = require('assert')

const domainName = process.env.DOMAIN_NAME ?? 'aws.8n8.io'
const region = process.env.AWS_REGION ?? 'eu-central-1'

assert(domainName, 'DOMAIN_NAME env variable not set')

EksBlueprint.builder()
  .version('auto')
  .region(region)
  .resourceProvider('hostedZone', new LookupHostedZoneProvider(domainName))
  .resourceProvider('rootCert', new CreateCertificateProvider('rootCert', domainName, 'hostedZone'))
  .resourceProvider('wildcardCert', new CreateCertificateProvider('wildcardCert', `*.${domainName}`, 'hostedZone'))
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
    // new addons.CalicoOperatorAddOn(),
    // new addons.ClusterAutoScalerAddOn(),
    // new addons.ArgoCDAddOn(),
  )
  .useDefaultSecretEncryption(true)
  .build(new App(), 'n8n-eks-cluster')


/**
 * TODO:
 * - setup CNAME for `*.domainName`
 */
