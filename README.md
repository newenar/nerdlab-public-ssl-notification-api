# Notification API — AWS CDK

API de formulario de contacto desplegada en AWS con Lambda, API Gateway, SQS y SES.

## Arquitectura

```
POST /recive
     │
     ▼
API Gateway (HTTP API)
  └─ CORS: newenar.com / www.newenar.com
  └─ Throttling: 5 req/seg, burst 10
     │
     ▼
Lambda reciveMessage
     │
     ▼
SQS PendingMessages
     │
     ▼
Lambda sendEmail
     │
     ▼
Amazon SES → email destino
```

## Requisitos previos

- Node.js 24
- AWS CLI configurado (`aws configure`)
- CDK bootstrap ejecutado una vez por cuenta/región:

```bash
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

- Email verificado en Amazon SES (tanto el remitente como el destino si la cuenta está en sandbox)

## Deploy

```bash
EMAIL_SOURCE=remitente@gmail.com DESTINATION_EMAIL=destino@gmail.com npm run deploy
```

> `EMAIL_SOURCE` debe ser un email verificado en SES.
> Si la cuenta de AWS está en **modo sandbox** de SES, `DESTINATION_EMAIL` también debe estar verificado.

## Endpoint

```
POST https://<api-id>.execute-api.us-east-1.amazonaws.com/recive
Content-Type: application/json

{
  "name": "Juan",
  "lastname": "Pérez",
  "email": "juan@email.com",
  "phone": "1234567890",
  "message": "Hola, quiero información"
}
```

## Comandos útiles

```bash
npm run synth    # genera el CloudFormation template
npm run diff     # muestra cambios antes de deployar
npm run deploy   # despliega en AWS
npm run build    # compila TypeScript
```

## Destroy

```bash
npx cdk destroy
```
