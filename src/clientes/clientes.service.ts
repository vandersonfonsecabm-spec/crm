import { Injectable } from '@nestjs/common';

@Injectable()
export class ClientesService {
  private clientes = [
    {
      id: 1,
      nome: 'Cliente Fazenda Modelo',
      telefone: '(35) 99999-0001',
      cidade: 'Caxambu',
      estado: 'MG',
    },
    {
      id: 2,
      nome: 'Agro Peças Sul de Minas',
      telefone: '(35) 99999-0002',
      cidade: 'São Lourenço',
      estado: 'MG',
    },
  ];

  findAll() {
    return this.clientes;
  }

  findOne(id: number) {
    return this.clientes.find((cliente) => cliente.id === id);
  }

  create(createClienteDto: any) {
    const novoCliente = {
      id: this.clientes.length + 1,
      ...createClienteDto,
    };

    this.clientes.push(novoCliente);

    return novoCliente;
  }

  update(id: number, updateClienteDto: any) {
    const clienteIndex = this.clientes.findIndex(
      (cliente) => cliente.id === id,
    );

    if (clienteIndex === -1) {
      return { message: 'Cliente não encontrado' };
    }

    this.clientes[clienteIndex] = {
      ...this.clientes[clienteIndex],
      ...updateClienteDto,
    };

    return this.clientes[clienteIndex];
  }

  remove(id: number) {
    const clienteIndex = this.clientes.findIndex(
      (cliente) => cliente.id === id,
    );

    if (clienteIndex === -1) {
      return { message: 'Cliente não encontrado' };
    }

    const removido = this.clientes[clienteIndex];

    this.clientes.splice(clienteIndex, 1);

    return removido;
  }
}