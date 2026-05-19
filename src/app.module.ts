import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaService } from './prisma/prisma.service';

import { AuthModule } from './auth/auth.module';

import { ClientesModule } from './clientes/clientes.module';

import { ProdutosModule } from './produtos/produtos.module';

import { EstoqueModule } from './estoque/estoque.module';

import { PedidosModule } from './pedidos/pedidos.module';

import { FinanceiroModule } from './financeiro/financeiro.module';

import { DashboardModule } from './dashboard/dashboard.module';

import { RelatoriosModule } from './relatorios/relatorios.module';

import { AnalyticsModule } from './analytics/analytics.module';
import { AuditoriaModule } from './auditoria/auditoria.module';

@Module({
  imports: [
    AuthModule,

    ClientesModule,

    ProdutosModule,

    EstoqueModule,

    PedidosModule,

    FinanceiroModule,

    DashboardModule,

    RelatoriosModule,

    AnalyticsModule,

    AuditoriaModule,
  ],

  controllers: [AppController],

  providers: [AppService, PrismaService],
})
export class AppModule {}