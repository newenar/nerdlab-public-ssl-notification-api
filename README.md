# API HTTP Node con Serverless Framework en AWS

Esta plantilla demuestra cómo crear una API HTTP con Node.js ejecutándose en AWS Lambda, API Gateway y Amazon SQS utilizando el Serverless Framework. Además, la API se integra con Amazon SES para enviar correos electrónicos.

## Descripción General

Esta API maneja solicitudes a través de API Gateway, las procesa en una función Lambda, y envía los mensajes a una cola SQS. Otra función Lambda es activada por la cola SQS, que luego envía un correo electrónico utilizando Amazon SES.

### Componentes Clave

- **API Gateway:** Gestiona las solicitudes HTTP entrantes y las dirige a la primera función Lambda.
- **Funciones Lambda:**
  - La primera función Lambda recibe y procesa la solicitud HTTP, luego envía un mensaje a la cola SQS.
  - La segunda función Lambda es activada por la cola SQS y envía un correo electrónico a través de SES.
- **Amazon SQS:** Actúa como un intermediario de mensajes, almacenando los mensajes de la primera función Lambda hasta que son procesados por la segunda.
- **Amazon SES:** Envía correos electrónicos desencadenados por la segunda función Lambda.

## Requisitos Previos

Antes de desplegar la aplicación, asegúrate de tener lo siguiente configurado:

- Una dirección de correo electrónico verificada en Amazon SES. Esto es necesario para enviar correos electrónicos utilizando SES.
- Credenciales de AWS configuradas en tu máquina local o en tu pipeline de CI/CD.

## Despliegue

Para desplegar la API, ejecuta el siguiente comando:

```bash
serverless deploy
