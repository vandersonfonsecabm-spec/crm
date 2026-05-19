import { Module } from '@nestjs/common';

import { AuditoriaController } from './auditoria.controller';

import { AuditoriaService } from './auditoria.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],

  controllers: [AuditoriaController],

  providers: [AuditoriaService],

  exports: [AuditoriaService],
})
export class AuditoriaModule {}