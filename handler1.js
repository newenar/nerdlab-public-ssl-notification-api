const { v1: uuidv1 } = require('uuid');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const sqs = new AWS.SQS({ region: process.env.REGION });
const QUEUE_URL = process.env.PENDING_MESSAGES_QUEUE;

const ses = new AWS.SES({ region: process.env.REGION });

exports.reciveMessage = async (event) => {
  const id = uuidv1();
  const {name, lastname, phone, message, email} = JSON.parse(event?.body);

  const messageToSend = {
    id: id,
    name: name,
    email: email,
    lastname: lastname,
    phone: phone,
    message: message,
    timestamp: Date.now()
  }

  console.log("Mensaje: " + JSON.stringify(messageToSend));

  const params = {
    MessageBody: JSON.stringify(messageToSend),
    QueueUrl: QUEUE_URL,
  };

  try {
    const data = await sqs.sendMessage(params).promise();

    const message = {
      id: id,
      messageId: data.MessageId,
    };

   return sendResponse(200, message);
   
  } catch (err) {

   return sendResponse(500, err);
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