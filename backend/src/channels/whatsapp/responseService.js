function buildPreparedResponse({ intent, product, followUpRequired }) {
  if (intent.intencao === "SAUDACAO") {
    return "Olá! Posso ajudar com produtos, preços, estoque ou atendimento de um vendedor.";
  }
  if (intent.intencao === "FALAR_COM_VENDEDOR") {
    return "Certo. Registrei seu pedido para que um vendedor entre em contato.";
  }
  if (!product) {
    return "Não encontrei esse produto no catálogo. Posso encaminhar para um vendedor.";
  }
  if (!product.ativo || product.disponibilidade === "INDISPONIVEL") {
    return `Encontrei ${product.nome}, mas ele está indisponível no momento.`;
  }
  if (product.disponibilidade === "SEM_ESTOQUE") {
    return `Encontramos ${product.nome}, mas ele está sem estoque disponível no momento.`;
  }
  if (product.disponibilidade === "DESCONHECIDO") {
    return `Encontramos ${product.nome}, mas não foi possível confirmar o estoque agora. Um vendedor pode verificar para você.`;
  }
  if (product.precoAtualCentavos === null || product.precoAtualCentavos === undefined) {
    return `Encontramos ${product.nome}, mas o preço não está disponível no momento. Um vendedor pode confirmar para você.`;
  }

  const location = product.locais && product.locais.length ? ` no ${product.locais[0]}` : "";
  const stock = product.quantidadeDisponivelTotal ? ` Disponível: ${product.quantidadeDisponivelTotal} unidade(s)${location}.` : "";
  const promotion = product.emPromocao ? " Produto em promoção vigente." : "";
  const stale = product.dadosDesatualizados ? " Os dados podem estar desatualizados." : "";
  const handoff = followUpRequired ? " Um vendedor também pode confirmar os detalhes." : "";
  return `Encontramos ${product.nome}. Preço atual: ${formatMoney(product.precoAtualCentavos)}.${stock}${promotion}${stale}${handoff}`;
}

function formatMoney(value) {
  const cents = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function summarizeProduct(product) {
  if (!product) return null;
  return {
    idCanonico: product.idCanonico,
    externalId: product.externalId,
    nome: product.nome,
    sku: product.sku,
    codigoBarras: product.codigoBarras,
    ativo: product.ativo,
    disponibilidade: product.disponibilidade,
    quantidadeDisponivelTotal: product.quantidadeDisponivelTotal,
    precoAtualCentavos: product.precoAtualCentavos,
    precoOriginalCentavos: product.precoOriginalCentavos,
    emPromocao: product.emPromocao,
    dadosDesatualizados: product.dadosDesatualizados,
    locais: product.locais || [],
    avisos: product.avisos || [],
  };
}

module.exports = { buildPreparedResponse, summarizeProduct };
