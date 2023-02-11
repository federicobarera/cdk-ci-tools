import { Names, Stack } from "aws-cdk-lib";
import { IConstruct } from "constructs";
import * as crypto from 'crypto';

/**
 * This function has been exported from aws-cdk, and used internally to generate physical names
 * @param resource 
 * @returns 
 */
export function generatePhysicalName(constuct: IConstruct): string {
  const stack = Stack.of(constuct);
  const stackPart = new PrefixNamePart(stack.stackName, 25);
  const idPart = new SuffixNamePart(Names.nodeUniqueId(constuct.node), 24);

  const region: string = stack.region;
  const account: string = stack.account;
  const parts = [stackPart, idPart]
    .map(part => part.generate());

  const hashLength = 12;
  const sha256 = crypto.createHash('sha256')
    .update(stackPart.bareStr)
    .update(idPart.bareStr)
    .update(region)
    .update(account);
  const hash = sha256.digest('hex').slice(0, hashLength);

  const ret = [...parts, hash].join('');

  return ret.toLowerCase();
}

abstract class NamePart {
  public readonly bareStr: string;

  constructor(bareStr: string) {
    this.bareStr = bareStr;
  }

  public abstract generate(): string;
}

class PrefixNamePart extends NamePart {
  constructor(bareStr: string, private readonly prefixLength: number) {
    super(bareStr);
  }

  public generate(): string {
    return this.bareStr.slice(0, this.prefixLength);
  }
}

class SuffixNamePart extends NamePart {
  constructor(str: string, private readonly suffixLength: number) {
    super(str);
  }

  public generate(): string {
    const strLen = this.bareStr.length;
    const startIndex = Math.max(strLen - this.suffixLength, 0);
    return this.bareStr.slice(startIndex, strLen);
  }
}