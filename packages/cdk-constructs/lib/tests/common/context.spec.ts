import { getContextFromConstruct } from "../../common/context";
import * as cdk from "aws-cdk-lib";

describe("Context Utils", () => {
  it("should interpolate env in string lookups", () => {
    const stack = new cdk.Stack();
    stack.node.setContext("test", "test-$env");

    const context = getContextFromConstruct(stack, "stag");

    expect(context.getOrThrow("test")).toBe("test-stag");
  });

  it("should lookup branch if present", () => {
    const stack = new cdk.Stack();
    stack.node.setContext("stag", {
      test: 1,
    });
    stack.node.setContext("test-branch", {
      test: 2,
    });

    const context = getContextFromConstruct(stack, "stag", "test-branch");
    expect(context.getOrThrow("test")).toBe(2);
  });

  it("should fallback to env lookup if branch lookup fails", () => {
    const stack = new cdk.Stack();
    stack.node.setContext("stag", {
      test: 1,
    });

    const context = getContextFromConstruct(stack, "stag", "test-branch");
    expect(context.getOrThrow("test")).toBe(1);
  });

  it("should interpolate env in complex objects", () => {
    const stack = new cdk.Stack();

    type Complex = {
      a: string;
      b: string[];
      c: {
        d: string[];
        e: {
          f: string;
        };
      };
    };

    const obj: Complex = {
      a: "a-$env",
      b: ["b-$env"],
      c: {
        d: ["d-$env"],
        e: {
          f: "f-$env",
        },
      },
    };
    stack.node.setContext("test", obj);
    const context = getContextFromConstruct(stack, "stag");
    expect(context.getOrThrow<Complex>("test")).toEqual({
      a: "a-stag",
      b: ["b-stag"],
      c: {
        d: ["d-stag"],
        e: {
          f: "f-stag",
        },
      },
    });
  });

  it("should not throw on false key", () => {
    const stack = new cdk.Stack();

    stack.node.setContext("a", false);
    stack.node.setContext("b", null);
    const context = getContextFromConstruct(stack, "stag");

    expect(() => context.getOrThrow<boolean>("a")).not.toThrow();
    expect(() => context.getOrThrow("b")).not.toThrow();
  });
});
