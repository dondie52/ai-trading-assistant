import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { allowedCorsOrigins } from "./common/cors.js";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"]
  });
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: allowedCorsOrigins(),
    credentials: false,
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
};

void bootstrap();
