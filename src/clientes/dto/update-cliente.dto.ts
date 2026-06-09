import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  empresa?: string;

  @IsOptional()
  @IsString()
  cidade?: string;

  @IsOptional()
  @IsString()
  fazenda?: string;

  @IsOptional()
  @IsString()
  interesse?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsString()
  origem?: string;

  @IsOptional()
  @IsBoolean()
  favorito?: boolean;

  @IsOptional()
  @IsBoolean()
  quente?: boolean;

  @IsOptional()
  @IsNumber()
  ultimoContato?: number;

  @IsOptional()
  @IsString()
  proximoFollowUp?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
