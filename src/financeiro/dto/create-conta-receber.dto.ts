import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateContaReceberDto {
  @IsString()
  descricao!: string;

  @IsNumber()
  valor!: number;

  @IsDateString()
  vencimento!: string;

  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  pedidoId?: string;
}