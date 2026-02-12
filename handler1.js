const { v1: uuidv1 } = require('uuid');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const ses = new AWS.SES({ region: process.env.REGION });

exports.reciveMessage = async (event) => {
  try {
    // 1. Validar origen desde CloudFront
    const origin = event.headers?.origin || event.headers?.referer;
    if (!isValidOrigin(origin)) {
      return sendResponse(403, 'Acceso no autorizado desde este origen');
    }

    // 2. Obtener IP del cliente
    const clientIp = event.requestContext?.identity?.sourceIp || 'unknown';
    const { name, lastname, phone, message: messageContent, email } = JSON.parse(event?.body);

    // 3. Validar rate limit
    const rateLimitCheck = await checkRateLimit(clientIp, email);
    if (!rateLimitCheck.allowed) {
      return sendResponse(429, `${rateLimitCheck.reason}. Intenta de nuevo en ${rateLimitCheck.retryAfter} minutos`);
    }

    const id = uuidv1();
    const messageToSend = {
      id: id,
      name: name,
      email: email,
      lastname: lastname,
      phone: phone,
      message: messageContent,
      timestamp: Date.now()
    }

    console.log("Mensaje: " + JSON.stringify(messageToSend));

    const params = {
      MessageBody: JSON.stringify(messageToSend),
      QueueUrl: QUEUE_URL,
    };

    const data = await sqs.sendMessage(params).promise();

    const message = {
      id: id,
      messageId: data.MessageId,
    };

    return sendResponse(200, message);
   
  } catch (err) {
    console.error('Error:', err);
    return sendResponse(500, err.message);
  }
};

exports.sendEmail = async(event)=>{
  console.log('Se activó Lambda para enviar correo electrónico');
  console.log(event);

  const record = event.Records[0];
  const { body } = record;
  const message = JSON.parse(body);
  let htmlTemplate;

  try {
    htmlTemplate = fs.readFileSync(path.join(__dirname, 'emailTemplate.html'), 'utf8');
    console.log('Template HTML cargado:', htmlTemplate);
  } catch (err) {
    console.error('Error al leer el template HTML:', err);
    return sendResponse(500, 'Error al leer el template HTML');
  }
   
   htmlTemplate = htmlTemplate.replace('{{name}}', message.name);
   htmlTemplate = htmlTemplate.replace('{{lastname}}', message.lastname);
   htmlTemplate = htmlTemplate.replace('{{message}}', message.message);
   htmlTemplate = htmlTemplate.replace('{{email}}', message.email);
   htmlTemplate = htmlTemplate.replace('{{phone}}', message.phone);

  const emailParams = {
    Destination: {
      ToAddresses: [process.env.DESTINATION_EMAIL],
    },
    Message: {
      Body: {
        Html: { Data: htmlTemplate },
      },
      Subject: { Data: `Nuevo correo de ${message.name} ${message.lastname}` },
    },
    Source: process.env.EMAIL_SOURCE, // Cambia esto por un correo verificado en SES
  };

  try {
    const data = await ses.sendEmail(emailParams).promise();
    console.log('Correo enviado:', data);
  } catch (err) {
    console.error('Error al enviar el correo:', err);
  }
}


function sendResponse(status, message ){
  return {
    statusCode: status,
    body: JSON.stringify({
      message: message,
    }),
  };
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
    'http://www.newenar.com',
    'http://localhost:3000', // Para desarrollo
    'http://localhost:5173'  // Para desarrollo con Vite
  ];
  
  return validOrigins.some(validOrigin => origin.includes(validOrigin));
}

/**
 * Verifica el rate limit por IP y email
 * Retorna { allowed: boolean, retryAfter: number }
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
    // Si hay error en DynamoDB, permitir por ahora (fallo abierto)
    return { allowed: true };
  }
}