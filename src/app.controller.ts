import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHome() {
    return {
      status: 'online',
      sistema: 'CRM Agro API',
      versao: '1.0.0',
    };
  }

  @Get('health')
  getHealth() {
    return {
      ok: true,
      api: 'online',
    };
  }
}