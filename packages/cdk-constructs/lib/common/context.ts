import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Env } from "./constructs";
import { map } from "./utils";

export type ContextLookup = {
  tryGet: <T = any>(key: string) => T;
  getOrThrow: <T = any>(key: string, message?: string) => T;
  getStackEnvironment: () => cdk.Environment;
};

const interpolateEnvRecursively = (value: any, env: Env): any => {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return value.replace("$env", env);
  if (Array.isArray(value))
    return value.map((v) => interpolateEnvRecursively(v, env));
  if (typeof value === "object") {
    return Object.keys(value).reduce((acc, v) => {
      return {
        ...acc,
        [v]: interpolateEnvRecursively(value[v], env),
      };
    }, value);
  }

  return value;
};

export const getContextFromConstruct = (
  app: Construct,
  env: Env,
  branch?: string
): ContextLookup => {
  const getOrThrow = <T = any>(key: string, message?: string) => {
    const value = tryGet<T>(key);
    if (value === undefined)
      throw new Error(
        message ||
          `Context for key: ${key} was not provided. Include the key ${key} in the cdk.json file`
      );

    return interpolateEnvRecursively(value, env) as T;
  };

  const tryGet = <T = any>(key: string) => {
    const branch_key = map(
      (branch: string) => app.node.tryGetContext(branch)?.[key]
    )(branch);
    const env_key = app.node.tryGetContext(env)?.[key];
    const default_key = app.node.tryGetContext(key);

    return (
      (interpolateEnvRecursively(branch_key, env) as T) ??
      (interpolateEnvRecursively(env_key, env) as T) ??
      (interpolateEnvRecursively(default_key, env) as T)
    );
  };

  const getStackEnvironment = (): cdk.Environment => ({
    account: tryGet("account"),
    region: tryGet("region"),
  });

  return {
    tryGet,
    getOrThrow,
    getStackEnvironment,
  };
};

export type ResourceLookup =
  | {
      exportName?: string;
    }
  | string;

export const isResourceLookup = (arg: any): arg is ResourceLookup => {
  return (
    typeof arg === "string" ||
    (arg?.exportName && typeof arg.exportName === "string")
  );
};

export const resolveResource = (lookup: ResourceLookup) => {
  if (typeof lookup === "string") return lookup.toString();

  if (!!lookup.exportName) return cdk.Fn.importValue(lookup.exportName);

  throw new Error("Unknown Lookup");
};

export type VpcNameLookup = {
  /**
   * Requires concrete names. No TOKENS or Lookups
   */
  vpcName?: string;
};

export type VpcIdLookup = {
  /**
   * Requires concrete names. No TOKENS or Lookups
   */
  vpcId?: string;
};

export type VpcLookup = VpcIdLookup | VpcNameLookup;

export type LambdaVpcLookup = VpcLookup & {
  securityGroupId: ResourceLookup;
};
