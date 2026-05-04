import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import * as path from 'path';

export class NotificationApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'PendingMessages', {
      queueName: 'PendingMessages',
    });

    const commonEnv: Record<string, string> = {
      REGION: this.region,
      PENDING_MESSAGES_QUEUE: queue.queueUrl,
      PENDING_MESSAGES_QUEUE_NAME: 'PendingMessages',
      EMAIL_SOURCE: process.env.EMAIL_SOURCE ?? '',
      DESTINATION_EMAIL: process.env.DESTINATION_EMAIL ?? '',
    };

    // Node 24 runtime — requires aws-sdk v3 bundled (not included in Lambda runtime)
    const nodeRuntime = new lambda.Runtime('nodejs24.x', lambda.RuntimeFamily.NODEJS);

    const bundling: lambdaNodejs.BundlingOptions = {
      // Bundle aws-sdk v3 since Node 24 Lambda runtime does not include it
      externalModules: [],
      minify: true,
      sourceMap: false,
    };

    const reciveMessageFn = new lambdaNodejs.NodejsFunction(this, 'ReciveMessage', {
      entry: path.join(__dirname, '../src/handler.js'),
      handler: 'reciveMessage',
      runtime: nodeRuntime,
      environment: commonEnv,
      bundling,
    });

    queue.grantSendMessages(reciveMessageFn);

    const sendEmailFn = new lambdaNodejs.NodejsFunction(this, 'SendEmail', {
      entry: path.join(__dirname, '../src/handler.js'),
      handler: 'sendEmail',
      runtime: nodeRuntime,
      environment: commonEnv,
      bundling: {
        ...bundling,
        // Copy the HTML template alongside the bundled handler
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp ${inputDir}/src/emailTemplate.html ${outputDir}/emailTemplate.html`,
          ],
        },
      },
    });

    sendEmailFn.addEventSource(
      new lambdaEventSources.SqsEventSource(queue, { batchSize: 1 }),
    );

    sendEmailFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: 'notification-api',
      corsPreflight: {
        allowOrigins: ['https://newenar.com', 'https://www.newenar.com'],
        allowMethods: [apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ['Content-Type'],
        maxAge: cdk.Duration.days(1),
      },
    });

    httpApi.addRoutes({
      path: '/recive',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'ReciveIntegration',
        reciveMessageFn,
      ),
    });

    // 5 req/seg sostenidos, picos de hasta 10 — suficiente para un form de contacto.
    // Exceder el límite devuelve HTTP 429 sin ejecutar ninguna Lambda.
    const cfnStage = httpApi.defaultStage?.node.defaultChild as apigatewayv2.CfnStage;
    cfnStage.defaultRouteSettings = {
      throttlingRateLimit: 5,
      throttlingBurstLimit: 10,
    };

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API endpoint URL',
    });

    new cdk.CfnOutput(this, 'QueueUrl', {
      value: queue.queueUrl,
      description: 'SQS queue URL',
    });
  }
}
