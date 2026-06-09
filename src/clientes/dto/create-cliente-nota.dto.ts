import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClienteNotaDto {
  @IsString()
  @MinLength(1)
  texto!: string;

  @IsOptional()
  @IsString()
  tipo?: string;
}
