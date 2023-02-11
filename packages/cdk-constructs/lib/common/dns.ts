import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";
import { createSafeBranchName, isMainBranch } from "./utils";

export type HostedZoneResolution =
  | string
  | {
      hostedZoneId?: string;
      zoneName: string;
    };

export const resolveHostedZone = (
  scope: Construct,
  id: string,
  opt: HostedZoneResolution | route53.IHostedZone
) => {
  if (opt instanceof route53.HostedZone) return opt;

  if (typeof opt === "string")
    return route53.HostedZone.fromLookup(scope, id, {
      domainName: opt,
    });

  if (opt.hostedZoneId === undefined)
    return route53.HostedZone.fromLookup(scope, id, {
      domainName: opt.zoneName,
    });

  return route53.HostedZone.fromHostedZoneAttributes(scope, id, {
    hostedZoneId: opt.hostedZoneId!,
    zoneName: opt.zoneName,
  });
};

/**
 * Create a domain name
 * @param subDomain The left most part of the domain
 * @param zone Either a string or route53 host resolution properties
 * @param branch If a branch is passed, it is concatenated to the domain name to create routable domains from feature branches
 * @returns
 */
export const createDomainName = (
  subDomain: string,
  zone: HostedZoneResolution | route53.IHostedZone,
  branch?: string
) => {
  const cname =
    !branch || isMainBranch(branch)
      ? subDomain
      : `${subDomain}-${createSafeBranchName(branch)}`;

  const domain = typeof zone === "string" ? zone : zone.zoneName;
  return `${cname}.${domain}`;
};
