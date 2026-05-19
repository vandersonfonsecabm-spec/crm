import {
  IsArray,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

class CreatePedidoItemDto {
  @IsString()
  produtoId!: string;

  @IsNumber()
  quantidade!: number;

  @IsNumber()
  preco!: number;
}

export class CreatePedidoDto {
  @IsString()
  clienteId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoItemDto)
  itens!: CreatePedidoItemDto[];
}