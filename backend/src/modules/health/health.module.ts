import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController, RootHealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, RootHealthController],
})
export class HealthModule {}
