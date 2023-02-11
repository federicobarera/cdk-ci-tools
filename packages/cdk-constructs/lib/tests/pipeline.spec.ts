import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import {
  CrossAccountPipeline,
  CrossAccountPipelineProps,
} from "../pipelines/pipeline";
import { CoreTags, NewableBaseStack } from "../common/constructs";

const MockedStack = (
  jest.fn() as jest.MockedClass<NewableBaseStack>
).mockImplementation(
  (scope, id, props) =>
    new cdk.Stack(scope, id, { ...props, stackName: undefined })
);

beforeEach(() => {
  MockedStack.mockClear();
});

const generatePipelineProps = (
  overrides?: Partial<CrossAccountPipelineProps>
): CrossAccountPipelineProps => ({
  branch: "master",
  environment: "stag",
  stagingAccount: {
    account: "1",
    region: "eu-west-1",
  },
  productionAccount: {
    account: "2",
    region: "eu-west-1",
  },
  tags: {
    product: "test",
    repository: "test",
    service: "test",
    team: "test",
  },
  stack: MockedStack,
  ...overrides,
});

const createPipelineStack = (
  overrides: {
    stackOverrides?: object;
    pipelineOverrides?: Partial<CrossAccountPipelineProps>;
  } = {}
): [cdk.Stack, CrossAccountPipeline] => {
  const stack = new cdk.Stack(undefined, "TestStack", {
    env: {
      account: "1",
      region: "eu-west-1",
    },
    ...overrides.stackOverrides,
  });
  const pipeline = new CrossAccountPipeline(
    stack,
    "Pipeline",
    generatePipelineProps(overrides.pipelineOverrides)
  );

  return [stack, pipeline];
};

describe("Pipelines", () => {
  it("creates the stack", () => {
    const [stack] = createPipelineStack();
    expect(stack).not.toBe(null);
  });

  it("creates the pipeline", () => {
    const [stack, pipeline] = createPipelineStack();

    expect(pipeline).not.toBe(null);
    Template.fromStack(stack).hasResource("AWS::CodePipeline::Pipeline", {});
  });

  it("returns 6 stages when the pipeline runs on master", () => {
    const [stack] = createPipelineStack({
      pipelineOverrides: {
        branch: "master",
      },
    });
    const cfPipeline = Object.values(
      Template.fromStack(stack).findResources("AWS::CodePipeline::Pipeline")
    )[0];
    expect(cfPipeline.Properties.Stages.length).toBe(6);
  });

  it("returns 4 stages when the pipeline runs on any other branch", () => {
    const [stack] = createPipelineStack({
      pipelineOverrides: {
        branch: "feat/test",
      },
    });
    const cfPipeline = Object.values(
      Template.fromStack(stack).findResources("AWS::CodePipeline::Pipeline")
    )[0];
    expect(cfPipeline.Properties.Stages.length).toBe(4);
  });

  it("creates 2 instances of the injected stack type", () => {
    createPipelineStack();
    expect(MockedStack).toHaveBeenCalledTimes(2);
  });

  it("creates a stack with required tags", () => {
    const tags: CoreTags = {
      product: "test",
      repository: "test",
      service: "test",
      team: "test",
    };

    createPipelineStack({
      pipelineOverrides: {
        tags,
      },
    });

    expect(MockedStack.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        tags,
      })
    );
  });

  it("creates a production stack with production enviroment", () => {
    createPipelineStack();

    expect(MockedStack.mock.calls[1][2]).toEqual(
      expect.objectContaining({
        environment: "prod",
      })
    );
  });

  it("creates a production stack with notifications", () => {
    const [stack] = createPipelineStack({
      pipelineOverrides: {
        chatbotArn:
          "arn:aws:chatbot::00000000:chat-configuration/slack-channel/chatbot-pipelines-00000000",
      },
    });

    Template.fromStack(stack).hasResource(
      "AWS::CodeStarNotifications::NotificationRule",
      {}
    );
  });

  it("creates a pipeline with a code star connection", () => {
    const [stack] = createPipelineStack({
      pipelineOverrides: {
        tags: {
          repository: "owner/repo",
          product: "test",
          service: "test",
          team: "test",
        },
        repositoryType: "bitbucket",
        codeStarConnection:
          "arn:aws:codestar-connections:us-east-1:00000000000:connection/0000000-0000-0000-0000-00000000",
      },
    });

    Template.fromStack(stack).hasResourceProperties(
      "AWS::CodePipeline::Pipeline",
      Match.objectLike({
        Stages: Match.arrayWith([
          {
            Actions: Match.arrayWith([
              Match.objectLike({
                ActionTypeId: {
                  Category: "Source",
                  Owner: "AWS",
                  Provider: "CodeStarSourceConnection",
                  Version: "1",
                },
              }),
            ]),
            Name: "Source",
          },
        ]),
      })
    );
  });

  it("creates a pipeline with a codecommit connection", () => {
    const [stack] = createPipelineStack({
      pipelineOverrides: {
        repositoryType: undefined,
        codeStarConnection: undefined,
      },
    });

    Template.fromStack(stack).hasResourceProperties(
      "AWS::CodePipeline::Pipeline",
      Match.objectLike({
        Stages: Match.arrayWith([
          {
            Actions: Match.arrayWith([
              Match.objectLike({
                ActionTypeId: {
                  Category: "Source",
                  Owner: "AWS",
                  Provider: "CodeCommit",
                  Version: "1",
                },
              }),
            ]),
            Name: "Source",
          },
        ]),
      })
    );
  });
});
