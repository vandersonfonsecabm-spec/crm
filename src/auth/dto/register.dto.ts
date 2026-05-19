import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  nome!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  senha!: string;

  @IsNotEmpty()
  empresaNome!: string;
}