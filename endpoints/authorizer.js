/**
 * Lambda Authorizer para validar origen y rate limit
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: process.env.REGION });

const RATE_LIMIT_TABLE = 'email-rate-limit';
const MAX_EMAILS_PER_HOUR = 5;
const MAX_EMAILS_PER_EMAIL_PER_HOUR = 2;
const MIN_SECONDS_BETWEEN_EMAILS = 300;

exports.handler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event));

  try {
    // Validar origen
    const origin = event.headers?.origin || event.headers?.referer;
    console.log('Origin:', origin);
    
    if (!isValidOrigin(origin)) {
      console.log('Origin inválido:', origin);
      return buildResponse('Deny', event.methodArn);
    }

    console.log('Origin válido, permitiendo acceso');
    return buildResponse('Allow', event.methodArn);

  } catch (err) {
    console.error('Authorizer error:', err);
    return buildResponse('Deny', event.methodArn);
  }
};

/**
 * Valida que la solicitud venga desde newenar.com o www.newenar.com
 */
function isValidOrigin(origin) {
  if (!origin) return false;
  
  const validOrigins = [
    'https://newenar.com',
    'https://www.newenar.com',
    'http://newenar.com',
    'http://www.newenar.com'
  ];
  
  return validOrigins.some(validOrigin => origin.includes(validOrigin));
}

/**
 * Construir respuesta del authorizer para REST API
 */
function buildResponse(effect, methodArn) {
  const apiGatewayArn = methodArn.split(':');
  const apiGatewayArnTmp = apiGatewayArn[5].split('/');
  const awsAccountId = apiGatewayArn[4];
  const awsRegion = apiGatewayArn[3];
  const restApiId = apiGatewayArnTmp[0];
  const stage = apiGatewayArnTmp[1];
  
  const apiArn = `arn:aws:execute-api:${awsRegion}:${awsAccountId}:${restApiId}/${stage}/*/*`;

  return {
    principalId: 'user',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: apiArn
        }
      ]
    }
  };
}
