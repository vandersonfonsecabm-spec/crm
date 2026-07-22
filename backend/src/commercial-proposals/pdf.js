function generateProposalPdf(proposal) {
  const lines = proposalLines(proposal);
  const chunks = [];
  for (let index = 0; index < lines.length; index += 42) chunks.push(lines.slice(index, index + 42));
  const pageChunks = chunks.length ? chunks : [["Proposta comercial"]];
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const pageIds = [];
  pageChunks.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(`${pageId} 0 R`);
    const content = contentStream(pageLines);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${pageIds.join(" ")}] /Count ${pageIds.length} >>`;

  const parts = [Buffer.from("%PDF-1.4\n%CRM\n", "latin1")];
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = parts.reduce((sum, part) => sum + part.length, 0);
    parts.push(Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "latin1"));
  }
  const xrefOffset = parts.reduce((sum, part) => sum + part.length, 0);
  const xref = [
    `xref\n0 ${objects.length}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}

function proposalLines(proposal) {
  const company = proposal.empresa?.nome || "Empresa";
  const client = proposal.cliente?.nome || "Cliente nao informado";
  const business = proposal.negocio?.titulo || `Negocio #${proposal.negocioId}`;
  const lines = [
    company,
    "PROPOSTA COMERCIAL",
    `${proposal.codigo} | Versao ${proposal.versao} | ${proposal.status}`,
    "",
    `Cliente: ${client}`,
    `Negocio: ${business}`,
    `Validade: ${formatDate(proposal.validade)}`,
    `Titulo: ${proposal.titulo}`,
  ];
  if (proposal.descricao) lines.push(...wrap(`Descricao: ${proposal.descricao}`));
  lines.push("", "ITENS");
  proposal.itens.forEach((item, index) => {
    lines.push(...wrap(`${index + 1}. ${item.descricao}`));
    lines.push(`   ${item.quantidade} x ${money(item.valorUnitarioCentavos)} | desconto ${money(item.descontoCentavos)} | total ${money(item.totalCentavos)}`);
  });
  lines.push(
    "",
    `Subtotal: ${money(proposal.subtotalCentavos)}`,
    `Desconto geral: ${money(proposal.descontoGeralCentavos)}`,
    `TOTAL: ${money(proposal.totalCentavos)}`,
  );
  if (proposal.condicoesComerciais) lines.push("", ...wrap(`Condicoes comerciais: ${proposal.condicoesComerciais}`));
  if (proposal.observacoes) lines.push("", ...wrap(`Observacoes: ${proposal.observacoes}`));
  lines.push("", "Documento gerado pelo CRM. O estado ENVIADA nao representa envio por canal externo.");
  return lines;
}

function contentStream(lines) {
  const commands = ["BT", "/F1 10 Tf", "50 800 Td"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -17 Td");
    commands.push(`(${pdfText(line)}) Tj`);
  });
  commands.push("ET");
  return commands.join("\n");
}

function wrap(value, limit = 84) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= limit) current = next;
    else {
      if (current) lines.push(current);
      current = word.slice(0, limit);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pdfText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/([\\()])/g, "\\$1");
}

function money(cents) {
  return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
}

function formatDate(value) {
  const date = new Date(value);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

module.exports = { generateProposalPdf };
