import * as cdk from "aws-cdk-lib";
import * as aws from "aws-sdk";
import { Construct } from "constructs";
import { CoreTags, Env } from "./constructs";

export const authorizedBranches = ["main", "master"];

export const isMainBranch = (branchName: string) =>
  authorizedBranches.includes(branchName);

export const createSafeBranchName = (branchName: string) => {
  const branchFragments = branchName.split("/");
  return branchFragments[branchFragments.length - 1]
    .replace(/[^A-Za-z0-9\\-]/g, "-") // Replace special chars with '-'
    .replace(/^([-]*)/g, "") // Trim leading '-'
    .replace(/([-]*)$/g, "") // Trim trailing '-'
    .substring(0, 63); // Domain part has max length of 63 chars
};

export const nameGenUtil =
  (opt: { root: string[]; suffix: string | undefined }) =>
  (...ids: string[]) => {
    return [...opt.root, ...ids, opt.suffix]
      .filter((x) => !!x)
      .join("-")
      .toLowerCase();
  };

export const namingFunc = (opt: {
  environment: Env;
  branch: string;
  root: string[];
  useEnvironmentName?: () => boolean;
}) => {
  const useEnvironmentNaming = !!opt.useEnvironmentName
    ? opt.useEnvironmentName()
    : true;

  const suffix = isMainBranch(opt.branch)
    ? useEnvironmentNaming
      ? opt.environment
      : undefined
    : createSafeBranchName(opt.branch);

  return nameGenUtil({
    root: opt.root,
    suffix: suffix,
  });
};

export const tagResources =
  (coreTags: CoreTags) =>
  (...resources: Construct[]) => {
    Object.keys(coreTags)
      .map((key) => [key, coreTags[key as keyof CoreTags]])
      .forEach(([key, value]) => {
        resources.forEach((res) => {
          cdk.Tags.of(res).add(key, value);
        });
      });
  };

export const getSSMParameter = (client: aws.SSM) => async (name: string) =>
  (
    await client
      .getParameter({
        Name: name,
        WithDecryption: true,
      })
      .promise()
  ).Parameter?.Value;

export const getEnvConfig =
  (env: Env) =>
  <T>(stagValue: T, prodValue: T) => {
    if (env === "prod") return prodValue;
    else return stagValue;
  };

export const skipCheckovRules = ({
  rules,
  resource,
}: {
  rules: { code: string; reasonDescription: string }[];
  resource: Construct;
}) => {
  const cfnResource = resource.node.defaultChild as cdk.CfnResource;
  cfnResource.cfnOptions.metadata = {
    checkov: {
      skip: rules.map(({ code, reasonDescription }) => ({
        id: code,
        comment: reasonDescription,
      })),
    },
  };
};

export const map =
  <T, T2>(f: (v: T) => T2) =>
  (value: T | undefined) => {
    if (value === undefined) return undefined;
    return f(value);
  };

export const mapOr =
  <T, T2>(f: (v: T) => T2, orFunc: () => T2) =>
  (value: T | undefined) => {
    if (value === undefined) return orFunc();
    return f(value);
  };

export const nonUndefined = <T>(obj: T | undefined): obj is T =>
  obj !== undefined;
