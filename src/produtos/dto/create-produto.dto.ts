import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProdutoDto {
  @IsString()
  nome!: string;

  @IsOptional()
  @IsString()
  codigo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsNumber()
  precoCusto?: number;

  @IsOptional()
  @IsNumber()
  precoVenda?: number;

  @IsOptional()
  @IsNumber()
  estoque?: number;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}