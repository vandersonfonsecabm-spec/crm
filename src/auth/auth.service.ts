import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { nome, email, senha, empresaNome } = registerDto;

    const userExists = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (userExists) {
      throw new BadRequestException('Email já cadastrado.');
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const empresa = await this.prisma.empresa.create({
      data: {
        nome: empresaNome,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        nome,
        email,
        senha: senhaHash,
        role: 'ADMIN',
        empresaId: empresa.id,
      },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      empresaId: user.empresaId,
    };

    const access_token = await this.jwtService.signAsync(payload);

    return {
      access_token,

      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        empresaId: user.empresaId,
      },

      empresa: {
        id: empresa.id,
        nome: empresa.nome,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, senha } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        empresa: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos.');
    }

    const senhaCorreta = await bcrypt.compare(senha, user.senha);

    if (!senhaCorreta) {
      throw new UnauthorizedException('Email ou senha inválidos.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      empresaId: user.empresaId,
    };

    const access_token = await this.jwtService.signAsync(payload);

    return {
      access_token,

      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        empresaId: user.empresaId,
      },

      empresa: user.empresa
        ? {
            id: user.empresa.id,
            nome: user.empresa.nome,
          }
        : null,
    };
  }
}