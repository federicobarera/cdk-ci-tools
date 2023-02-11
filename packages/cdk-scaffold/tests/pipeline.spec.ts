import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { CrossAccountPipelineStack } from "../templates/infrastructure/lib/pipeline-stack";

describe("Scaffolded pipeline", () => {
  it("compiles", () => {
    const stack = new cdk.Stack();
    new CrossAccountPipelineStack(stack, "Pipeline", {
      branch: "master",
      environment: "stag",
      tags: {
        product: "test",
        team: "test",
        repository: "test",
        service: "test",
      },
    });

    const output = Template.fromStack(stack);
    expect(output).not.toBe(null);
  });
});
