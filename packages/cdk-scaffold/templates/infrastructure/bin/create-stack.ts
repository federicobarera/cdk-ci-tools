#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ServiceStack } from "../lib/service-stack";
import {
  getContextFromConstruct,
  CoreTags,
  StackName,
} from "@federico.barera/cdk-ci-tools-constructs";

const app = new cdk.App();
const context = getContextFromConstruct(app, "stag");
const branch = "dev";
const tags = context.getOrThrow<CoreTags>("tags", "Tags must be provided");

function run() {
  new ServiceStack(app, "ServiceStack", {
    tags,
    branch,
    environment: "stag",

    env: context.getStackEnvironment(),
    stackName: StackName.GENERATE_FROM_PROPS,
  });
}

run();
