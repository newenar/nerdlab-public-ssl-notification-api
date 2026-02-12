/**
 * Funciones compartidas de validación y utilidades
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: process.env.REGION });

const RATE_LIMIT_TABLE = 'email-rate-limit';
const MAX_EMAILS_PER_HOUR = 5;
const MAX_EMAILS_PER_EMAIL_PER_HOUR = 2;
const MIN_SECONDS_BETWEEN_EMAILS = 300;

/**
 * Respuesta HTTP estándar
 */
function sendResponse(status, message) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: message,
    }),
  };
}

/**
 * Verifica el rate limit por IP y email
 * Retorna { allowed: boolean, retryAfter: number, reason: string }
 */
async function checkRateLimit(clientIp, email) {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  try {
    // Check 1: Rate limit por IP (máx 5 emails/hora)
    const ipKey = `ip:${clientIp}`;
    const ipResponse = await dynamodb.get({
      TableName: RATE_LIMIT_TABLE,
      Key: { rateLimitKey: ipKey }
    }).promise();

    const ipItem = ipResponse.Item;
    if (ipItem && ipItem.firstAttempt > oneHourAgo) {
      if (ipItem.count >= MAX_EMAILS_PER_HOUR) {
        const retryAfter = Math.ceil((ipItem.expiresAt - now) / 60000);
        console.log(`Rate limit por IP superado para ${clientIp}`);
        return { allowed: false, retryAfter, reason: 'Demasiados intentos desde tu IP' };
      }
    }

    // Check 2: Rate limit por email (máx 2 emails/hora)
    const emailKey = `email:${email}`;
    const emailResponse = await dynamodb.get({
      TableName: RATE_LIMIT_TABLE,
      Key: { rateLimitKey: emailKey }
    }).promise();

    const emailItem = emailResponse.Item;
    if (emailItem && emailItem.firstAttempt > oneHourAgo) {
      if (emailItem.count >= MAX_EMAILS_PER_EMAIL_PER_HOUR) {
        const retryAfter = Math.ceil((emailItem.expiresAt - now) / 60000);
        console.log(`Rate limit por email superado para ${email}`);
        return { allowed: false, retryAfter, reason: 'Demasiados intentos desde este email' };
      }
      
      // Check 3: Mínimo 5 minutos entre emails del mismo email
      if (emailItem.lastAttempt && (now - emailItem.lastAttempt) < (MIN_SECONDS_BETWEEN_EMAILS * 1000)) {
        const retryAfter = Math.ceil((MIN_SECONDS_BETWEEN_EMAILS * 1000 - (now - emailItem.lastAttempt)) / 60000);
        console.log(`Mínimo de tiempo entre emails no respetado para ${email}`);
        return { allowed: false, retryAfter, reason: 'Espera al menos 5 minutos entre consultas' };
      }
    }

    // Si pasó todas las validaciones, actualizar contadores
    // Actualizar IP
    if (ipItem && ipItem.firstAttempt > oneHourAgo) {
      await dynamodb.update({
        TableName: RATE_LIMIT_TABLE,
        Key: { rateLimitKey: ipKey },
        UpdateExpression: 'SET #count = #count + :inc, lastAttempt = :now',
        ExpressionAttributeNames: { '#count': 'count' },
        ExpressionAttributeValues: { ':inc': 1, ':now': now }
      }).promise();
    } else {
      await dynamodb.put({
        TableName: RATE_LIMIT_TABLE,
        Item: {
          rateLimitKey: ipKey,
          count: 1,
          firstAttempt: now,
          lastAttempt: now,
          expiresAt: now + (60 * 60 * 1000)
        }
      }).promise();
    }

    // Actualizar Email
    if (emailItem && emailItem.firstAttempt > oneHourAgo) {
      await dynamodb.update({
        TableName: RATE_LIMIT_TABLE,
        Key: { rateLimitKey: emailKey },
        UpdateExpression: 'SET #count = #count + :inc, lastAttempt = :now',
        ExpressionAttributeNames: { '#count': 'count' },
        ExpressionAttributeValues: { ':inc': 1, ':now': now }
      }).promise();
    } else {
      await dynamodb.put({
        TableName: RATE_LIMIT_TABLE,
        Item: {
          rateLimitKey: emailKey,
          count: 1,
          firstAttempt: now,
          lastAttempt: now,
          expiresAt: now + (60 * 60 * 1000)
        }
      }).promise();
    }

    return { allowed: true };

  } catch (err) {
    console.error('Error en checkRateLimit:', err);
    return { allowed: true };
  }
}

module.exports = {
  sendResponse,
  checkRateLimit
};
