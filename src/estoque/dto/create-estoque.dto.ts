import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export enum TipoMovimentacao {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
  AJUSTE = 'AJUSTE',
}

export class CreateEstoqueDto {
  @IsString()
  produtoId: string;

  @IsEnum(TipoMovimentacao)
  tipo: TipoMovimentacao;

  @IsInt()
  quantidade: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}