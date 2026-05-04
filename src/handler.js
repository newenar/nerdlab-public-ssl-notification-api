const { v1: uuidv1 } = require('uuid');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const fs = require('fs');
const path = require('path');

const sqsClient = new SQSClient({ region: process.env.REGION });
const sesClient = new SESClient({ region: process.env.REGION });
const QUEUE_URL = process.env.PENDING_MESSAGES_QUEUE;

exports.reciveMessage = async (event) => {
  const id = uuidv1();
  const { name, lastname, phone, message, email } = JSON.parse(event?.body);

  const messageToSend = {
    id,
    name,
    email,
    lastname,
    phone,
    message,
    timestamp: Date.now(),
  };

  console.log('Mensaje:', JSON.stringify(messageToSend));

  try {
    const data = await sqsClient.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(messageToSend),
        QueueUrl: QUEUE_URL,
      }),
    );

    return sendResponse(200, { id, messageId: data.MessageId });
  } catch (err) {
    return sendResponse(500, err);
  }
};

exports.sendEmail = async (event) => {
  console.log('Lambda sendEmail activada');

  const record = event.Records[0];
  const message = JSON.parse(record.body);

  let htmlTemplate;
  try {
    htmlTemplate = fs.readFileSync(path.join(__dirname, 'emailTemplate.html'), 'utf8');
  } catch (err) {
    console.error('Error al leer el template HTML:', err);
    return sendResponse(500, 'Error al leer el template HTML');
  }

  htmlTemplate = htmlTemplate
    .replace('{{name}}', message.name)
    .replace('{{lastname}}', message.lastname)
    .replace('{{message}}', message.message)
    .replace('{{email}}', message.email)
    .replace('{{phone}}', message.phone);

  try {
    const data = await sesClient.send(
      new SendEmailCommand({
        Destination: { ToAddresses: [process.env.DESTINATION_EMAIL] },
        Message: {
          Body: { Html: { Data: htmlTemplate } },
          Subject: { Data: `Nuevo correo de ${message.name} ${message.lastname}` },
        },
        Source: process.env.EMAIL_SOURCE,
      }),
    );
    console.log('Correo enviado:', data.MessageId);
  } catch (err) {
    console.error('Error al enviar el correo:', err);
  }
};

function sendResponse(status, message) {
  return {
    statusCode: status,
    body: JSON.stringify({ message }),
  };
}
