import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { json, urlencoded } from "express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AllExceptionsFilter } from "./common/http-exception-filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "error", "warn", "debug", "verbose"],
  });

  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger documentation (dev only)
  if (configService.get<string>('app.nodeEnv') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle("SimplyFiles API")
      .setDescription("SimplyFiles Document Management Server")
      .setVersion(process.env.APP_VERSION || "dev")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docx", app, document);
  }

  app.setGlobalPrefix("api", {
    exclude: ['/', '/health'],
  });

  const corsOrigin = configService.get<string>('app.corsOrigin') || "http://localhost:5173";
  app.enableCors({
    origin: corsOrigin.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));

  const port = configService.get<number>('app.port') || 3001;
  await app.listen(port);
  new Logger('Bootstrap').log(`SimplyFiles API running on port ${port}`);
}

bootstrap();
