import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { IConstruct } from 'constructs';

export class S3AttachServerLoggingAspects implements cdk.IAspect {
  constructor(private s3LogBucket: string, private prefix: string) {}
  
  visit(node: IConstruct): void {
    if (node instanceof s3.CfnBucket) {
      const bucket = node as s3.CfnBucket;
      if (bucket.loggingConfiguration !== undefined) return;
      
      bucket.loggingConfiguration = {
        destinationBucketName: this.s3LogBucket,
        logFilePrefix: this.prefix
      }
    }
  }
}