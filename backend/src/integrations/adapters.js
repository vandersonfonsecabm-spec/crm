class IntegrationAdapter {
  constructor({ tipo, config = {} } = {}) {
    this.tipo = tipo;
    this.config = config;
  }

  async testConnection() {
    return connectorNotImplemented(this.tipo);
  }

  async fetchProducts() {
    return connectorNotImplemented(this.tipo);
  }

  async fetchStock() {
    return connectorNotImplemented(this.tipo);
  }

  async fetchPrices() {
    return connectorNotImplemented(this.tipo);
  }

  async fetchPaymentTerms() {
    return connectorNotImplemented(this.tipo);
  }
}

class BlingAdapter extends IntegrationAdapter {}
class OmieAdapter extends IntegrationAdapter {}
class ContaAzulAdapter extends IntegrationAdapter {}
class TinyAdapter extends IntegrationAdapter {}
class AlterdataAdapter extends IntegrationAdapter {}
class CsvAdapter extends IntegrationAdapter {}
class XlsxAdapter extends IntegrationAdapter {}
class XmlAdapter extends IntegrationAdapter {}
class JsonAdapter extends IntegrationAdapter {}
class CustomAdapter extends IntegrationAdapter {}

const ADAPTERS = {
  BLING: BlingAdapter,
  OMIE: OmieAdapter,
  CONTA_AZUL: ContaAzulAdapter,
  TINY: TinyAdapter,
  ALTERDATA: AlterdataAdapter,
  CSV: CsvAdapter,
  XLSX: XlsxAdapter,
  XML: XmlAdapter,
  JSON: JsonAdapter,
  CUSTOM: CustomAdapter,
};

function createIntegrationAdapter(tipo, config = {}) {
  const Adapter = ADAPTERS[tipo];
  if (!Adapter) {
    const error = new Error("Tipo de integracao invalido.");
    error.code = "INTEGRATION_INVALID_TYPE";
    throw error;
  }

  return new Adapter({ tipo, config });
}

function connectorNotImplemented(tipo) {
  const error = new Error(`Conector ${tipo || "desconhecido"} ainda nao implementado.`);
  error.code = "CONNECTOR_NOT_IMPLEMENTED";
  throw error;
}

module.exports = {
  IntegrationAdapter,
  BlingAdapter,
  OmieAdapter,
  ContaAzulAdapter,
  TinyAdapter,
  AlterdataAdapter,
  CsvAdapter,
  XlsxAdapter,
  XmlAdapter,
  JsonAdapter,
  CustomAdapter,
  createIntegrationAdapter,
};
