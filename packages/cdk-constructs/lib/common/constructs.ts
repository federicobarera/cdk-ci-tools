import * as cdk from "aws-cdk-lib";
import {
  nameGenUtil,
  namingFunc,
  tagResources,
  createSafeBranchName,
} from "./utils";
import {
  ContextLookup,
  getContextFromConstruct,
  ResourceLookup,
  resolveResource,
} from "./context";
import { Construct } from "constructs";
import { isMainBranch } from ".";

export type Env = "stag" | "prod" | "ci";
export const isEnv = (s: string): s is Env =>
  s === "stag" || s === "prod" || s === "ci";

export type CoreTags = Record<string, string> & {
  product: string;
  team: string;
  repository: string;
  service: string;
};

export interface IContextualConstruct {
  context: ContextLookup;
}

export interface INamingConstruct {
  name(...ids: string[]): string;
}

export type NewableBaseStack = {
  new (scope: Construct, id: string, props: BaseStackProps): cdk.Stack;
};

export abstract class CoreConstruct extends Construct {
  public resolveLookup(lookup: ResourceLookup) {
    return resolveResource(lookup);
  }

  constructor(scope: Construct, id: string) {
    super(scope, id);
  }
}

export type NamingConstructProps = {
  name: string;
};

export abstract class NamingConstruct
  extends CoreConstruct
  implements INamingConstruct
{
  private constructName: string;

  constructor(scope: Construct, id: string, props: NamingConstructProps) {
    super(scope, id);
    this.constructName = props.name;
  }

  /**
   * The function concatenates ids to create a dash separated name
   * If the construct props.name passed is dash separated, the last fragment is maintained as suffix
   * @param ids
   * @returns
   */
  public name(...ids: string[]) {
    const nameFrags = this.constructName.split("-");

    const opt =
      nameFrags.length > 1
        ? {
            root: [
              this.constructName.replace(
                `-${nameFrags[nameFrags.length - 1]}`,
                ""
              ),
            ],
            suffix: nameFrags[nameFrags.length - 1] as string,
          }
        : {
            root: [this.constructName],
            suffix: undefined,
          };

    return nameGenUtil(opt)(...ids);
  }
}

export type ContextualConstructProps = NamingConstructProps & {
  environment: Env;

  /**
   * The branch from which this stack is deployed
   */
  branch: string;

  /**
   * Tags are assigned to all elements created by this stack
   */
  tags: CoreTags;
};

export abstract class ContextualConstruct
  extends NamingConstruct
  implements IContextualConstruct
{
  public context;
  constructor(scope: Construct, id: string, props: ContextualConstructProps) {
    super(scope, id, props);
    this.context = getContextFromConstruct(
      this,
      props.environment,
      props.branch
    );
  }
}

export enum StackName {
  CDK_GENERATED,
  GENERATE_FROM_PROPS,
}

export type BaseStackProps = Omit<cdk.StackProps, "stackName"> & {
  environment: Env;

  /**
   * The branch from which this stack is deployed
   */
  branch: string;

  /**
   * Tags are assigned to all elements created by this stack
   */
  tags: CoreTags;
  /**
   * CDK stack naming behavior.
   * @type string A concrete name can be assigned to the stack
   * @name StackName.CDK_GENERATED triggers the default internal CDK stack naming logic
   * @name StackName.GENERATE_FROM_PROPS triggers naming behavior derived from tags/branch and environment
   */
  stackName: StackName | string;
};

const generateStackName = (
  scope: Construct | undefined,
  props: BaseStackProps
) => {
  if (scope === undefined) return undefined; //CDK Unit Testing
  if (props.stackName === StackName.CDK_GENERATED) return undefined; //Default behavior
  if (typeof props.stackName === "string") return props.stackName; //Concrete name

  //Name gets generated from tags and environment
  const context = getContextFromConstruct(
    scope,
    props.environment,
    props.branch
  );
  const stackFeatureFlag = context.tryGet("useStackNamingEnv");

  const useEnvironmentName = () =>
    !!stackFeatureFlag ? stackFeatureFlag === true : true;

  return namingFunc({
    environment: props.environment,
    root: [props.tags.product, props.tags.service],
    branch: props.branch,
    useEnvironmentName,
  })("stack");
};

export class BaseStack
  extends cdk.Stack
  implements IContextualConstruct, INamingConstruct
{
  public name(...ids: string[]) {
    return namingFunc({
      environment: this.props.environment,
      root: [this.props.tags.product, this.props.tags.service],
      branch: this.props.branch,
    })(...ids);
  }

  resolveLookup(lookup: ResourceLookup) {
    return resolveResource(lookup);
  }

  context: ContextLookup;

  constructor(
    scope: Construct | undefined,
    id: string,
    protected props: BaseStackProps
  ) {
    super(scope, id, {
      ...props,
      stackName: generateStackName(scope, props),
    });

    this.context = getContextFromConstruct(
      this,
      props.environment,
      props.branch
    );
    tagResources(this.props.tags)(this);
  }
}

export type BaseNestedStackProps = cdk.NestedStackProps & {
  environment: Env;

  /**
   * The branch from which this stack is deployed
   */
  branch: string;

  /**
   * Tags are assigned to all elements created by this stack
   */
  tags: CoreTags;
};

export class BaseNestedStack
  extends cdk.NestedStack
  implements IContextualConstruct, INamingConstruct
{
  public name(...ids: string[]) {
    return namingFunc({
      environment: this.props.environment,
      branch: this.props.branch,
      root: [
        this.props.tags.product,
        this.props.tags.service,
        this.id.toLowerCase(),
      ],
    })(...ids);
  }

  resolveLookup(lookup: ResourceLookup) {
    return resolveResource(lookup);
  }

  context: ContextLookup;
  id: string;

  constructor(
    scope: Construct,
    id: string,
    protected props: cdk.NestedStackProps & BaseNestedStackProps
  ) {
    super(scope, id, {
      ...props,
    });

    this.id = id;
    this.context = getContextFromConstruct(
      this,
      props.environment,
      props.branch
    );
    tagResources(this.props.tags)(this);
  }
}

export type BasePipelineProps = Omit<BaseStackProps, "stackName">;

export abstract class BasePipeline extends BaseStack {
  constructor(scope: Construct, id: string, props: BasePipelineProps) {
    super(scope, id, {
      ...props,
      stackName: nameGenUtil({
        root: [props.tags.product, props.tags.service],
        suffix: !isMainBranch(props.branch)
          ? createSafeBranchName(props.branch)
          : undefined,
      })("pipeline"),
    });
  }
}
