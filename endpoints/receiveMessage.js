/**
 * Endpoint: POST /recive
 * Recibe mensajes de contacto y los envía a una cola SQS para procesamiento
 */

const { v1: uuidv1 } = require('uuid');
const AWS = require('aws-sdk');
const { checkRateLimit, sendResponse } = require('./middleware');

const sqs = new AWS.SQS({ region: process.env.REGION });
const QUEUE_URL = process.env.PENDING_MESSAGES_QUEUE;

exports.handler = async (event) => {
  try {
    // Obtener IP del cliente
    const clientIp = event.requestContext?.identity?.sourceIp || 'unknown';
    const { name, lastname, phone, message, email } = JSON.parse(event?.body);

    // Validar que todos los campos requeridos estén presentes
    if (!name || !lastname || !phone || !message || !email) {
      return sendResponse(400, 'Faltan campos requeridos: name, lastname, phone, message, email');
    }

    // Validar rate limit
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
      message: message,
      timestamp: Date.now()
    }

    console.log("Mensaje recibido: " + JSON.stringify(messageToSend));

    const params = {
      MessageBody: JSON.stringify(messageToSend),
      QueueUrl: QUEUE_URL,
    };

    const data = await sqs.sendMessage(params).promise();

    const responseMessage = {
      id: id,
      messageId: data.MessageId,
    };

    return sendResponse(200, responseMessage);
   
  } catch (err) {
    console.error('Error en reciveMessage:', err);
    return sendResponse(500, 'Error al procesar la solicitud: ' + err.message);
  }
};
