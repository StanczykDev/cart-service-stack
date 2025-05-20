import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { aws_apigateway as apigateway } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import path = require('path');

export class CartServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private-subnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });


    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Allow Lambda to connect to RDS',
      allowAllOutbound: true,
    });

    const dbSg = new ec2.SecurityGroup(this, 'DbSG', {
      vpc,
      description: 'Allow RDS connections',
      allowAllOutbound: true,
    });

    dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Allow Lambda to access PostgreSQL');

    const dbCredentials = new rds.DatabaseSecret(this, 'DbCredentials', {
      username: 'postgres',
    });

    const dbInstance = new rds.DatabaseInstance(this, 'PostgresRds', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_14,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      credentials: rds.Credentials.fromSecret(dbCredentials),
      databaseName: 'cartdb',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      securityGroups: [dbSg],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      publiclyAccessible: false,
    });

    const lambdaFunction = new lambdaNodejs.NodejsFunction(this, 'LambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../nodejs-aws-cart-api/src/lambda.ts'),
      handler: 'handler',
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_NAME: 'cartdb',
        DB_SECRET_ARN: dbCredentials.secretArn,
      },
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

    dbCredentials.grantRead(lambdaFunction);

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
