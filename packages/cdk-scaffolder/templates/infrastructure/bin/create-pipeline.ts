#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CrossAccountPipelineStack } from "../lib/pipeline-stack";
import {
  getContextFromConstruct,
  CoreTags,
} from "@federico.barera/cdk-ci-tools-constructs";

const app = new cdk.App();
const context = getContextFromConstruct(app, "ci");
const branch = context.tryGet("branch")?.toString() || "main";
const tags = context.getOrThrow<CoreTags>("tags", "Tags must be provided");

function run() {
  new CrossAccountPipelineStack(app, "Pipeline", {
    tags,
    branch,
    environment: "ci",
    env: context.getStackEnvironment(),
  });
}

run();
