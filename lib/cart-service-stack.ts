import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { aws_apigateway as apigateway } from 'aws-cdk-lib';
import path = require('path');

export class CartServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const lambdaFunction = new lambdaNodejs.NodejsFunction(this, 'LambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../nodejs-aws-cart-api/src/lambda.ts'),
      handler: 'handler',
      bundling: {
        forceDockerBundling: false,
        externalModules: [
          'class-transformer',
          'class-validator',
          '@nestjs/microservices',
          '@nestjs/websockets/socket-module',
          '@nestjs/microservices/microservices-module',
        ],
      },
    })

    const api = new apigateway.RestApi(this, 'NestApi', {
      restApiName: 'Nest Service',
      description: 'This service serves a Nest.js application.',
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction);

    api.root.addMethod('ANY', lambdaIntegration);
    api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
    });


    const getLambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction);
  }
}
