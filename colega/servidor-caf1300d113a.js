var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../automacao/repo-d1.mjs
var COLUNAS = {
  titulo: "titulo",
  estado: "estado",
  filtros: "filtros",
  horaInicio: "hora_inicio",
  horaFim: "hora_fim",
  intervaloMin: "intervalo_min",
  ultimoPostEm: "ultimo_post_em",
  falhasSeguidas: "falhas_seguidas",
  diaTravado: "dia_travado",
  diaTentativas: "dia_tentativas",
  tentativasHoje: "tentativas_hoje",
  descansaAte: "descansa_ate"
};
var BLOCO = 12;
var COLUNAS_PRODUTO = { proximaPalavra: "proxima_palavra", proximaOferta: "proxima_oferta", pulosVariedade: "pulos_variedade" };
function doBanco(l) {
  return {
    chatId: l.chat_id,
    titulo: l.titulo,
    estado: l.estado,
    filtros: JSON.parse(l.filtros || "{}"),
    horaInicio: l.hora_inicio,
    horaFim: l.hora_fim,
    intervaloMin: l.intervalo_min,
    ultimoPostEm: l.ultimo_post_em ?? null,
    falhasSeguidas: l.falhas_seguidas,
    diaTravado: l.dia_travado ?? null,
    diaTentativas: l.dia_tentativas ?? null,
    tentativasHoje: l.tentativas_hoje,
    descansaAte: l.descansa_ate ?? null,
    proximaPalavra: l.proxima_palavra ?? 0,
    proximaOferta: l.proxima_oferta ?? 0,
    pulosVariedade: l.pulos_variedade ?? 0,
    estoqueN: l.estoque_n,
    dono: l.dono ?? null,
    // só existe no banco do produto (v3)
    botId: l.bot_id ?? null
  };
}
__name(doBanco, "doBanco");
var ofertaDoBanco = /* @__PURE__ */ __name((l) => ({ id: l.id, chatId: l.chat_id, nome: l.nome, filtros: JSON.parse(l.filtros || "{}"), ativa: l.ativa === 1, publica: l.publica !== 0, loja: l.loja ?? "shopee", proximaPalavra: l.proxima_palavra ?? 0, criadaEm: l.criada_em }), "ofertaDoBanco");
function criarRepoD1(db, { multi = false } = {}) {
  const recontar = /* @__PURE__ */ __name((chatId) => db.prepare("UPDATE grupos SET estoque_n = (SELECT COUNT(*) FROM estoque WHERE chat_id = ?) WHERE chat_id = ?").bind(chatId, chatId), "recontar");
  const daLinha = /* @__PURE__ */ __name((l) => {
    const o = JSON.parse(l.dados);
    if (multi && "oferta_id" in l) {
      o.palavra = l.palavra ?? null;
      o.ofertaId = l.oferta_id ?? null;
    }
    return o;
  }, "daLinha");
  async function anexarOfertas(lista, consulta) {
    const { results } = await consulta.all();
    const por = /* @__PURE__ */ new Map();
    for (const l of results) (por.get(l.chat_id) ?? por.set(l.chat_id, []).get(l.chat_id)).push(ofertaDoBanco(l));
    for (const g of lista) g.ofertas = por.get(g.chatId) ?? [];
  }
  __name(anexarOfertas, "anexarOfertas");
  return {
    async criarGrupo(g) {
      const base = [String(g.chatId), g.titulo ?? null, g.estado ?? "aguardando", JSON.stringify(g.filtros ?? {}), g.horaInicio ?? 9, g.horaFim ?? 22, g.intervaloMin ?? 60, g.criadoEm ?? Date.now()];
      if (multi) {
        await db.prepare("INSERT OR IGNORE INTO grupos (chat_id, titulo, estado, filtros, hora_inicio, hora_fim, intervalo_min, criado_em, dono, bot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...base, g.dono ?? null, g.botId ?? null).run();
        return;
      }
      await db.prepare("INSERT OR IGNORE INTO grupos (chat_id, titulo, estado, filtros, hora_inicio, hora_fim, intervalo_min, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(...base).run();
    },
    // Só no banco do produto: grupos de uma pessoa, troca de ID (grupo virou supergrupo) e remoção.
    async gruposDoDono(dono) {
      const { results } = await db.prepare("SELECT * FROM grupos WHERE dono = ?").bind(dono).all();
      const lista = results.map(doBanco);
      await anexarOfertas(lista, db.prepare("SELECT o.* FROM ofertas o JOIN grupos g ON g.chat_id = o.chat_id WHERE g.dono = ? ORDER BY o.criada_em, o.rowid").bind(dono));
      return lista;
    },
    // ---- ofertas do grupo (só no banco do produto)
    async criarOferta({ id, chatId, nome, filtros = {}, ativa = true, publica = true, loja = "shopee", criadaEm = Date.now() }) {
      await db.prepare("INSERT INTO ofertas (id, chat_id, nome, filtros, ativa, publica, loja, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, String(chatId), nome, JSON.stringify(filtros), ativa ? 1 : 0, publica ? 1 : 0, loja, criadaEm).run();
    },
    async atualizarOferta(id, mudancas) {
      const mapa = { nome: "nome", filtros: "filtros", ativa: "ativa", publica: "publica", loja: "loja", proximaPalavra: "proxima_palavra" };
      const campos = Object.keys(mudancas).filter((k) => mapa[k]);
      if (!campos.length) return;
      const valores = campos.map((k) => k === "filtros" ? JSON.stringify(mudancas[k]) : k === "ativa" || k === "publica" ? mudancas[k] ? 1 : 0 : mudancas[k]);
      await db.prepare(`UPDATE ofertas SET ${campos.map((k) => `${mapa[k]} = ?`).join(", ")} WHERE id = ?`).bind(...valores, id).run();
    },
    async removerOferta(id) {
      const o = await db.prepare("SELECT chat_id FROM ofertas WHERE id = ?").bind(id).first();
      if (!o) return;
      await db.batch([db.prepare("DELETE FROM estoque WHERE oferta_id = ?").bind(id), db.prepare("DELETE FROM ofertas WHERE id = ?").bind(id), recontar(o.chat_id)]);
    },
    async podarEstoqueDaOferta(chatId, ofertaId, palavras) {
      const id = String(chatId);
      const filtro = palavras.length ? `AND palavra NOT IN (${palavras.map(() => "?").join(", ")})` : "";
      await db.batch([db.prepare(`DELETE FROM estoque WHERE chat_id = ? AND oferta_id = ? AND palavra IS NOT NULL ${filtro}`).bind(id, ofertaId, ...palavras), recontar(id)]);
    },
    async esvaziarEstoqueDaOferta(chatId, ofertaId) {
      const id = String(chatId);
      await db.batch([db.prepare("DELETE FROM estoque WHERE chat_id = ? AND oferta_id = ?").bind(id, ofertaId), recontar(id)]);
    },
    async migrarChat(antigo, novo) {
      const a = String(antigo);
      const n = String(novo);
      await db.batch([
        db.prepare("UPDATE grupos SET chat_id = ? WHERE chat_id = ?").bind(n, a),
        db.prepare("UPDATE estoque SET chat_id = ? WHERE chat_id = ?").bind(n, a),
        db.prepare("UPDATE postados SET chat_id = ? WHERE chat_id = ?").bind(n, a),
        ...multi ? [db.prepare("UPDATE ofertas SET chat_id = ? WHERE chat_id = ?").bind(n, a)] : []
      ]);
    },
    async removerGrupo(chatId) {
      const id = String(chatId);
      await db.batch([
        db.prepare("DELETE FROM estoque WHERE chat_id = ?").bind(id),
        db.prepare("DELETE FROM postados WHERE chat_id = ?").bind(id),
        ...multi ? [db.prepare("DELETE FROM ofertas WHERE chat_id = ?").bind(id)] : [],
        db.prepare("DELETE FROM grupos WHERE chat_id = ?").bind(id)
      ]);
    },
    async grupos() {
      const { results } = await db.prepare("SELECT * FROM grupos").all();
      const lista = results.map(doBanco);
      if (multi) await anexarOfertas(lista, db.prepare("SELECT * FROM ofertas ORDER BY criada_em, rowid"));
      return lista;
    },
    async atualizarGrupo(chatId, mudancas) {
      const colunas = multi ? { ...COLUNAS, ...COLUNAS_PRODUTO } : COLUNAS;
      const campos = Object.keys(mudancas).filter((k) => colunas[k]);
      if (!campos.length) return;
      const sets = campos.map((k) => `${colunas[k]} = ?`).join(", ");
      const valores = campos.map((k) => k === "filtros" ? JSON.stringify(mudancas[k]) : mudancas[k] ?? null);
      await db.prepare(`UPDATE grupos SET ${sets} WHERE chat_id = ?`).bind(...valores, String(chatId)).run();
    },
    async contarEstoque(chatId) {
      const r = await db.prepare("SELECT estoque_n AS n FROM grupos WHERE chat_id = ?").bind(String(chatId)).first();
      return r?.n ?? 0;
    },
    // palavra e ofertaId (só no banco do produto) são filtros opcionais: a primeira oferta guardada que combina.
    async primeiroDoEstoque(chatId, palavra, ofertaId, limites = {}) {
      let sql = `SELECT dados${multi ? ", palavra, oferta_id" : ""} FROM estoque WHERE chat_id = ?`;
      const args = [String(chatId)];
      if (multi && ofertaId !== void 0) {
        sql += " AND oferta_id = ?";
        args.push(ofertaId);
      }
      if (multi && palavra !== void 0) {
        sql += " AND palavra = ?";
        args.push(palavra);
      }
      if (multi && limites.semTipo) {
        sql += " AND (tipo IS NULL OR tipo != ?)";
        args.push(limites.semTipo);
      }
      if (multi && limites.semLoja) {
        sql += " AND (loja IS NULL OR loja != ?)";
        args.push(limites.semLoja);
      }
      const r = await db.prepare(`${sql} ORDER BY id LIMIT 1`).bind(...args).first();
      return r ? daLinha(r) : null;
    },
    // Tira do estoque as ofertas de palavras que a pessoa tirou da busca (e refaz a contagem).
    async podarEstoquePorPalavras(chatId, palavras) {
      if (!multi) return;
      const id = String(chatId);
      const marcas = palavras.map(() => "?").join(", ");
      const filtro = palavras.length ? `AND palavra NOT IN (${marcas})` : "";
      await db.batch([db.prepare(`DELETE FROM estoque WHERE chat_id = ? AND palavra IS NOT NULL ${filtro}`).bind(id, ...palavras), recontar(id)]);
    },
    async removerDoEstoque(chatId, produtoId) {
      await db.batch([db.prepare("DELETE FROM estoque WHERE chat_id = ? AND produto_id = ?").bind(String(chatId), String(produtoId)), recontar(String(chatId))]);
    },
    async estoque(chatId) {
      const { results } = await db.prepare(`SELECT dados${multi ? ", palavra, oferta_id" : ""} FROM estoque WHERE chat_id = ? ORDER BY id`).bind(String(chatId)).all();
      return results.map(daLinha);
    },
    // Troca o estoque pela lista dada, por diferença: apaga o que saiu e acrescenta o que entrou no fim da fila.
    async salvarEstoque(chatId, lista) {
      const id = String(chatId);
      const { results } = await db.prepare("SELECT produto_id FROM estoque WHERE chat_id = ?").bind(id).all();
      const existentes = new Set(results.map((l) => l.produto_id));
      const novos = new Set(lista.map((o) => o.produtoId));
      const comandos = [];
      for (const pid of existentes) if (!novos.has(pid)) comandos.push(db.prepare("DELETE FROM estoque WHERE chat_id = ? AND produto_id = ?").bind(id, pid));
      const aInserir = lista.filter((o) => !existentes.has(o.produtoId));
      for (let i = 0; i < aInserir.length; i += BLOCO) {
        const bloco = aInserir.slice(i, i + BLOCO);
        if (multi) {
          const valores = bloco.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
          const args = bloco.flatMap((o) => [id, o.produtoId, o.buscadoEm, JSON.stringify(o), o.palavra ?? null, o.ofertaId ?? null, o.tipo ?? null, o.lojaId ?? null]);
          comandos.push(db.prepare(`INSERT OR IGNORE INTO estoque (chat_id, produto_id, buscado_em, dados, palavra, oferta_id, tipo, loja) VALUES ${valores}`).bind(...args));
        } else {
          const valores = bloco.map(() => "(?, ?, ?, ?)").join(", ");
          const args = bloco.flatMap((o) => [id, o.produtoId, o.buscadoEm, JSON.stringify(o)]);
          comandos.push(db.prepare(`INSERT OR IGNORE INTO estoque (chat_id, produto_id, buscado_em, dados) VALUES ${valores}`).bind(...args));
        }
      }
      comandos.push(recontar(id));
      await db.batch(comandos);
    },
    async jaPostados(chatId) {
      const { results } = await db.prepare("SELECT produto_id FROM postados WHERE chat_id = ?").bind(String(chatId)).all();
      return new Set(results.map((l) => l.produto_id));
    },
    async registrarPostado(chatId, produtoId, agora, tipo = null, loja = null) {
      if (multi) {
        await db.prepare("INSERT OR REPLACE INTO postados (chat_id, produto_id, postado_em, tipo, loja) VALUES (?, ?, ?, ?, ?)").bind(String(chatId), String(produtoId), agora, tipo, loja == null ? null : String(loja)).run();
        return;
      }
      await db.prepare("INSERT OR REPLACE INTO postados (chat_id, produto_id, postado_em) VALUES (?, ?, ?)").bind(String(chatId), String(produtoId), agora).run();
    },
    // Os últimos posts do grupo (do mais novo para o mais antigo), para limitar repetição seguida do mesmo tipo e da mesma loja.
    async ultimosPosts(chatId, n = 10) {
      if (!multi) return [];
      const { results } = await db.prepare("SELECT tipo, loja FROM postados WHERE chat_id = ? ORDER BY postado_em DESC, rowid DESC LIMIT ?").bind(String(chatId), n).all();
      return results.map((l) => ({ tipo: l.tipo ?? null, loja: l.loja ?? null }));
    },
    // Quantas ofertas a PESSOA já enviou desde o início do dia somando todos os grupos dela (limite diário do plano).
    async contarPostadosDoDonoDesde(dono, desde) {
      const l = await db.prepare("SELECT COUNT(*) AS n FROM postados p JOIN grupos g ON g.chat_id = p.chat_id WHERE g.dono = ? AND p.postado_em >= ?").bind(dono, desde).first();
      return l?.n ?? 0;
    },
    // Quantas ofertas o grupo já enviou desde o início do dia.
    async contarPostadosDesde(chatId, desde) {
      const l = await db.prepare("SELECT COUNT(*) AS n FROM postados WHERE chat_id = ? AND postado_em >= ?").bind(String(chatId), desde).first();
      return l?.n ?? 0;
    },
    async esquecerPostadosAntes(chatId, limite) {
      await db.prepare("DELETE FROM postados WHERE chat_id = ? AND postado_em < ?").bind(String(chatId), limite).run();
    },
    // Reserva condicional: só vale se ninguém postou nesse grupo desde que lemos (evita post duplicado).
    async reservarPost(chatId, agora, ultimoEsperado) {
      const r = await db.prepare("UPDATE grupos SET ultimo_post_em = ? WHERE chat_id = ? AND ultimo_post_em IS ?").bind(agora, String(chatId), ultimoEsperado ?? null).run();
      return (r.meta?.changes ?? 0) === 1;
    },
    async liberarReserva(chatId, ultimoAnterior) {
      await db.prepare("UPDATE grupos SET ultimo_post_em = ? WHERE chat_id = ?").bind(ultimoAnterior ?? null, String(chatId)).run();
    }
  };
}
__name(criarRepoD1, "criarRepoD1");

// ../automacao/shopee.mjs
import { createHash } from "node:crypto";
var ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";
var CAMPOS = "itemId shopId productName price priceMin priceMax sales ratingStar priceDiscountRate commissionRate imageUrl productLink offerLink shopName productCatIds";
function assinar({ appId, timestamp, corpo, secret }) {
  return createHash("sha256").update(`${appId}${timestamp}${corpo}${secret}`, "utf8").digest("hex");
}
__name(assinar, "assinar");
function cabecalho({ appId, timestamp, assinatura }) {
  return `SHA256 Credential=${appId}, Signature=${assinatura}, Timestamp=${timestamp}`;
}
__name(cabecalho, "cabecalho");
function consultaLote({ palavra, pagina = 1, limite = 50 }) {
  const args = [];
  if (palavra) args.push(`keyword: ${JSON.stringify(palavra)}`);
  else args.push("sortType: 2");
  args.push(`page: ${pagina}`, `limit: ${limite}`);
  return `{ productOfferV2(${args.join(", ")}) { nodes { ${CAMPOS} } } }`;
}
__name(consultaLote, "consultaLote");
function consultaItem({ itemId, shopId }) {
  return `{ productOfferV2(itemId: ${Number(itemId)}, shopId: ${Number(shopId)}, limit: 1) { nodes { ${CAMPOS} } } }`;
}
__name(consultaItem, "consultaItem");
function criarShopee({ appId, secret, buscar = fetch, agoraSegundos = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "agoraSegundos"), limiteMs = 6e4 }) {
  if (!appId || !secret) throw new Error("faltam o App ID e o Secret da Shopee");
  async function consultar(consulta) {
    const corpo = JSON.stringify({ query: consulta });
    const timestamp = agoraSegundos();
    const assinatura = assinar({ appId, timestamp, corpo, secret });
    try {
      const r = await buscar(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: cabecalho({ appId, timestamp, assinatura }) },
        body: corpo,
        signal: AbortSignal.timeout(limiteMs)
      });
      const json2 = await r.json().catch(() => null);
      if (json2?.errors?.length) return { ok: false, erro: json2.errors.map((e) => e.message).join("; ") };
      const nodes = json2?.data?.productOfferV2?.nodes;
      if (!Array.isArray(nodes)) return { ok: false, erro: `resposta inesperada (HTTP ${r.status})` };
      return { ok: true, nodes };
    } catch (e) {
      return { ok: false, erro: `sem resposta (${e.name})` };
    }
  }
  __name(consultar, "consultar");
  return {
    // Formato esperado por reabastecer() em estoque.mjs.
    async buscarLote(pedido) {
      const r = await consultar(consultaLote(pedido));
      return r.ok ? { ok: true, ofertas: r.nodes } : r;
    },
    // Leitura de uma oferta pelo itemId e shopId (estável). Distingue três casos:
    //   { ok:true, oferta }        a oferta continua existindo (oferta crua da Shopee)
    //   { ok:true, oferta:null }   a Shopee respondeu e a oferta não existe mais (sumiu)
    //   { ok:false, erro }         não deu para saber (erro de rede ou da Shopee)
    async lerOferta({ itemId, shopId }) {
      const r = await consultar(consultaItem({ itemId, shopId }));
      return r.ok ? { ok: true, oferta: r.nodes[0] ?? null } : { ok: false, erro: r.erro };
    }
  };
}
__name(criarShopee, "criarShopee");

// ../src/format.js
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(esc, "esc");
function brl(n) {
  const [int, dec2] = n.toFixed(2).split(".");
  return "R$ " + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec2;
}
__name(brl, "brl");
function buildCaption(item, aviso = "") {
  const parts = [`\u{1F525} <b>${esc(item.titulo)}</b>`, ""];
  if (item.precoAntigo) {
    const off = Math.round((1 - item.preco / item.precoAntigo) * 100);
    parts.push(`\u{1F4B0} <s>${brl(item.precoAntigo)}</s> por <b>${brl(item.preco)}</b> (\u2212${off}%)`);
  } else {
    parts.push(`\u{1F4B0} <b>${brl(item.preco)}</b>`);
  }
  if (aviso) parts.push("", `<i>${esc(aviso)}</i>`);
  return parts.join("\n");
}
__name(buildCaption, "buildCaption");
function buildCaptionCompacta(item, link, aviso = "", linkGrupo = "") {
  const titulo = String(item.titulo).length > 200 ? `${String(item.titulo).slice(0, 197)}...` : String(item.titulo);
  const parts = [`\u{1F525} ${esc(titulo)}`, "", `\u{1F4B2} Valor: ${brl(item.preco)}`, "", `\u{1F517} ${esc(link)}`];
  if (linkGrupo) parts.push("", `\u{1F517} Entre no meu grupo de ofertas: ${esc(linkGrupo)}`);
  if (aviso) parts.push("", `<i>${esc(aviso)}</i>`);
  return parts.join("\n");
}
__name(buildCaptionCompacta, "buildCaptionCompacta");

// ../automacao/telegram.mjs
function criarEnviador({ tg, compacto = false }) {
  return /* @__PURE__ */ __name(async function enviar(chatId, oferta, aviso = "", linkGrupo = "") {
    const link = oferta.urlAfiliado || oferta.url;
    const legenda = compacto ? buildCaptionCompacta(oferta, link, aviso, linkGrupo) : buildCaption(oferta, aviso);
    const botao = { inline_keyboard: [[{ text: "\u{1F6D2} Ver oferta", url: link }]] };
    if (oferta.imagem) {
      const r2 = await tg("sendPhoto", { chat_id: chatId, photo: oferta.imagem, caption: legenda, parse_mode: "HTML", reply_markup: botao });
      if (r2.ok) return { ok: true };
      if (r2.error_code === 429) return { ok: false, erro: r2.description, esperarSegundos: r2.parameters?.retry_after ?? 5 };
    }
    const r = await tg("sendMessage", { chat_id: chatId, text: legenda, parse_mode: "HTML", reply_markup: botao, link_preview_options: { is_disabled: true } });
    if (r.ok) return { ok: true };
    return { ok: false, erro: r.description, ...r.error_code === 429 ? { esperarSegundos: r.parameters?.retry_after ?? 5 } : {} };
  }, "enviar");
}
__name(criarEnviador, "criarEnviador");

// ../automacao/estoque.mjs
var ALVO_PADRAO = 48;
var TENTATIVAS_MAX = 100;
var MAX_HORAS_NO_ESTOQUE = 120;
var dormir = /* @__PURE__ */ __name((ms) => new Promise((r) => setTimeout(r, ms)), "dormir");
var GENERICAS = /* @__PURE__ */ new Set(["kit", "kits", "jogo", "jogos", "conjunto", "conjuntos", "combo", "par", "pares", "pacote", "lote", "set", "unidade", "unidades", "peca", "pecas", "novo", "nova", "novos", "novas", "original", "oferta", "promocao", "frete", "gratis", "super", "mega", "premium", "luxo", "barato", "top", "lancamento", "importado", "nacional", "profissional", "de", "da", "do", "das", "dos", "para", "com", "sem", "em", "por", "ou", "um", "uma", "uns", "umas", "the", "and"]);
var semAcento = /* @__PURE__ */ __name((t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), "semAcento");
function tipoDoProduto(titulo) {
  for (let t of semAcento(titulo).split(/[^a-z0-9]+/)) {
    if (!t || /\d/.test(t) || GENERICAS.has(t)) continue;
    if (t.length < 3 && t !== "tv") continue;
    if (t.length > 4 && (t.endsWith("oes") || t.endsWith("aes"))) t = `${t.slice(0, -3)}ao`;
    else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
    return t;
  }
  return null;
}
__name(tipoDoProduto, "tipoDoProduto");
var chavePalavra = /* @__PURE__ */ __name((p) => p == null ? null : String(p).trim().toLowerCase(), "chavePalavra");
function normalizarOferta(cru, agora, palavra = null, ofertaId = null) {
  const preco = Number(cru.price);
  const desconto = Number(cru.priceDiscountRate) || 0;
  const precoAntigo = desconto > 0 && desconto < 100 ? Math.round(preco / (1 - desconto / 100) * 100) / 100 : null;
  return {
    loja: cru.plataforma ?? "shopee",
    // a loja (plataforma) de onde veio a oferta
    produtoId: String(cru.itemId),
    lojaId: cru.shopId == null ? null : String(cru.shopId),
    titulo: cru.productName,
    preco,
    precoAntigo,
    desconto,
    vendas: cru.sales === null ? null : Number(cru.sales) || 0,
    // null: a loja não informa (Amazon)
    nota: cru.ratingStar === null ? null : Number(cru.ratingStar) || 0,
    comissao: Number(cru.commissionRate) || 0,
    url: cru.productLink,
    urlAfiliado: cru.offerLink,
    imagem: cru.imageUrl,
    buscadoEm: agora,
    palavra: chavePalavra(palavra),
    ofertaId,
    tipo: tipoDoProduto(cru.productName)
  };
}
__name(normalizarOferta, "normalizarOferta");
function passaNosFiltros(o, f = {}) {
  if (f.precoMin != null && o.preco < f.precoMin) return false;
  if (f.precoMax != null && o.preco > f.precoMax) return false;
  if (f.descontoMin != null && o.desconto < f.descontoMin) return false;
  if (f.notaMin != null && o.nota != null && o.nota < f.notaMin) return false;
  if (f.vendasMin != null && o.vendas != null && o.vendas < f.vendasMin) return false;
  const titulo = String(o.titulo).toLowerCase();
  if ((f.proibidas || []).some((p) => titulo.includes(String(p).toLowerCase()))) return false;
  return true;
}
__name(passaNosFiltros, "passaNosFiltros");
async function reabastecer({
  alvo = ALVO_PADRAO,
  filtros = {},
  estoque = [],
  jaPostados = /* @__PURE__ */ new Set(),
  buscarLote,
  tentativasMax = TENTATIVAS_MAX,
  falhasSeguidasMax = 25,
  esperar = dormir,
  agora = Date.now,
  ofertaId = null,
  // oferta do grupo que está sendo abastecida (marca cada oferta guardada)
  maxTipoNoEstoque = null,
  // opcional: no máximo tantas ofertas do mesmo tipo guardadas (evita encher só de fogão)
  maxLojaNoEstoque = null
  // opcional: o mesmo para a mesma loja
}) {
  const fila = [...estoque];
  const vistos = /* @__PURE__ */ new Set([...fila.map((o) => o.produtoId), ...jaPostados]);
  const palavras = filtros.palavras?.length ? filtros.palavras : [null];
  const tetoPorPalavra = Math.ceil(alvo / palavras.length);
  const contagem = {};
  const porTipo = {};
  const porLoja = {};
  for (const o of fila) {
    contagem[o.palavra ?? ""] = (contagem[o.palavra ?? ""] || 0) + 1;
    if (o.tipo) porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1;
    if (o.lojaId) porLoja[o.lojaId] = (porLoja[o.lojaId] || 0) + 1;
  }
  const paginas = {};
  let turno = 0;
  let tentativas = 0;
  let acertos = 0;
  let falhas = 0;
  let seguidas = 0;
  let parou = "alvo";
  const erros = {};
  while (fila.length < alvo) {
    if (tentativas >= tentativasMax) {
      parou = "tentativas";
      break;
    }
    if (seguidas >= falhasSeguidasMax) {
      parou = "disjuntor";
      break;
    }
    const palavra = palavras[turno % palavras.length];
    const chave = String(palavra);
    if (palavras.length > 1 && (contagem[chavePalavra(palavra)] || 0) >= tetoPorPalavra) {
      turno++;
      continue;
    }
    const pagina = paginas[chave] ?? 1;
    tentativas++;
    const r = await buscarLote({ palavra, pagina, limite: 50 });
    if (r.ok) {
      acertos++;
      seguidas = 0;
      paginas[chave] = pagina + 1;
      turno++;
      for (const cru of r.ofertas) {
        const o = normalizarOferta(cru, agora(), palavra, ofertaId);
        if (vistos.has(o.produtoId) || !passaNosFiltros(o, filtros)) continue;
        if (palavras.length > 1 && (contagem[o.palavra] || 0) >= tetoPorPalavra) break;
        if (maxTipoNoEstoque && o.tipo && (porTipo[o.tipo] || 0) >= maxTipoNoEstoque) continue;
        if (maxLojaNoEstoque && o.lojaId && (porLoja[o.lojaId] || 0) >= maxLojaNoEstoque) continue;
        fila.push(o);
        contagem[o.palavra ?? ""] = (contagem[o.palavra ?? ""] || 0) + 1;
        if (o.tipo) porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1;
        if (o.lojaId) porLoja[o.lojaId] = (porLoja[o.lojaId] || 0) + 1;
        vistos.add(o.produtoId);
        if (fila.length >= alvo) break;
      }
    } else {
      falhas++;
      seguidas++;
      erros[r.erro] = (erros[r.erro] || 0) + 1;
      await esperar(Math.min(1e3 * 2 ** (seguidas - 1), 8e3));
    }
  }
  return { estoque: fila, tentativas, acertos, falhas, parou, erros };
}
__name(reabastecer, "reabastecer");
function limparVelhos(estoque, agora, maxHoras = MAX_HORAS_NO_ESTOQUE) {
  return estoque.filter((o) => agora - o.buscadoEm <= maxHoras * 36e5);
}
__name(limparVelhos, "limparVelhos");
function atualizarComLeitura(oferta, cruNovo, agora) {
  const nova = normalizarOferta(cruNovo, agora);
  return { ...oferta, preco: nova.preco, desconto: nova.desconto, precoAntigo: nova.precoAntigo, vendas: nova.vendas, nota: nova.nota, buscadoEm: agora };
}
__name(atualizarComLeitura, "atualizarComLeitura");

// ../automacao/ciclo.mjs
var MIN = 6e4;
var dormir2 = /* @__PURE__ */ __name((ms) => new Promise((r) => setTimeout(r, ms)), "dormir");
var OFERTAS_POR_CICLO = 3;
var deslocada = /* @__PURE__ */ __name((agora) => new Date(agora - 3 * 36e5), "deslocada");
var horaBrasilia = /* @__PURE__ */ __name((agora) => deslocada(agora).getUTCHours(), "horaBrasilia");
var diaBrasilia = /* @__PURE__ */ __name((agora) => deslocada(agora).toISOString().slice(0, 10), "diaBrasilia");
var inicioDoDia = /* @__PURE__ */ __name((dia) => Date.parse(`${dia}T00:00:00-03:00`), "inicioDoDia");
function dentroDaJanela(hora, inicio, fim) {
  return inicio < fim ? hora >= inicio && hora < fim : inicio > fim ? hora >= inicio || hora < fim : false;
}
__name(dentroDaJanela, "dentroDaJanela");
function disparosPorDia(g) {
  const horas = (g.horaFim - g.horaInicio + 24) % 24 || 24;
  return Math.floor(horas * 60 / g.intervaloMin);
}
__name(disparosPorDia, "disparosPorDia");
function postsPorDia(g) {
  const total = disparosPorDia(g);
  const teto = g.cotaDia ?? g.ofertasPorDia;
  return teto != null ? Math.min(total, teto) : total;
}
__name(postsPorDia, "postsPorDia");
var buscasPorDia = /* @__PURE__ */ __name((g) => Math.max(TENTATIVAS_MAX, Math.ceil(postsPorDia(g) / 2)), "buscasPorDia");
function metasDoGrupo(g, { diasMinimos = 3, diasMeta = 4 } = {}) {
  const porDia = postsPorDia(g);
  return { piso: porDia * diasMinimos, meta: porDia * diasMeta };
}
__name(metasDoGrupo, "metasDoGrupo");
var FOLGA = 5e3;
var venceu = /* @__PURE__ */ __name((g, agora) => !g.ultimoPostEm || agora - g.ultimoPostEm >= g.intervaloMin * MIN - FOLGA, "venceu");
var virtual = /* @__PURE__ */ __name((g) => [{ id: null, nome: null, filtros: g.filtros ?? {}, proximaPalavra: g.proximaPalavra ?? 0, virtual: true }], "virtual");
var ofertasCarregar = /* @__PURE__ */ __name((g) => g.ofertas ? g.ofertas.filter((o) => o.ativa !== false) : virtual(g), "ofertasCarregar");
var ofertasPostar = /* @__PURE__ */ __name((g) => g.ofertas ? g.ofertas.filter((o) => o.publica !== false) : virtual(g), "ofertasPostar");
function bloqueios(filtros, recentes) {
  const semTipo = sequenciaAtingida(recentes, "tipo", filtros?.maxMesmoTipo);
  const semLoja = sequenciaAtingida(recentes, "loja", filtros?.maxMesmaLoja);
  return { semTipo, semLoja };
}
__name(bloqueios, "bloqueios");
function sequenciaAtingida(recentes, campo, max) {
  if (!max || !recentes.length || recentes[0][campo] == null) return void 0;
  let n = 0;
  for (const r of recentes) {
    if (r[campo] !== recentes[0][campo]) break;
    n++;
  }
  return n >= max ? recentes[0][campo] : void 0;
}
__name(sequenciaAtingida, "sequenciaAtingida");
var mesma = /* @__PURE__ */ __name((o, id) => (o.ofertaId ?? null) === (id ?? null), "mesma");
async function rodarCiclo({
  agora = Date.now(),
  repo,
  shopee,
  enviar,
  aviso = "",
  diasMinimos = 3,
  diasMeta = 4,
  tentativasPorRodada = 8,
  tentativasMaxDia = null,
  // null: o teto de buscas por dia acompanha o ritmo do grupo (veja buscasPorDia)
  falhasSeguidasMax = 25,
  esperar = dormir2,
  atualizarAntes = true,
  maxPosts = 1,
  // quantos grupos podem postar na mesma volta (o produto com vários clientes usa mais de 1)
  reabastecerTambem = false
  // depois de postar, ainda tenta reabastecer um grupo na mesma volta
}) {
  const hoje = diaBrasilia(agora);
  const hora = horaBrasilia(agora);
  const grupos = (await repo.grupos()).filter((g) => g.estado === "ativo");
  const vencidos = grupos.filter((g) => dentroDaJanela(hora, g.horaInicio, g.horaFim) && venceu(g, agora)).sort((a, b) => (a.ultimoPostEm ?? 0) - (b.ultimoPostEm ?? 0));
  const acoes = [];
  for (const g of vencidos) {
    if (acoes.filter((a) => a.acao === "postou").length >= maxPosts) break;
    const porVez = 1;
    if (g.ofertasPorDia != null) {
      const desde = inicioDoDia(hoje);
      const saiuHoje = g.dono ? await repo.contarPostadosDoDonoDesde(g.dono, desde) : await repo.contarPostadosDesde(g.chatId, desde);
      const resta = g.ofertasPorDia - saiuHoje;
      if (resta <= 0) continue;
    }
    let descartadas = 0;
    let postadas = 0;
    let reservou = false;
    const anterior = g.ultimoPostEm ?? null;
    const ofertas = ofertasPostar(g);
    if (!ofertas.length) continue;
    let vezOferta = ofertas.length > 1 ? (g.proximaOferta ?? 0) % ofertas.length : 0;
    const palavrasDe = ofertas.map((o) => (o.filtros?.palavras ?? []).map(chavePalavra));
    const vezPalavra = ofertas.map((o, i) => palavrasDe[i].length > 1 ? (o.proximaPalavra ?? 0) % palavrasDe[i].length : 0);
    const mudouPalavra = /* @__PURE__ */ new Set();
    const usaVariedade = ofertas.some((o) => o.filtros?.maxMesmoTipo || o.filtros?.maxMesmaLoja);
    const recentes = usaVariedade ? await repo.ultimosPosts(g.chatId, 50) : [];
    let semLimites = false;
    let bloqueouAlgo = false;
    const proxima = /* @__PURE__ */ __name(async () => {
      for (let a = 0; a < ofertas.length; a++) {
        const ix = (vezOferta + a) % ofertas.length;
        const idOferta = ofertas[ix].id ?? void 0;
        const palavras = palavrasDe[ix];
        const limites = usaVariedade && !semLimites ? bloqueios(ofertas[ix].filtros, recentes) : {};
        if (limites.semTipo || limites.semLoja) bloqueouAlgo = true;
        if (palavras.length > 1) {
          for (let k = 0; k < palavras.length; k++) {
            const o2 = await repo.primeiroDoEstoque(g.chatId, palavras[(vezPalavra[ix] + k) % palavras.length], idOferta, limites);
            if (o2) return o2;
          }
        }
        const o = await repo.primeiroDoEstoque(g.chatId, void 0, idOferta, limites);
        if (o) return o;
      }
      return null;
    }, "proxima");
    semLimites = (g.pulosVariedade ?? 0) >= 1;
    for (let i = 0; i < porVez + OFERTAS_POR_CICLO - 1 && postadas < porVez; i++) {
      const guardada = await proxima();
      if (!guardada) {
        if (postadas === 0 && bloqueouAlgo && !semLimites) await repo.atualizarGrupo(g.chatId, { pulosVariedade: (g.pulosVariedade ?? 0) + 1 });
        break;
      }
      let oferta = guardada;
      if (atualizarAntes && (oferta.lojaId || oferta.loja && oferta.loja !== "shopee")) {
        const leitura = await shopee.lerOferta({ itemId: oferta.produtoId, shopId: oferta.lojaId, loja: oferta.loja }, g);
        if (leitura.ok && leitura.oferta === null) {
          await repo.removerDoEstoque(g.chatId, oferta.produtoId);
          descartadas++;
          continue;
        }
        if (leitura.ok) oferta = atualizarComLeitura(oferta, leitura.oferta, agora);
        const daOferta = ofertas.find((o) => mesma(oferta, o.id)) ?? ofertas[0];
        if (!passaNosFiltros(oferta, daOferta.filtros)) {
          await repo.removerDoEstoque(g.chatId, oferta.produtoId);
          descartadas++;
          continue;
        }
      }
      if (!reservou) {
        if (!await repo.reservarPost(g.chatId, agora, anterior)) break;
        reservou = true;
      } else {
        await esperar(1100);
      }
      const r = await enviar(g.chatId, oferta, aviso, g);
      if (r.ok) {
        await repo.removerDoEstoque(g.chatId, oferta.produtoId);
        await repo.registrarPostado(g.chatId, oferta.produtoId, agora, oferta.tipo ?? null, oferta.lojaId ?? null);
        if (usaVariedade) recentes.unshift({ tipo: oferta.tipo ?? null, loja: oferta.lojaId ?? null });
        if ((g.pulosVariedade ?? 0) > 0) {
          g.pulosVariedade = 0;
          await repo.atualizarGrupo(g.chatId, { pulosVariedade: 0 });
        }
        await repo.atualizarGrupo(g.chatId, { falhasSeguidas: 0 });
        postadas++;
        const ix = Math.max(0, ofertas.findIndex((o) => mesma(oferta, o.id)));
        if (palavrasDe[ix].length > 1) {
          const q = palavrasDe[ix].indexOf(oferta.palavra);
          vezPalavra[ix] = ((q >= 0 ? q : vezPalavra[ix]) + 1) % palavrasDe[ix].length;
          mudouPalavra.add(ix);
        }
        if (ofertas.length > 1) vezOferta = (ix + 1) % ofertas.length;
        if (postadas === 1) acoes.push({ acao: "postou", chatId: g.chatId, produtoId: oferta.produtoId, preco: oferta.preco, descartadas, quantidade: 1 });
        else acoes[acoes.length - 1].quantidade = postadas;
      } else {
        if (postadas === 0) {
          await repo.liberarReserva(g.chatId, anterior);
          await repo.atualizarGrupo(g.chatId, { falhasSeguidas: (g.falhasSeguidas || 0) + 1 });
          acoes.push({ acao: "falhou", chatId: g.chatId, erro: r.erro, esperarSegundos: r.esperarSegundos });
        }
        break;
      }
    }
    for (const ix of mudouPalavra) {
      if (ofertas[ix].virtual) await repo.atualizarGrupo(g.chatId, { proximaPalavra: vezPalavra[ix] });
      else await repo.atualizarOferta(ofertas[ix].id, { proximaPalavra: vezPalavra[ix] });
    }
    if (ofertas.length > 1 && postadas > 0) await repo.atualizarGrupo(g.chatId, { proximaOferta: vezOferta });
    if (maxPosts === 1 && !reabastecerTambem && acoes.length) return acoes[0];
  }
  if (acoes.length && !reabastecerTambem) return maxPosts === 1 ? acoes[0] : { ...acoes[0], resultados: acoes };
  const contagens = [];
  for (const g of grupos) contagens.push({ g, n: await repo.contarEstoque(g.chatId) });
  contagens.sort((a, b) => a.n - b.n);
  for (const { g, n } of contagens) {
    if (g.descansaAte && agora < g.descansaAte) continue;
    const { piso, meta } = metasDoGrupo(g, { diasMinimos, diasMeta });
    const precisa = n < piso || n < meta && g.diaTravado !== hoje;
    if (!precisa) continue;
    const usadas = g.diaTentativas === hoje ? g.tentativasHoje || 0 : 0;
    const restantes = (tentativasMaxDia ?? buscasPorDia(g)) - usadas;
    if (restantes <= 0) continue;
    const ofertas = ofertasCarregar(g);
    if (!ofertas.length) continue;
    let lista = limparVelhos(await repo.estoque(g.chatId), agora);
    await repo.esquecerPostadosAntes?.(g.chatId, agora - (g.filtros?.diasSemRepetir ?? 30) * 864e5);
    const postados = await repo.jaPostados(g.chatId);
    const teto = Math.ceil(meta / ofertas.length);
    const orcamento = Math.min(tentativasPorRodada, restantes);
    let gastas = 0;
    let acertos = 0;
    let falhas = 0;
    let parou = "alvo";
    for (const of of ofertas) {
      const idOf = of.id ?? null;
      const dela = lista.filter((o) => mesma(o, idOf));
      if (dela.length >= teto) continue;
      if (gastas >= orcamento) {
        parou = "tentativas";
        break;
      }
      const outras = lista.filter((o) => !mesma(o, idOf));
      const r = await reabastecer({
        alvo: teto,
        filtros: of.filtros,
        estoque: dela,
        jaPostados: /* @__PURE__ */ new Set([...postados, ...outras.map((o) => o.produtoId)]),
        // o mesmo produto não entra em duas ofertas
        buscarLote: /* @__PURE__ */ __name((p) => shopee.buscarLote({ ...p, loja: of.loja }, g), "buscarLote"),
        // cada oferta busca na sua loja
        tentativasMax: orcamento - gastas,
        falhasSeguidasMax,
        esperar,
        agora: /* @__PURE__ */ __name(() => agora, "agora"),
        ofertaId: idOf,
        maxTipoNoEstoque: of.filtros?.maxMesmoTipo ? of.filtros.maxMesmoTipo * 3 : null,
        // estoque sem excesso do mesmo tipo/loja
        maxLojaNoEstoque: of.filtros?.maxMesmaLoja ? of.filtros.maxMesmaLoja * 3 : null
      });
      gastas += r.tentativas;
      acertos += r.acertos;
      falhas += r.falhas;
      lista = [...outras, ...r.estoque];
      if (r.parou === "disjuntor") {
        parou = "disjuntor";
        break;
      }
      if (r.parou === "tentativas") parou = "tentativas";
    }
    const mudancas = { diaTentativas: hoje, tentativasHoje: usadas + gastas };
    if (lista.length >= meta) mudancas.diaTravado = hoje;
    if (parou === "disjuntor") mudancas.descansaAte = agora + 10 * MIN;
    await repo.salvarEstoque(g.chatId, lista);
    await repo.atualizarGrupo(g.chatId, mudancas);
    const reab = { acao: "reabasteceu", chatId: g.chatId, guardadas: lista.length, piso, meta, tentativas: gastas, acertos, falhas, parou };
    return acoes.length ? { ...acoes[0], resultados: [...acoes, reab] } : reab;
  }
  return acoes.length ? { ...acoes[0], resultados: acoes } : { acao: "nada" };
}
__name(rodarCiclo, "rodarCiclo");

// src/dados.js
function criarDados(db) {
  return {
    async entrarOuCriar({ id, nome = null, email = null }, agora = Date.now()) {
      await db.prepare("INSERT OR IGNORE INTO usuarios (id, nome, email, criado_em) VALUES (?, ?, ?, ?)").bind(id, nome, email, agora).run();
      return db.prepare("SELECT * FROM usuarios WHERE id = ?").bind(id).first();
    },
    async definirAdministrador(id, ligado) {
      const r = await db.prepare("UPDATE usuarios SET administrador = ? WHERE id = ?").bind(ligado ? 1 : 0, id).run();
      return (r.meta?.changes ?? 0) === 1;
    },
    async ehAdministrador(id) {
      const u = await db.prepare("SELECT administrador FROM usuarios WHERE id = ?").bind(id).first();
      return u?.administrador === 1;
    },
    async definirNome(id, nome) {
      await db.prepare("UPDATE usuarios SET nome = ? WHERE id = ?").bind(nome, id).run();
    },
    // Define o plano assinado e até quando vale (padrão: muito tempo, para testes; a compra pela Apple vai passar a data real).
    async definirPlano(id, plano, ate = Date.UTC(2100, 0, 1)) {
      const r = await db.prepare("UPDATE usuarios SET plano = ?, assinatura_ate = ? WHERE id = ?").bind(plano, ate, id).run();
      return (r.meta?.changes ?? 0) === 1;
    },
    // Grava a assinatura conferida com a Apple. Se outra pessoa já usava esse mesmo número, ela perde o plano (vale quem reivindicou por último).
    async gravarAssinaturaApple({ dono, original, plano, ate, agora }) {
      await db.batch([
        db.prepare("UPDATE usuarios SET apple_transacao = NULL, assinatura_ate = NULL WHERE apple_transacao = ? AND id != ?").bind(original, dono),
        db.prepare("UPDATE usuarios SET plano = ?, assinatura_ate = ?, apple_transacao = ?, apple_checado_em = ? WHERE id = ?").bind(plano, ate, original, agora, dono)
      ]);
    },
    async assinaturasParaRenovar(agora, max = 20) {
      const { results } = await db.prepare("SELECT id, apple_transacao FROM usuarios WHERE apple_transacao IS NOT NULL AND assinatura_ate < ? AND assinatura_ate > ? AND (apple_checado_em IS NULL OR apple_checado_em < ?) ORDER BY apple_checado_em LIMIT ?").bind(agora + 12 * 36e5, agora - 7 * 864e5, agora - 30 * 6e4, max).all();
      return results;
    },
    async marcarChecagem(id, agora) {
      await db.prepare("UPDATE usuarios SET apple_checado_em = ? WHERE id = ?").bind(agora, id).run();
    },
    // O teste de 2 dias começa uma vez só (quando a pessoa vincula a API da loja).
    async iniciarTeste(id, agora) {
      await db.prepare("UPDATE usuarios SET teste_inicio = ? WHERE id = ? AND teste_inicio IS NULL").bind(agora, id).run();
    },
    async planosDosDonos() {
      const { results } = await db.prepare("SELECT id, administrador, plano, assinatura_ate, teste_inicio FROM usuarios").all();
      return new Map(results.map((r) => [r.id, r]));
    },
    async administradores() {
      const { results } = await db.prepare("SELECT id FROM usuarios WHERE administrador = 1").all();
      return results.map((r) => r.id);
    },
    // APIs de lojas (uma por tipo e por pessoa; ligar de novo troca a anterior).
    async apisDoDono(dono) {
      const { results } = await db.prepare("SELECT id, tipo, final, criado_em FROM apis WHERE dono = ? ORDER BY criado_em").bind(dono).all();
      return results;
    },
    async salvarApi({ id, dono, tipo, final, dadosCifrados }, agora = Date.now()) {
      await db.batch([
        db.prepare("DELETE FROM apis WHERE dono = ? AND tipo = ?").bind(dono, tipo),
        db.prepare("INSERT INTO apis (id, dono, tipo, final, dados_cifrados, criado_em) VALUES (?, ?, ?, ?, ?, ?)").bind(id, dono, tipo, final, dadosCifrados, agora)
      ]);
    },
    async removerApi(dono, id) {
      const r = await db.prepare("DELETE FROM apis WHERE dono = ? AND id = ?").bind(dono, id).run();
      return (r.meta?.changes ?? 0) === 1;
    },
    apiCompleta: /* @__PURE__ */ __name((dono, tipo) => db.prepare("SELECT dados_cifrados FROM apis WHERE dono = ? AND tipo = ?").bind(dono, tipo).first(), "apiCompleta"),
    // Quem tem API de qual loja: Map de dono para o conjunto de lojas vinculadas.
    async lojasPorDono() {
      const { results } = await db.prepare("SELECT dono, tipo FROM apis").all();
      const mapa = /* @__PURE__ */ new Map();
      for (const r of results) (mapa.get(r.dono) ?? mapa.set(r.dono, /* @__PURE__ */ new Set()).get(r.dono)).add(r.tipo);
      return mapa;
    },
    async donosComApi(tipo) {
      const { results } = await db.prepare("SELECT DISTINCT dono FROM apis WHERE tipo = ?").bind(tipo).all();
      return results.map((r) => r.dono);
    },
    usuario: /* @__PURE__ */ __name((id) => db.prepare("SELECT * FROM usuarios WHERE id = ?").bind(id).first(), "usuario"),
    // Histórico de anúncios (versão do colega): cada oferta que o bot publicou. A tabela se cria sozinha (não precisa de migração).
    async garantirHistorico() {
      await db.prepare("CREATE TABLE IF NOT EXISTS historico (id INTEGER PRIMARY KEY AUTOINCREMENT, dono TEXT NOT NULL, chat_id TEXT NOT NULL, titulo TEXT NOT NULL, preco REAL, link TEXT, imagem TEXT, loja TEXT, em INTEGER NOT NULL)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS historico_dono ON historico (dono, id)").run();
    },
    async registrarAnuncio({ dono, chatId, titulo, preco, link, imagem, loja, em }) {
      await this.garantirHistorico();
      await db.prepare("INSERT INTO historico (dono, chat_id, titulo, preco, link, imagem, loja, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(dono, String(chatId), String(titulo).slice(0, 300), preco ?? null, link ?? null, imagem ?? null, loja ?? null, em).run();
      await db.prepare("DELETE FROM historico WHERE dono = ? AND id <= (SELECT id FROM historico WHERE dono = ? ORDER BY id DESC LIMIT 1 OFFSET 1000)").bind(dono, dono).run();
    },
    async anuncios(dono, { chatId = null, antes = null, limite = 30 } = {}) {
      await this.garantirHistorico();
      const q = ["dono = ?"];
      const v = [dono];
      if (chatId) q.push("chat_id = ?"), v.push(String(chatId));
      if (antes) q.push("id < ?"), v.push(Number(antes));
      const { results } = await db.prepare(`SELECT id, chat_id, titulo, preco, link, imagem, loja, em FROM historico WHERE ${q.join(" AND ")} ORDER BY id DESC LIMIT ?`).bind(...v, Math.min(Math.max(Number(limite) || 30, 1), 100)).all();
      return results;
    },
    async criarBotPendente({ id, dono, nome, username }, agora = Date.now()) {
      await db.prepare("INSERT INTO bots (id, dono, nome, username, estado, criado_em) VALUES (?, ?, ?, ?, 'aguardando', ?)").bind(id, dono, nome, username.toLowerCase(), agora).run();
    },
    botPorUsername: /* @__PURE__ */ __name((u) => db.prepare("SELECT * FROM bots WHERE username = ?").bind(String(u).toLowerCase()).first(), "botPorUsername"),
    // Passa um bot (e os grupos dele) para a pessoa atual, voltando ao estado "aguardando" até ser religado.
    async reassumirBot(id, dono, nome) {
      await db.batch([
        db.prepare("UPDATE bots SET dono = ?, nome = ?, estado = 'aguardando' WHERE id = ?").bind(dono, nome, id),
        db.prepare("UPDATE grupos SET dono = ? WHERE bot_id = ?").bind(dono, id)
      ]);
    },
    botPorTgId: /* @__PURE__ */ __name((tgId) => db.prepare("SELECT * FROM bots WHERE tg_id = ?").bind(tgId).first(), "botPorTgId"),
    async apagarBotRemovido(id) {
      await db.prepare("DELETE FROM bots WHERE id = ? AND estado = 'removido'").bind(id).run();
    },
    botPorId: /* @__PURE__ */ __name((id) => db.prepare("SELECT * FROM bots WHERE id = ?").bind(id).first(), "botPorId"),
    // Servidor pessoal: o bot que a pessoa criou com OUTRO @usuário (editou na tela do Telegram) é ligado ao pedido mais recente que ainda espera.
    botAguardandoMaisRecente: /* @__PURE__ */ __name(() => db.prepare("SELECT * FROM bots WHERE estado = 'aguardando' ORDER BY criado_em DESC LIMIT 1").first(), "botAguardandoMaisRecente"),
    async trocarUsername(id, username) {
      await db.prepare("UPDATE bots SET username = ? WHERE id = ?").bind(String(username).toLowerCase(), id).run();
    },
    botDoDono: /* @__PURE__ */ __name((dono, id) => db.prepare("SELECT * FROM bots WHERE id = ? AND dono = ?").bind(id, dono).first(), "botDoDono"),
    async botsDoDono(dono) {
      const { results } = await db.prepare("SELECT * FROM bots WHERE dono = ? AND estado != 'removido' ORDER BY criado_em").bind(dono).all();
      return results;
    },
    async botsProntos() {
      const { results } = await db.prepare("SELECT id, token_cifrado FROM bots WHERE estado = 'pronto'").all();
      return results;
    },
    async marcarPronto(id, { tgId, tokenCifrado }, agora = Date.now()) {
      await db.prepare("UPDATE bots SET estado = 'pronto', tg_id = ?, token_cifrado = ?, pronto_em = ? WHERE id = ?").bind(tgId, tokenCifrado, agora, id).run();
    },
    async marcarRemovido(id) {
      await db.prepare("UPDATE bots SET estado = 'removido', token_cifrado = NULL WHERE id = ?").bind(id).run();
    },
    async apagarPendente(id) {
      await db.prepare("DELETE FROM bots WHERE id = ? AND estado = 'aguardando'").bind(id).run();
    },
    async apagarUsuario(id) {
      await db.batch([db.prepare("DELETE FROM usuarios WHERE id = ?").bind(id), db.prepare("DELETE FROM bots WHERE dono = ?").bind(id), db.prepare("DELETE FROM apis WHERE dono = ?").bind(id)]);
    }
  };
}
__name(criarDados, "criarDados");

// src/cifra.js
var enc = new TextEncoder();
var dec = new TextDecoder();
function paraB64u(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(paraB64u, "paraB64u");
function deB64u(texto3) {
  const s = texto3.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
__name(deB64u, "deB64u");
async function chaveAes(chaveB64) {
  const bruta = Uint8Array.from(atob(chaveB64), (c) => c.charCodeAt(0));
  if (bruta.length !== 32) throw new Error("CHAVE_CIFRA precisa ter 32 bytes (em base64)");
  return crypto.subtle.importKey("raw", bruta, "AES-GCM", false, ["encrypt", "decrypt"]);
}
__name(chaveAes, "chaveAes");
async function cifrar(texto3, chaveB64) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveAes(chaveB64), enc.encode(texto3));
  return `v1.${paraB64u(iv)}.${paraB64u(ct)}`;
}
__name(cifrar, "cifrar");
async function decifrar(cifrado, chaveB64) {
  const [v, iv, ct] = String(cifrado).split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("formato de segredo cifrado desconhecido");
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64u(iv) }, await chaveAes(chaveB64), deB64u(ct));
  return dec.decode(claro);
}
__name(decifrar, "decifrar");
async function chaveHmac(segredo, usos) {
  return crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, usos);
}
__name(chaveHmac, "chaveHmac");
async function hmacHex(segredo, mensagem) {
  const sig = await crypto.subtle.sign("HMAC", await chaveHmac(segredo, ["sign"]), enc.encode(mensagem));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
async function assinarSessao(dados, segredo, { validadeMs = 90 * 864e5, agora = Date.now() } = {}) {
  const corpo = paraB64u(enc.encode(JSON.stringify({ ...dados, exp: agora + validadeMs })));
  const sig = await crypto.subtle.sign("HMAC", await chaveHmac(segredo, ["sign"]), enc.encode(corpo));
  return `${corpo}.${paraB64u(sig)}`;
}
__name(assinarSessao, "assinarSessao");
async function verificarSessao(token, segredo, { agora = Date.now() } = {}) {
  try {
    const [corpo, sig] = String(token).split(".");
    if (!corpo || !sig) return null;
    const ok = await crypto.subtle.verify("HMAC", await chaveHmac(segredo, ["verify"]), deB64u(sig), enc.encode(corpo));
    if (!ok) return null;
    const dados = JSON.parse(dec.decode(deB64u(corpo)));
    return dados.exp > agora ? dados : null;
  } catch {
    return null;
  }
}
__name(verificarSessao, "verificarSessao");

// src/apple.js
var JWKS_URL = "https://appleid.apple.com/auth/keys";
var cache = { chaves: null, ate: 0 };
async function chavesDaApple(buscar, agora) {
  if (cache.chaves && agora < cache.ate) return cache.chaves;
  const r = await buscar(JWKS_URL);
  const j = await r.json();
  cache = { chaves: j.keys || [], ate: agora + 36e5 };
  return cache.chaves;
}
__name(chavesDaApple, "chavesDaApple");
async function verificarIdentidadeApple(token, { audiencia, buscar = fetch, agora = Date.now() } = {}) {
  try {
    const [h, p, s] = String(token).split(".");
    if (!h || !p || !s) return { ok: false, erro: "token malformado" };
    const cab = JSON.parse(new TextDecoder().decode(deB64u(h)));
    if (cab.alg !== "RS256") return { ok: false, erro: "algoritmo inesperado" };
    const jwk = (await chavesDaApple(buscar, agora)).find((k) => k.kid === cab.kid);
    if (!jwk) return { ok: false, erro: "chave da Apple n\xE3o encontrada" };
    const chave = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, deB64u(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return { ok: false, erro: "assinatura inv\xE1lida" };
    const d = JSON.parse(new TextDecoder().decode(deB64u(p)));
    if (d.iss !== "https://appleid.apple.com") return { ok: false, erro: "emissor inesperado" };
    if (!audiencia || d.aud !== audiencia) return { ok: false, erro: "destinat\xE1rio inesperado" };
    if (!(d.exp * 1e3 > agora)) return { ok: false, erro: "token vencido" };
    if (!d.sub) return { ok: false, erro: "token sem identificador" };
    return { ok: true, sub: String(d.sub), email: d.email ?? null };
  } catch {
    return { ok: false, erro: "n\xE3o consegui conferir o token" };
  }
}
__name(verificarIdentidadeApple, "verificarIdentidadeApple");

// src/telegram.js
async function tgChamar(buscar, token, metodo, corpo = {}) {
  const r = await buscar(`https://api.telegram.org/bot${token}/${metodo}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  return r.json().catch(() => ({ ok: false, description: "resposta inv\xE1lida" }));
}
__name(tgChamar, "tgChamar");
function usernameSugerido(nome, aleatorio = Math.random().toString(36).slice(2, 7)) {
  const base = String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "ofertas";
  return `${base}${String(aleatorio).replace(/[^a-z0-9]/g, "").slice(0, 5)}bot`;
}
__name(usernameSugerido, "usernameSugerido");
var linkCriarBot = /* @__PURE__ */ __name((gerente, username, nome) => `https://t.me/newbot/${gerente}/${username}?name=${encodeURIComponent(nome).replace(/%20/g, "+")}`, "linkCriarBot");
var linkAdicionarAoGrupo = /* @__PURE__ */ __name((username) => `https://t.me/${username}?startgroup=pronto`, "linkAdicionarAoGrupo");

// src/assinatura.js
var PRODUCAO = "https://api.storekit.apple.com";
var SANDBOX = "https://api.storekit-sandbox.apple.com";
var PRODUTOS = {
  entrada_mensal: { plano: "entrada", periodo: "mensal" },
  entrada_anual: { plano: "entrada", periodo: "anual" },
  medio_mensal: { plano: "medio", periodo: "mensal" },
  medio_anual: { plano: "medio", periodo: "anual" },
  premium_mensal: { plano: "premium", periodo: "mensal" },
  premium_anual: { plano: "premium", periodo: "anual" }
};
var produtosDoPlano = /* @__PURE__ */ __name((plano) => ({ mensal: `${plano}_mensal`, anual: `${plano}_anual` }), "produtosDoPlano");
var COM_ACESSO = /* @__PURE__ */ new Set([1, 4]);
function pemParaDer(pemOuB64) {
  const texto3 = pemOuB64.includes("BEGIN") ? pemOuB64 : new TextDecoder().decode(deB64(pemOuB64));
  const corpo = texto3.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  return deB64(corpo);
}
__name(pemParaDer, "pemParaDer");
function deB64(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
__name(deB64, "deB64");
async function gerarToken({ issuerId, keyId, chavePrivada, bundleId, agoraMs = Date.now() }) {
  const iat = Math.floor(agoraMs / 1e3);
  const cab = paraB64u(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })));
  const corpo = paraB64u(new TextEncoder().encode(JSON.stringify({ iss: issuerId, iat, exp: iat + 1800, aud: "appstoreconnect-v1", bid: bundleId })));
  const chave = await crypto.subtle.importKey("pkcs8", pemParaDer(chavePrivada), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(`${cab}.${corpo}`)));
  return `${cab}.${corpo}.${paraB64u(assinatura)}`;
}
__name(gerarToken, "gerarToken");
function lerCorpoDoJws(jws) {
  try {
    return JSON.parse(new TextDecoder().decode(deB64u(String(jws).split(".")[1])));
  } catch {
    return null;
  }
}
__name(lerCorpoDoJws, "lerCorpoDoJws");
function criarClienteApple({ issuerId, keyId, chavePrivada, bundleId, buscar = fetch, agoraMs = /* @__PURE__ */ __name(() => Date.now(), "agoraMs"), limiteMs = 2e4 }) {
  if (!issuerId || !keyId || !chavePrivada || !bundleId) throw new Error("faltam as chaves da Apple");
  async function perguntar(base, transacaoId) {
    const token = await gerarToken({ issuerId, keyId, chavePrivada, bundleId, agoraMs: agoraMs() });
    const r = await buscar(`${base}/inApps/v1/subscriptions/${encodeURIComponent(transacaoId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(limiteMs) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }
  __name(perguntar, "perguntar");
  return {
    // Devolve { ok, ... } com o que vale da assinatura, ou { ok:false, erro, motivo }.
    async estado(transacaoId) {
      try {
        let ambiente = "producao";
        let r = await perguntar(PRODUCAO, transacaoId);
        if (r.status === 404) {
          ambiente = "sandbox";
          r = await perguntar(SANDBOX, transacaoId);
        }
        if (r.status === 401) return { ok: false, motivo: "chave", erro: "A Apple n\xE3o aceitou a chave do servidor." };
        if (r.status === 404) return { ok: false, motivo: "nao_achou", erro: "A Apple n\xE3o achou essa compra." };
        if (r.status === 429) return { ok: false, motivo: "limite", erro: "A Apple pediu para esperar. Tente de novo em instantes." };
        if (r.status !== 200 || !r.json) return { ok: false, motivo: "apple", erro: `A Apple n\xE3o respondeu como esperado (HTTP ${r.status}).` };
        if (r.json.bundleId && r.json.bundleId !== bundleId) return { ok: false, motivo: "outro_app", erro: "Essa compra \xE9 de outro aplicativo." };
        const ultimas = (r.json.data ?? []).flatMap((g) => g.lastTransactions ?? []);
        const candidatas = ultimas.map((t2) => ({ status: Number(t2.status), original: String(t2.originalTransactionId), info: lerCorpoDoJws(t2.signedTransactionInfo) })).filter((t2) => t2.info && PRODUTOS[t2.info.productId] && (!t2.info.bundleId || t2.info.bundleId === bundleId));
        if (!candidatas.length) return { ok: false, motivo: "produto", erro: "Essa compra n\xE3o \xE9 de um dos nossos planos." };
        candidatas.sort((a, b) => Number(b.info.expiresDate) - Number(a.info.expiresDate));
        const t = candidatas[0];
        const { plano, periodo } = PRODUTOS[t.info.productId];
        return {
          ok: true,
          ambiente,
          original: t.original,
          produto: t.info.productId,
          plano,
          periodo,
          expiraEm: Number(t.info.expiresDate) || 0,
          statusApple: t.status,
          revogada: Boolean(t.info.revocationDate),
          comAcesso: COM_ACESSO.has(t.status) && !t.info.revocationDate
        };
      } catch (e) {
        return { ok: false, motivo: "rede", erro: `N\xE3o consegui falar com a Apple (${e.name}).` };
      }
    }
  };
}
__name(criarClienteApple, "criarClienteApple");
function validadeParaGravar(estado, agora) {
  if (!estado.comAcesso) return Math.min(estado.expiraEm || agora, agora);
  return estado.statusApple === 4 ? Math.max(estado.expiraEm, agora + 864e5) : estado.expiraEm;
}
__name(validadeParaGravar, "validadeParaGravar");
function clienteAppleDoAmbiente(env, buscar = fetch) {
  if (!env.APPLE_ISSUER_ID || !env.APPLE_KEY_ID || !env.APPLE_CHAVE_PRIVADA || !env.APPLE_BUNDLE_ID) return null;
  return criarClienteApple({ issuerId: env.APPLE_ISSUER_ID, keyId: env.APPLE_KEY_ID, chavePrivada: env.APPLE_CHAVE_PRIVADA, bundleId: env.APPLE_BUNDLE_ID, buscar });
}
__name(clienteAppleDoAmbiente, "clienteAppleDoAmbiente");
async function renovarAssinaturas({ env, dados, buscar = fetch, agora = Date.now() }) {
  const apple = clienteAppleDoAmbiente(env, buscar);
  if (!apple) return { conferidas: 0 };
  const lista = await dados.assinaturasParaRenovar(agora, 20);
  let conferidas = 0;
  for (const u of lista) {
    await dados.marcarChecagem(u.id, agora);
    const e = await apple.estado(u.apple_transacao);
    conferidas++;
    if (e.ok) await dados.gravarAssinaturaApple({ dono: u.id, original: e.original, plano: e.plano, ate: validadeParaGravar(e, agora), agora });
  }
  return { conferidas };
}
__name(renovarAssinaturas, "renovarAssinaturas");

// src/planos.js
var TESTE_DIAS = 2;
var PLANOS = {
  entrada: { nome: "Entrada", preco: { mensal: 20, anual: 200 }, grupos: 5, bots: 3, ofertasPorGrupo: 10, ofertasPorDia: 100, intervalo: { min: 60, max: 1440 } },
  medio: { nome: "M\xE9dio", preco: { mensal: 40, anual: 400 }, grupos: 10, bots: 10, ofertasPorGrupo: 30, ofertasPorDia: 1e3, intervalo: { min: 30, max: 1440 } },
  premium: { nome: "Premium", preco: { mensal: 90, anual: 900 }, grupos: 20, bots: 20, ofertasPorGrupo: 30, ofertasPorDia: 5e3, intervalo: { min: 1, max: 1440 } },
  // Perfil administrador (o dono e quem ele indicar): sem limites de plano e sem teste. O que é do Telegram e da Shopee vale para todos.
  administrador: { nome: "Administrador", grupos: 1e3, bots: 1e3, ofertasPorGrupo: 50, ofertasPorDia: null, intervalo: { min: 1, max: 1440 } }
};
function acessoDe(u, agora = Date.now()) {
  if (u?.administrador === 1) return { estado: "administrador", plano: "administrador", testeFim: null };
  const plano = u?.plano === "pago" ? "entrada" : u?.plano;
  if (PLANOS[plano] && plano !== "administrador" && Number(u?.assinatura_ate) > agora) return { estado: "assinante", plano, testeFim: null, assinaturaFim: Number(u.assinatura_ate) };
  if (u?.teste_inicio == null) return { estado: "novo", plano: "entrada", testeFim: null };
  const fim = Number(u.teste_inicio) + TESTE_DIAS * 864e5;
  return { estado: agora < fim ? "teste" : "expirado", plano: "entrada", testeFim: fim };
}
__name(acessoDe, "acessoDe");
function limitesDoPlano(env, plano) {
  const p = PLANOS[plano] ?? PLANOS.entrada;
  const admin = plano === "administrador";
  const num = /* @__PURE__ */ __name((v, padrao) => Number(v) >= 1 ? Number(v) : padrao, "num");
  return {
    grupos: admin ? p.grupos : num(env?.LIMITE_GRUPOS, p.grupos),
    bots: admin ? p.bots : num(env?.LIMITE_BOTS, p.bots),
    ofertasPorGrupo: p.ofertasPorGrupo,
    ofertasPorDia: admin ? p.ofertasPorDia : num(env?.LIMITE_OFERTAS_DIA, p.ofertasPorDia),
    // (variável só para teste)
    intervaloMinimo: admin ? p.intervalo.min : num(env?.INTERVALO_MINIMO, p.intervalo.min),
    intervaloMaximo: p.intervalo.max
  };
}
__name(limitesDoPlano, "limitesDoPlano");
var planosAVenda = /* @__PURE__ */ __name(() => ["entrada", "medio", "premium"].map((chave) => ({ chave, nome: PLANOS[chave].nome, produtos: produtosDoPlano(chave), ...PLANOS[chave].preco && { mensal: PLANOS[chave].preco.mensal, anual: PLANOS[chave].preco.anual }, grupos: PLANOS[chave].grupos, bots: PLANOS[chave].bots, ofertasPorGrupo: PLANOS[chave].ofertasPorGrupo, ofertasPorDia: PLANOS[chave].ofertasPorDia, intervaloMinimo: PLANOS[chave].intervalo.min })), "planosAVenda");

// src/bots.js
var segredoDoGerente = /* @__PURE__ */ __name((env) => hmacHex(env.SEGREDO_WEBHOOK, "gerente"), "segredoDoGerente");
var segredoDoBot = /* @__PURE__ */ __name((env, botId) => hmacHex(env.SEGREDO_WEBHOOK, `bot:${botId}`), "segredoDoBot");
async function tokenDoBot(env, linha) {
  return linha?.token_cifrado ? decifrar(linha.token_cifrado, env.CHAVE_CIFRA) : null;
}
__name(tokenDoBot, "tokenDoBot");
async function tratarGerente(update, ctx) {
  const { env, dados, buscar } = ctx;
  if (update.my_chat_member || update.message?.migrate_to_chat_id) {
    const eu = await dados.botPorUsername(env.GERENTE_USERNAME ?? "");
    return eu && eu.estado === "pronto" ? tratarBot(eu.id, update, ctx) : { acao: "ignorado" };
  }
  const evento = update.managed_bot ?? update.message?.managed_bot_created;
  const novo = evento?.bot;
  if (!novo?.id || !novo.username) return { acao: "ignorado" };
  let linha = await dados.botPorUsername(novo.username);
  if (!linha && env.SEM_PLANOS === "1") {
    const pendente = await dados.botAguardandoMaisRecente();
    if (pendente) {
      await dados.trocarUsername(pendente.id, novo.username);
      linha = { ...pendente, username: novo.username.toLowerCase() };
    }
  }
  if (!linha) return { acao: "orfao", username: novo.username };
  if (linha.estado === "pronto") return { acao: "repetido" };
  const tk = await tgChamar(buscar, env.GERENTE_TOKEN, "getManagedBotToken", { user_id: novo.id });
  if (!tk.ok) return { acao: "sem-token", erro: tk.description };
  await dados.marcarPronto(linha.id, { tgId: novo.id, tokenCifrado: await cifrar(tk.result, env.CHAVE_CIFRA) });
  const wh = await tgChamar(buscar, tk.result, "setWebhook", {
    url: `${env.URL_PUBLICA}/telegram/bot/${linha.id}`,
    secret_token: await segredoDoBot(env, linha.id),
    allowed_updates: ["my_chat_member", "message"]
  });
  return { acao: "pronto", botId: linha.id, webhook: wh.ok };
}
__name(tratarGerente, "tratarGerente");
var TIPOS_DE_GRUPO = /* @__PURE__ */ new Set(["group", "supergroup", "channel"]);
async function tratarBot(botId, update, { env, dados, repo, buscar }) {
  const bot = await dados.botPorId(botId);
  if (!bot || bot.estado !== "pronto") return { acao: "ignorado" };
  const migrou = update.message?.migrate_to_chat_id;
  if (migrou) {
    await repo.migrarChat(update.message.chat.id, migrou);
    return { acao: "migrou" };
  }
  const m = update.my_chat_member;
  if (!m || !TIPOS_DE_GRUPO.has(m.chat?.type)) return { acao: "ignorado" };
  const chatId = String(m.chat.id);
  const status = m.new_chat_member?.status;
  if (status === "member" || status === "administrator") {
    const existente = (await repo.grupos()).find((g) => g.chatId === chatId);
    if (existente && existente.dono !== bot.dono) {
      await tgChamar(buscar, await tokenDoBot(env, bot), "leaveChat", { chat_id: chatId });
      return { acao: "recusado", motivo: "grupo ja usado por outra pessoa" };
    }
    if (!existente) {
      const acesso = acessoDe(await dados.usuario(bot.dono) ?? {}, Date.now());
      const limite = acesso.estado === "expirado" ? 0 : limitesDoPlano(env, acesso.plano).grupos;
      if ((await repo.gruposDoDono(bot.dono)).length >= limite) {
        const token = await tokenDoBot(env, bot);
        await tgChamar(buscar, token, "sendMessage", { chat_id: chatId, text: `Limite de ${limite} grupos neste plano. Remova um grupo no aplicativo para adicionar este.` });
        await tgChamar(buscar, token, "leaveChat", { chat_id: chatId });
        return { acao: "recusado", motivo: "limite de grupos" };
      }
      await repo.criarGrupo({ chatId, titulo: m.chat.title ?? "Grupo", dono: bot.dono, botId: bot.id });
      return { acao: "grupo-novo", chatId };
    }
    if (m.chat.title) await repo.atualizarGrupo(chatId, { titulo: m.chat.title });
    return { acao: "grupo-conhecido", chatId };
  }
  if (status === "left" || status === "kicked") {
    const existente = (await repo.grupos()).find((g) => g.chatId === chatId && g.botId === bot.id);
    if (existente) await repo.atualizarGrupo(chatId, { estado: "pausado" });
    return { acao: "saiu", chatId };
  }
  return { acao: "ignorado" };
}
__name(tratarBot, "tratarBot");

// ../worker-v2/src/validacao.js
var INTERVALO_MINIMO = 60;
var texto = /* @__PURE__ */ __name((v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max, "texto");
var listaDeTextos = /* @__PURE__ */ __name((v, maxItens, maxTam) => Array.isArray(v) && v.length <= maxItens && v.every((x) => texto(x, maxTam)), "listaDeTextos");
var numero = /* @__PURE__ */ __name((v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max, "numero");
function chatIdValido(id) {
  return /^-?\d{5,20}$/.test(String(id));
}
__name(chatIdValido, "chatIdValido");
function validarFiltros(f) {
  const erros = [];
  const saida = {};
  if (f == null) return { ok: true, valor: {} };
  if (typeof f !== "object" || Array.isArray(f)) return { ok: false, erros: ["filtros precisa ser um objeto"] };
  if ("palavras" in f) listaDeTextos(f.palavras, 10, 60) ? saida.palavras = f.palavras.map((x) => x.trim()) : erros.push("palavras: at\xE9 10 textos de at\xE9 60 letras");
  if ("proibidas" in f) listaDeTextos(f.proibidas, 20, 60) ? saida.proibidas = f.proibidas.map((x) => x.trim()) : erros.push("proibidas: at\xE9 20 textos de at\xE9 60 letras");
  for (const k of ["precoMin", "precoMax", "descontoMin", "notaMin", "vendasMin"]) {
    if (k in f) numero(f[k], 0, 1e9) ? saida[k] = f[k] : erros.push(`${k}: n\xFAmero maior ou igual a zero`);
  }
  if ("notaMin" in saida && saida.notaMin > 5) erros.push("notaMin: no m\xE1ximo 5");
  if ("descontoMin" in saida && saida.descontoMin > 100) erros.push("descontoMin: no m\xE1ximo 100");
  if ("precoMin" in saida && "precoMax" in saida && saida.precoMin > saida.precoMax) erros.push("precoMin n\xE3o pode ser maior que precoMax");
  for (const k of ["maxMesmoTipo", "maxMesmaLoja"]) {
    if (k in f) Number.isInteger(f[k]) && f[k] >= 1 && f[k] <= 50 ? saida[k] = f[k] : erros.push(`${k}: inteiro de 1 a 50`);
  }
  if ("linkGrupo" in f) {
    if (typeof f.linkGrupo === "string" && f.linkGrupo.trim() === "") {
    } else if (typeof f.linkGrupo === "string" && /^https?:\/\/[^\s<>"]{4,200}$/.test(f.linkGrupo.trim())) saida.linkGrupo = f.linkGrupo.trim();
    else erros.push("linkGrupo: endere\xE7o come\xE7ando com http (ex.: https://t.me/seugrupo)");
  }
  if ("diasSemRepetir" in f) numero(f.diasSemRepetir, 1, 365) ? saida.diasSemRepetir = Math.round(f.diasSemRepetir) : erros.push("diasSemRepetir: de 1 a 365");
  return erros.length ? { ok: false, erros } : { ok: true, valor: saida };
}
__name(validarFiltros, "validarFiltros");
function validarGrupo(entrada, { intervaloMinimo = INTERVALO_MINIMO, intervaloMaximo = 1440 } = {}) {
  const erros = [];
  const valor = {};
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return { ok: false, erros: ["corpo precisa ser um objeto JSON"] };
  if ("titulo" in entrada) texto(entrada.titulo, 100) ? valor.titulo = entrada.titulo.trim() : erros.push("titulo: texto de at\xE9 100 letras");
  if ("horaInicio" in entrada) Number.isInteger(entrada.horaInicio) && entrada.horaInicio >= 0 && entrada.horaInicio <= 23 ? valor.horaInicio = entrada.horaInicio : erros.push("horaInicio: inteiro de 0 a 23");
  if ("horaFim" in entrada) Number.isInteger(entrada.horaFim) && entrada.horaFim >= 0 && entrada.horaFim <= 24 ? valor.horaFim = entrada.horaFim : erros.push("horaFim: inteiro de 0 a 24");
  if ("horaInicio" in entrada && "horaFim" in entrada && entrada.horaInicio === entrada.horaFim) erros.push("horaInicio e horaFim: n\xE3o podem ser iguais");
  if ("intervaloMin" in entrada) {
    if (Number.isInteger(entrada.intervaloMin) && entrada.intervaloMin >= intervaloMinimo && entrada.intervaloMin <= intervaloMaximo) valor.intervaloMin = entrada.intervaloMin;
    else erros.push(intervaloMaximo < 1440 ? `intervaloMin: de ${intervaloMinimo} a ${intervaloMaximo} minutos (de ${intervaloMinimo / 60} a ${intervaloMaximo / 60} horas entre as postagens neste plano)` : `intervaloMin: inteiro de ${intervaloMinimo} a ${intervaloMaximo} (no m\xE1ximo 1 post a cada ${intervaloMinimo} min por grupo)`);
  }
  if ("filtros" in entrada) {
    const f = validarFiltros(entrada.filtros);
    if (f.ok) valor.filtros = f.valor;
    else erros.push(...f.erros);
  }
  return erros.length ? { ok: false, erros } : { ok: true, valor };
}
__name(validarGrupo, "validarGrupo");
function validarOferta(entrada, { criando = false } = {}) {
  const erros = [];
  const valor = {};
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return { ok: false, erros: ["corpo precisa ser um objeto JSON"] };
  if ("nome" in entrada || criando) texto(entrada.nome, 40) ? valor.nome = entrada.nome.trim() : erros.push("nome: texto de at\xE9 40 letras");
  if ("loja" in entrada) ["shopee", "aliexpress", "amazon"].includes(entrada.loja) ? valor.loja = entrada.loja : erros.push("loja: shopee, aliexpress ou amazon");
  if ("ativa" in entrada) typeof entrada.ativa === "boolean" ? valor.ativa = entrada.ativa : erros.push("ativa: verdadeiro ou falso");
  if ("publica" in entrada) typeof entrada.publica === "boolean" ? valor.publica = entrada.publica : erros.push("publica: verdadeiro ou falso");
  if ("filtros" in entrada) {
    const f = validarFiltros(entrada.filtros);
    if (f.ok) {
      const { diasSemRepetir, ...resto } = f.valor;
      valor.filtros = resto;
    } else erros.push(...f.erros);
  }
  return erros.length ? { ok: false, erros } : { ok: true, valor };
}
__name(validarOferta, "validarOferta");

// ../automacao/aliexpress.mjs
import { createHmac } from "node:crypto";
var ENDPOINT2 = "https://api-sg.aliexpress.com/sync";
var PREFIXO = "ae:";
function assinar2(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
  return createHmac("sha256", secret).update(base, "utf8").digest("hex").toUpperCase();
}
__name(assinar2, "assinar");
var numero2 = /* @__PURE__ */ __name((v) => {
  const n = parseFloat(String(v ?? "").replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}, "numero");
function paraCru(p) {
  const positivas = numero2(p.evaluate_rate);
  return {
    plataforma: "aliexpress",
    itemId: `${PREFIXO}${p.product_id}`,
    shopId: p.shop_id == null ? null : String(p.shop_id),
    productName: p.product_title,
    price: numero2(p.target_sale_price ?? p.sale_price) ?? 0,
    priceDiscountRate: numero2(p.discount) ?? 0,
    sales: numero2(p.lastest_volume) ?? 0,
    ratingStar: positivas == null ? null : Math.round(positivas / 20 * 10) / 10,
    // 0 a 5 estrelas
    commissionRate: numero2(p.commission_rate) ?? 0,
    imageUrl: p.product_main_image_url,
    productLink: p.product_detail_url,
    offerLink: p.promotion_link,
    shopName: p.shop_name
  };
}
__name(paraCru, "paraCru");
function criarAliexpress({ appKey, secret, trackingId, buscar = fetch, agoraMs = /* @__PURE__ */ __name(() => Date.now(), "agoraMs"), limiteMs = 6e4 }) {
  if (!appKey || !secret || !trackingId) throw new Error("faltam a App Key, o Secret e o ID de rastreio da AliExpress");
  async function chamar(metodo, negocio) {
    const params = { method: metodo, app_key: appKey, timestamp: String(agoraMs()), sign_method: "sha256", ...negocio };
    for (const k of Object.keys(params)) if (params[k] === void 0 || params[k] === null) delete params[k];
    params.sign = assinar2(
      Object.fromEntries(Object.entries(params).filter(([k]) => k !== "sign")),
      secret
    );
    try {
      const r = await buscar(`${ENDPOINT2}?${new URLSearchParams(params)}`, { method: "GET", signal: AbortSignal.timeout(limiteMs) });
      const json2 = await r.json().catch(() => null);
      if (!json2) return { ok: false, erro: `resposta inesperada (HTTP ${r.status})` };
      if (json2.error_response) return { ok: false, erro: String(json2.error_response.msg ?? json2.error_response.code ?? "erro da AliExpress") };
      const corpo = json2[`${metodo.replaceAll(".", "_")}_response`] ?? json2;
      if (corpo.code != null && String(corpo.code) !== "0") return { ok: false, erro: String(corpo.message ?? corpo.msg ?? `c\xF3digo ${corpo.code}`) };
      const res = corpo.resp_result;
      if (!res) return { ok: false, erro: "resposta inesperada da AliExpress" };
      if (res.resp_code != null && String(res.resp_code) !== "200") return { ok: false, erro: String(res.resp_msg ?? `c\xF3digo ${res.resp_code}`) };
      const lista = res.result?.products;
      const produtos = Array.isArray(lista) ? lista : Array.isArray(lista?.product) ? lista.product : [];
      return { ok: true, produtos };
    } catch (e) {
      return { ok: false, erro: `sem resposta (${e.name})` };
    }
  }
  __name(chamar, "chamar");
  const comuns = { tracking_id: trackingId, target_currency: "BRL", target_language: "PT" };
  return {
    // Formato esperado por reabastecer() em estoque.mjs. Sem palavra: os mais vendidos.
    async buscarLote({ palavra, pagina = 1, limite = 50 }) {
      const r = await chamar("aliexpress.affiliate.product.query", {
        ...comuns,
        keywords: palavra || void 0,
        page_no: pagina,
        page_size: Math.min(Math.max(Number(limite) || 50, 1), 50),
        sort: "LAST_VOLUME_DESC",
        ship_to_country: "BR"
      });
      return r.ok ? { ok: true, ofertas: r.produtos.map(paraCru) } : r;
    },
    // Mesmos três casos da Shopee: existe, sumiu ({ ok:true, oferta:null }) ou não deu para saber.
    async lerOferta({ itemId }) {
      const id = String(itemId).startsWith(PREFIXO) ? String(itemId).slice(PREFIXO.length) : String(itemId);
      const r = await chamar("aliexpress.affiliate.productdetail.get", { ...comuns, product_ids: id, country: "BR" });
      if (!r.ok) return { ok: false, erro: r.erro };
      const p = r.produtos.find((x) => String(x.product_id) === id);
      return { ok: true, oferta: p ? paraCru(p) : null };
    }
  };
}
__name(criarAliexpress, "criarAliexpress");

// ../automacao/amazon.mjs
var MERCADO = "www.amazon.com.br";
var BASE = "https://creatorsapi.amazon/catalog/v1";
var PREFIXO2 = "am:";
var TOKEN = { "3.1": "https://api.amazon.com/auth/o2/token", "3.2": "https://api.amazon.co.uk/auth/o2/token", "3.3": "https://api.amazon.co.jp/auth/o2/token" };
var RECURSOS = ["images.primary.medium", "itemInfo.title", "offersV2.listings.price"];
var tokens = /* @__PURE__ */ new Map();
function paraCru2(item) {
  const oferta = item.offersV2?.listings?.[0];
  const preco = oferta?.price;
  const url = item.detailPageURL;
  return {
    plataforma: "amazon",
    itemId: `${PREFIXO2}${item.asin}`,
    shopId: null,
    productName: item.itemInfo?.title?.displayValue,
    price: Number(preco?.money?.amount) || 0,
    priceDiscountRate: Number(preco?.savings?.percentage) || 0,
    sales: null,
    // a API não informa
    ratingStar: null,
    // a API não informa
    commissionRate: 0,
    imageUrl: item.images?.primary?.medium?.url,
    productLink: url,
    offerLink: url,
    shopName: oferta?.merchantInfo?.name ?? "Amazon"
  };
}
__name(paraCru2, "paraCru");
function criarAmazon({ credentialId, secret, versao = "3.1", partnerTag, buscar = fetch, agoraMs = /* @__PURE__ */ __name(() => Date.now(), "agoraMs"), limiteMs = 6e4 }) {
  if (!credentialId || !secret || !partnerTag) throw new Error("faltam o Credential ID, o Secret e a etiqueta de afiliado da Amazon");
  if (!TOKEN[versao]) throw new Error("vers\xE3o da credencial da Amazon desconhecida (use 3.1, 3.2 ou 3.3)");
  async function token() {
    const guardado = tokens.get(credentialId);
    if (guardado && guardado.expiraEm > agoraMs() + 6e4) return { ok: true, valor: guardado.valor };
    try {
      const r = await buscar(TOKEN[versao], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", client_id: credentialId, client_secret: secret, scope: "creatorsapi::default" }),
        signal: AbortSignal.timeout(limiteMs)
      });
      const json2 = await r.json().catch(() => null);
      if (!json2?.access_token) return { ok: false, erro: String(json2?.error_description ?? json2?.error ?? `a Amazon n\xE3o aceitou as credenciais (HTTP ${r.status})`) };
      tokens.set(credentialId, { valor: json2.access_token, expiraEm: agoraMs() + (Number(json2.expires_in) || 3600) * 1e3 });
      return { ok: true, valor: json2.access_token };
    } catch (e) {
      return { ok: false, erro: `sem resposta (${e.name})` };
    }
  }
  __name(token, "token");
  async function chamar(operacao, corpo) {
    const t = await token();
    if (!t.ok) return t;
    try {
      const r = await buscar(`${BASE}/${operacao}`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${t.valor}`, "x-marketplace": MERCADO },
        body: JSON.stringify({ partnerTag, marketplace: MERCADO, ...corpo }),
        signal: AbortSignal.timeout(limiteMs)
      });
      if (r.status === 401) tokens.delete(credentialId);
      const json2 = await r.json().catch(() => null);
      if (r.status === 429) return { ok: false, erro: "a Amazon pediu para esperar (limite de uso)" };
      if (r.status >= 400) return { ok: false, erro: String(json2?.message ?? json2?.errors?.[0]?.message ?? `erro da Amazon (HTTP ${r.status})`) };
      return { ok: true, corpo: json2 ?? {} };
    } catch (e) {
      return { ok: false, erro: `sem resposta (${e.name})` };
    }
  }
  __name(chamar, "chamar");
  const comuns = { resources: RECURSOS, languagesOfPreference: ["pt_BR"], currencyOfPreference: "BRL" };
  return {
    async buscarLote({ palavra, pagina = 1, limite = 10 }) {
      if (!palavra) return { ok: false, erro: "A Amazon precisa de uma palavra de busca." };
      const r = await chamar("searchItems", { ...comuns, keywords: palavra, searchIndex: "All", itemCount: Math.min(Math.max(Number(limite) || 10, 1), 10), itemPage: pagina });
      if (!r.ok) return r;
      return { ok: true, ofertas: (r.corpo.searchResult?.items ?? []).map(paraCru2) };
    },
    async lerOferta({ itemId }) {
      const asin = String(itemId).startsWith(PREFIXO2) ? String(itemId).slice(PREFIXO2.length) : String(itemId);
      const r = await chamar("getItems", { ...comuns, itemIds: [asin], itemIdType: "ASIN" });
      if (!r.ok) return { ok: false, erro: r.erro };
      const item = (r.corpo.itemResults?.items ?? []).find((i) => i.asin === asin);
      return { ok: true, oferta: item ? paraCru2(item) : null };
    }
  };
}
__name(criarAmazon, "criarAmazon");

// src/lojas.js
var LOJAS = {
  shopee: { nome: "Shopee" },
  aliexpress: { nome: "AliExpress" },
  amazon: { nome: "Amazon" }
};
var TIPOS_DE_LOJA = Object.keys(LOJAS);
var texto2 = /* @__PURE__ */ __name((v) => String(v ?? "").trim(), "texto");
function lerCredenciais(tipo, c) {
  const appId = texto2(c?.appId);
  const segredo = texto2(c?.segredo);
  if (tipo === "shopee") {
    if (!/^[0-9]{4,20}$/.test(appId)) return { ok: false, erro: "O App ID da Shopee tem s\xF3 n\xFAmeros." };
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(segredo)) return { ok: false, erro: "Confira o Secret: sem espa\xE7os e com pelo menos 8 caracteres." };
    return { ok: true, dados: { appId, segredo }, final: appId.slice(-4) };
  }
  if (tipo === "aliexpress") {
    const rastreio = texto2(c?.rastreio);
    if (!/^[0-9]{4,20}$/.test(appId)) return { ok: false, erro: "A App Key da AliExpress tem s\xF3 n\xFAmeros." };
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(segredo)) return { ok: false, erro: "Confira o Secret: sem espa\xE7os e com pelo menos 8 caracteres." };
    if (!/^[A-Za-z0-9_-]{2,60}$/.test(rastreio)) return { ok: false, erro: "Confira o ID de rastreio (Tracking ID) da AliExpress: s\xF3 letras, n\xFAmeros, tra\xE7o e sublinhado." };
    return { ok: true, dados: { appKey: appId, segredo, rastreio }, final: appId.slice(-4) };
  }
  if (tipo === "amazon") {
    const versao = texto2(c?.versao) || "3.1";
    const etiqueta = texto2(c?.etiqueta);
    if (!/^[A-Za-z0-9._-]{8,120}$/.test(appId)) return { ok: false, erro: "Confira o Credential ID da Amazon: sem espa\xE7os e com pelo menos 8 caracteres." };
    if (!/^[\x21-\x7E]{8,200}$/.test(segredo)) return { ok: false, erro: "Confira o Credential Secret da Amazon: sem espa\xE7os e com pelo menos 8 caracteres." };
    if (!["3.1", "3.2", "3.3"].includes(versao)) return { ok: false, erro: "A vers\xE3o da credencial da Amazon deve ser 3.1, 3.2 ou 3.3." };
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(etiqueta)) return { ok: false, erro: "Confira a etiqueta de afiliado da Amazon (por exemplo, minhaloja-20)." };
    return { ok: true, dados: { credentialId: appId, segredo, versao, etiqueta }, final: appId.slice(-4) };
  }
  return { ok: false, erro: "Essa loja ainda n\xE3o est\xE1 dispon\xEDvel." };
}
__name(lerCredenciais, "lerCredenciais");
function criarClienteDaLoja(tipo, d, buscar) {
  if (tipo === "shopee") return criarShopee({ appId: d.appId, secret: d.segredo, buscar });
  if (tipo === "aliexpress") return criarAliexpress({ appKey: d.appKey, secret: d.segredo, trackingId: d.rastreio, buscar });
  if (tipo === "amazon") return criarAmazon({ credentialId: d.credentialId, secret: d.segredo, versao: d.versao, partnerTag: d.etiqueta, buscar });
  throw new Error("loja desconhecida");
}
__name(criarClienteDaLoja, "criarClienteDaLoja");
async function conferirComALoja(tipo, dados, buscar) {
  const cli = criarClienteDaLoja(tipo, dados, buscar);
  let ultimo = null;
  const tentativas = tipo === "shopee" ? 3 : 1;
  for (let i = 0; i < tentativas; i++) {
    ultimo = await cli.buscarLote(tipo === "shopee" ? { pagina: 1, limite: 1 } : { palavra: tipo === "amazon" ? "celular" : void 0, pagina: 1, limite: 1 });
    if (ultimo.ok) break;
  }
  if (ultimo.ok) return { ok: true };
  const chaves = { shopee: "o App ID e o Secret", aliexpress: "a App Key, o Secret e o ID de rastreio", amazon: "o Credential ID, o Secret, a vers\xE3o e a etiqueta" };
  return { ok: false, erro: `${LOJAS[tipo].nome} n\xE3o aceitou essas chaves. Confira ${chaves[tipo]}.`, detalhe: String(ultimo.erro).slice(0, 120) };
}
__name(conferirComALoja, "conferirComALoja");

// src/api.js
var ehGerenteDoServidor = /* @__PURE__ */ __name((env, bot) => bot?.username === String(env.GERENTE_USERNAME ?? "").toLowerCase(), "ehGerenteDoServidor");
var json = /* @__PURE__ */ __name((corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json; charset=utf-8" } }), "json");
var resumoDaOferta = /* @__PURE__ */ __name((o) => ({ id: o.id, nome: o.nome, loja: o.loja ?? "shopee", ativa: o.ativa, publica: o.publica !== false, filtros: o.filtros }), "resumoDaOferta");
var estadoPelasOfertas = /* @__PURE__ */ __name((ofertas) => ofertas.some((o) => o.ativa || o.publica !== false) ? "ativo" : ofertas.length ? "pausado" : "aguardando", "estadoPelasOfertas");
var resumoDoGrupo = /* @__PURE__ */ __name((g, n, semApi = false, postadosHoje = 0) => ({
  chatId: g.chatId,
  titulo: g.titulo,
  estado: g.estado,
  filtros: g.filtros,
  horaInicio: g.horaInicio,
  horaFim: g.horaFim,
  intervaloMin: g.intervaloMin,
  estoque: n,
  ...metasDoGrupo(g),
  ultimoPostEm: g.ultimoPostEm ? new Date(g.ultimoPostEm).toISOString() : null,
  tentativasHoje: g.tentativasHoje,
  botId: g.botId,
  limiteDia: g.ofertasPorDia ?? null,
  // limite diário de ofertas do plano, POR PESSOA somando os grupos (null = sem limite)
  cotaDia: g.cotaDia ?? null,
  // a parte do limite que cabe a este grupo (limite / número de grupos da pessoa)
  postadosHoje,
  // ofertas que a pessoa enviou hoje em todos os grupos (Brasília)
  semApi,
  // true: a dona do grupo ainda não vinculou uma API e o grupo não posta
  semOfertas: (g.ofertas ?? []).length === 0,
  // sem nenhuma oferta o grupo não tem o que postar
  ofertas: (g.ofertas ?? []).map(resumoDaOferta)
}), "resumoDoGrupo");
var resumoDoBot = /* @__PURE__ */ __name((b) => ({
  id: b.id,
  nome: b.nome,
  username: b.username,
  estado: b.estado,
  linkGrupo: b.estado === "pronto" ? linkAdicionarAoGrupo(b.username) : null
}), "resumoDoBot");
function checarLoja(loja, palavras, lojasDaPessoa) {
  if (loja !== "shopee" && !lojasDaPessoa.has(loja)) return { status: 409, erro: `Vincule primeiro a API da ${LOJAS[loja].nome} para usar essa loja.` };
  if (loja === "amazon" && !palavras.length) return { status: 400, erro: "A Amazon precisa de pelo menos uma palavra de busca." };
  return null;
}
__name(checarLoja, "checarLoja");
async function rotearApi(request, { env, dados, repo, buscar = fetch, agora = Date.now() }) {
  const url = new URL(request.url);
  const caminho = url.pathname;
  const metodo = request.method;
  const corpoJson = /* @__PURE__ */ __name(async () => request.json().catch(() => null), "corpoJson");
  if (metodo === "POST" && caminho === "/api/entrar/apple") {
    const c = await corpoJson();
    const r = await verificarIdentidadeApple(c?.identityToken, { audiencia: env.APPLE_BUNDLE_ID, buscar, agora });
    if (!r.ok) return json({ erro: "N\xE3o consegui entrar com a Apple." }, 401);
    const u = await dados.entrarOuCriar({ id: `apple:${r.sub}`, nome: c?.nome ?? null, email: r.email }, agora);
    return json({ sessao: await assinarSessao({ u: u.id, v: u.sessao_versao }, env.SEGREDO_SESSAO, { agora }), nome: u.nome });
  }
  if (metodo === "POST" && caminho === "/api/entrar/dispositivo") {
    const c = await corpoJson();
    if (typeof c?.chave !== "string" || !/^[0-9a-f]{32,128}$/.test(c.chave)) return json({ erro: "Chave do aparelho inv\xE1lida." }, 400);
    const id = `disp:${(await hmacHex(env.SEGREDO_SESSAO, `disp:${c.chave}`)).slice(0, 40)}`;
    let u = await dados.entrarOuCriar({ id }, agora);
    if (env.SEM_PLANOS === "1" && u.administrador !== 1) {
      await dados.definirAdministrador(u.id, true);
      u = { ...u, administrador: 1 };
    }
    return json({ sessao: await assinarSessao({ u: u.id, v: u.sessao_versao }, env.SEGREDO_SESSAO, { agora }), nome: u.nome });
  }
  if (metodo === "POST" && caminho === "/api/entrar/teste") {
    const c = await corpoJson();
    if (!env.CODIGO_TESTE || c?.codigo !== env.CODIGO_TESTE) return json({ erro: "C\xF3digo inv\xE1lido." }, 401);
    const nome = String(c?.nome || "teste").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "teste";
    const u = await dados.entrarOuCriar({ id: `teste:${nome}`, nome }, agora);
    return json({ sessao: await assinarSessao({ u: u.id, v: u.sessao_versao }, env.SEGREDO_SESSAO, { agora }), nome: u.nome });
  }
  const sessao = await verificarSessao((request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), env.SEGREDO_SESSAO, { agora });
  const usuario = sessao ? await dados.usuario(sessao.u) : null;
  if (!usuario || usuario.sessao_versao !== sessao.v) return json({ erro: "Sess\xE3o vencida. Entre de novo." }, 401);
  const dono = usuario.id;
  const admin = usuario.administrador === 1;
  const acesso = acessoDe(usuario, agora);
  const plano = acesso.plano;
  const lim = limitesDoPlano(env, plano);
  if (acesso.estado === "expirado" && metodo !== "GET" && metodo !== "DELETE" && caminho !== "/api/assinatura") return json({ erro: "Seu teste de 2 dias acabou. Assine um plano para continuar.", codigo: "assinatura" }, 402);
  const apiPadrao = Boolean(env.SHOPEE_APP_ID && env.SHOPEE_SECRET) && admin;
  const apis = await dados.apisDoDono(dono);
  const temShopee = apis.length > 0 || apiPadrao;
  const lojasDaPessoa = /* @__PURE__ */ new Set([...apis.map((a) => a.tipo), ...apiPadrao ? ["shopee"] : []]);
  if (metodo === "PUT" && caminho === "/api/perfil") {
    const c = await corpoJson();
    const nome = typeof c?.nome === "string" ? c.nome.trim() : "";
    if (nome.length < 1 || nome.length > 40) return json({ erro: "Escreva o seu nome (at\xE9 40 letras)." }, 400);
    await dados.definirNome(dono, nome);
    return json({ ok: true, nome });
  }
  if (metodo === "GET" && caminho === "/api/status") {
    const grupos = await repo.gruposDoDono(dono);
    const postadosHoje = await repo.contarPostadosDoDonoDesde(dono, inicioDoDia(diaBrasilia(agora)));
    return json({
      nome: usuario.nome,
      administrador: admin,
      plano,
      apis: apis.map((a) => ({ id: a.id, tipo: a.tipo, final: a.final })),
      apiPadrao: apiPadrao && !apis.some((a) => a.tipo === "shopee"),
      planoNome: PLANOS[plano].nome,
      acesso: { estado: acesso.estado, testeFim: acesso.testeFim ? new Date(acesso.testeFim).toISOString() : null, assinaturaFim: acesso.assinaturaFim ? new Date(acesso.assinaturaFim).toISOString() : null },
      planos: planosAVenda(),
      compraAtiva: Boolean(clienteAppleDoAmbiente(env)),
      // o servidor já tem as chaves da Apple: o app pode vender
      limites: lim,
      bots: (await dados.botsDoDono(dono)).map(resumoDoBot),
      grupos: await Promise.all(grupos.map(async (g0) => {
        const g = { ...g0, ofertasPorDia: lim.ofertasPorDia, cotaDia: lim.ofertasPorDia == null ? null : Math.ceil(lim.ofertasPorDia / grupos.length) };
        return resumoDoGrupo(g, await repo.contarEstoque(g.chatId), !temShopee, postadosHoje);
      }))
    });
  }
  if (metodo === "POST" && caminho === "/api/assinatura") {
    const apple = clienteAppleDoAmbiente(env, buscar);
    if (!apple) return json({ erro: "A compra ainda n\xE3o est\xE1 ligada neste servidor.", codigo: "compra_indisponivel" }, 503);
    if (admin) return json({ erro: "Perfil administrador n\xE3o precisa assinar." }, 400);
    const c = await corpoJson();
    const transacaoId = String(c?.transacaoId ?? "").trim();
    if (!/^[0-9]{5,25}$/.test(transacaoId)) return json({ erro: "N\xFAmero de transa\xE7\xE3o inv\xE1lido." }, 400);
    const e = await apple.estado(transacaoId);
    if (!e.ok) return json({ erro: e.erro, codigo: e.motivo }, e.motivo === "nao_achou" || e.motivo === "produto" || e.motivo === "outro_app" ? 400 : 502);
    if (!e.comAcesso) return json({ erro: "Essa assinatura n\xE3o est\xE1 ativa. Assine de novo para continuar.", codigo: "inativa" }, 409);
    const ate = validadeParaGravar(e, agora);
    await dados.gravarAssinaturaApple({ dono, original: e.original, plano: e.plano, ate, agora });
    return json({ ok: true, plano: e.plano, periodo: e.periodo, ate: new Date(ate).toISOString(), ambiente: e.ambiente });
  }
  if (metodo === "POST" && caminho === "/api/apis") {
    const c = await corpoJson();
    const tipo = String(c?.tipo ?? "");
    if (!TIPOS_DE_LOJA.includes(tipo)) return json({ erro: "Essa loja ainda n\xE3o est\xE1 dispon\xEDvel." }, 400);
    const cred = lerCredenciais(tipo, c);
    if (!cred.ok) return json({ erro: cred.erro }, 400);
    const conf = await conferirComALoja(tipo, cred.dados, buscar);
    if (!conf.ok) return json({ erro: conf.erro, detalhes: [conf.detalhe] }, 400);
    const id = crypto.randomUUID();
    await dados.salvarApi({ id, dono, tipo, final: cred.final, dadosCifrados: await cifrar(JSON.stringify(cred.dados), env.CHAVE_CIFRA) }, agora);
    if (!admin) await dados.iniciarTeste(dono, agora);
    return json({ ok: true, api: { id, tipo, final: cred.final } });
  }
  const mApi = caminho.match(/^\/api\/apis\/([0-9a-f-]{36})$/);
  if (mApi && metodo === "DELETE") {
    return await dados.removerApi(dono, mApi[1]) ? json({ ok: true }) : json({ erro: "API n\xE3o encontrada." }, 404);
  }
  if (metodo === "GET" && caminho === "/api/historico" && env.SEM_PLANOS === "1") {
    const chatId = url.searchParams.get("chatId");
    if (chatId && !chatIdValido(chatId)) return json({ erro: "Grupo inv\xE1lido." }, 400);
    const linhas = await dados.anuncios(dono, { chatId, antes: url.searchParams.get("antes"), limite: url.searchParams.get("limite") });
    const grupos = new Map((await repo.gruposDoDono(dono)).map((g) => [g.chatId, g]));
    return json({
      anuncios: linhas.map((l) => ({ id: l.id, chatId: l.chat_id, grupo: grupos.get(l.chat_id)?.titulo ?? null, linkGrupo: grupos.get(l.chat_id)?.filtros?.linkGrupo ?? null, titulo: l.titulo, preco: l.preco, link: l.link, imagem: l.imagem, loja: l.loja, em: new Date(l.em).toISOString() }))
    });
  }
  if (metodo === "POST" && caminho === "/api/bots") {
    const c = await corpoJson();
    const nome = typeof c?.nome === "string" ? c.nome.trim() : "";
    if (nome.length < 1 || nome.length > 64) return json({ erro: "D\xEA um nome ao bot (at\xE9 64 letras)." }, 400);
    if ((await dados.botsDoDono(dono)).length >= lim.bots) return json({ erro: `Limite de ${lim.bots} bots no plano ${PLANOS[plano].nome}.` }, 409);
    const id = crypto.randomUUID();
    let username = usernameSugerido(nome);
    for (let i = 0; i < 5 && await dados.botPorUsername(username); i++) username = usernameSugerido(nome);
    await dados.criarBotPendente({ id, dono, nome, username }, agora);
    return json({ bot: { id, nome, username, estado: "aguardando" }, linkCriar: linkCriarBot(env.GERENTE_USERNAME, username, nome) });
  }
  if (metodo === "POST" && caminho === "/api/bots/existente" && env.SEM_PLANOS === "1") {
    const c = await corpoJson();
    if ((await dados.botsDoDono(dono)).length >= lim.bots) return json({ erro: `Limite de ${lim.bots} bots.` }, 409);
    const ehGerente = c?.tipo === "gerente";
    const token = ehGerente ? env.GERENTE_TOKEN : typeof c?.token === "string" ? c.token.trim() : "";
    if (!ehGerente && !/^\d{6,}:[\w-]{30,}$/.test(token)) return json({ erro: "O token do bot n\xE3o parece certo. Ele tem o formato 123456:AAAA\u2026 e vem do @BotFather." }, 400);
    const eu = await tgChamar(buscar, token, "getMe", {});
    if (!eu.ok || !eu.result?.username) return json({ erro: "O Telegram n\xE3o aceitou esse token. Confira se colou certo." }, 400);
    const username = String(eu.result.username).toLowerCase();
    const ja = await dados.botPorUsername(username) ?? await dados.botPorTgId(eu.result.id);
    if (ja && ja.estado === "pronto" && ja.dono === dono) return json({ erro: "Esse bot j\xE1 est\xE1 na sua lista." }, 409);
    const gerenteDoServidor = username === String(env.GERENTE_USERNAME ?? "").toLowerCase();
    const id = ja?.id ?? crypto.randomUUID();
    const nome = String(eu.result.first_name || username).slice(0, 64);
    if (ja) await dados.reassumirBot(id, dono, nome);
    else await dados.criarBotPendente({ id, dono, nome, username }, agora);
    await dados.marcarPronto(id, { tgId: eu.result.id, tokenCifrado: await cifrar(token, env.CHAVE_CIFRA) }, agora);
    const wh = gerenteDoServidor ? await tgChamar(buscar, token, "setWebhook", { url: `${env.URL_PUBLICA}/telegram/gerente`, secret_token: await segredoDoGerente(env), allowed_updates: ["managed_bot", "message", "my_chat_member"] }) : await tgChamar(buscar, token, "setWebhook", { url: `${env.URL_PUBLICA}/telegram/bot/${id}`, secret_token: await segredoDoBot(env, id), allowed_updates: ["my_chat_member", "message"] });
    if (!wh.ok) {
      await dados.marcarRemovido(id);
      return json({ erro: "O Telegram recusou ligar esse bot ao servidor. Tente de novo." }, 502);
    }
    return json({ bot: resumoDoBot(await dados.botPorId(id)) });
  }
  const mBot = caminho.match(/^\/api\/bots\/([0-9a-f-]{36})$/);
  if (mBot) {
    const bot = await dados.botDoDono(dono, mBot[1]);
    if (!bot || bot.estado === "removido") return json({ erro: "Bot n\xE3o encontrado." }, 404);
    if (metodo === "GET") return json({ bot: resumoDoBot(bot), linkCriar: bot.estado === "aguardando" ? linkCriarBot(env.GERENTE_USERNAME, bot.username, bot.nome) : null });
    if (metodo === "DELETE") {
      if (bot.estado === "aguardando") {
        await dados.apagarPendente(bot.id);
        return json({ ok: true });
      }
      const token = await tokenDoBot(env, bot);
      if (token && !ehGerenteDoServidor(env, bot)) await tgChamar(buscar, token, "deleteWebhook", {});
      for (const g of (await repo.gruposDoDono(dono)).filter((x) => x.botId === bot.id)) await repo.removerGrupo(g.chatId);
      await dados.marcarRemovido(bot.id);
      return json({ ok: true });
    }
  }
  const sincronizarEstado = /* @__PURE__ */ __name(async (chatId, ofertas) => {
    const estado = estadoPelasOfertas(ofertas);
    const atual = (await repo.gruposDoDono(dono)).find((g) => g.chatId === chatId);
    if (atual && atual.estado !== estado) await repo.atualizarGrupo(chatId, { estado });
  }, "sincronizarEstado");
  const mOferta = caminho.match(/^\/api\/grupos\/(-?\d+)\/ofertas(?:\/([0-9a-f-]{32,36}))?$/);
  if (mOferta && chatIdValido(mOferta[1])) {
    const chatId = mOferta[1];
    const grupo = (await repo.gruposDoDono(dono)).find((g) => g.chatId === chatId);
    if (!grupo) return json({ erro: "Grupo n\xE3o encontrado." }, 404);
    const ofertas = grupo.ofertas ?? [];
    if (metodo === "POST" && !mOferta[2]) {
      const v = validarOferta(await corpoJson(), { criando: true });
      if (!v.ok) return json({ erro: "dados inv\xE1lidos", detalhes: v.erros }, 400);
      if (ofertas.length >= lim.ofertasPorGrupo) return json({ erro: `Limite de ${lim.ofertasPorGrupo} ofertas por grupo no plano ${PLANOS[plano].nome}.` }, 409);
      const loja = v.valor.loja ?? "shopee";
      const erroLoja = checarLoja(loja, v.valor.filtros?.palavras ?? [], lojasDaPessoa);
      if (erroLoja) return json({ erro: erroLoja.erro }, erroLoja.status);
      const id = crypto.randomUUID();
      await repo.criarOferta({ id, chatId, nome: v.valor.nome, filtros: v.valor.filtros ?? {}, ativa: v.valor.ativa ?? true, publica: v.valor.publica ?? true, loja, criadaEm: agora });
      await sincronizarEstado(chatId, [...ofertas, { ativa: v.valor.ativa ?? true, publica: v.valor.publica ?? true }]);
      return json({ ok: true, oferta: resumoDaOferta({ id, nome: v.valor.nome, loja, filtros: v.valor.filtros ?? {}, ativa: v.valor.ativa ?? true, publica: v.valor.publica ?? true }) });
    }
    const oferta = mOferta[2] ? ofertas.find((o) => o.id === mOferta[2]) : null;
    if (!oferta) return json({ erro: "Oferta n\xE3o encontrada." }, 404);
    if (metodo === "PUT") {
      const v = validarOferta(await corpoJson());
      if (!v.ok) return json({ erro: "dados inv\xE1lidos", detalhes: v.erros }, 400);
      const lojaNova = v.valor.loja ?? oferta.loja ?? "shopee";
      const palavrasNovas = v.valor.filtros ? v.valor.filtros.palavras ?? [] : oferta.filtros?.palavras ?? [];
      if (v.valor.loja || v.valor.filtros) {
        const erroLoja = checarLoja(lojaNova, palavrasNovas, lojasDaPessoa);
        if (erroLoja) return json({ erro: erroLoja.erro }, erroLoja.status);
      }
      await repo.atualizarOferta(oferta.id, v.valor);
      if (v.valor.loja && v.valor.loja !== (oferta.loja ?? "shopee")) await repo.esvaziarEstoqueDaOferta(chatId, oferta.id);
      await sincronizarEstado(chatId, ofertas.map((o) => o.id === oferta.id ? { ...o, ...v.valor } : o));
      if (v.valor.filtros) await repo.podarEstoqueDaOferta(chatId, oferta.id, (v.valor.filtros.palavras ?? []).map(chavePalavra));
      return json({ ok: true, oferta: resumoDaOferta({ ...oferta, ...v.valor }) });
    }
    if (metodo === "DELETE") {
      await repo.removerOferta(oferta.id);
      await sincronizarEstado(chatId, ofertas.filter((o) => o.id !== oferta.id));
      return json({ ok: true });
    }
  }
  const mGrupo = caminho.match(/^\/api\/grupos\/(-?\d+)(?:\/(iniciar|pausar))?$/);
  if (mGrupo && chatIdValido(mGrupo[1])) {
    const chatId = mGrupo[1];
    const grupo = (await repo.gruposDoDono(dono)).find((g) => g.chatId === chatId);
    if (!grupo) return json({ erro: "Grupo n\xE3o encontrado." }, 404);
    if (metodo === "POST" && mGrupo[2]) {
      const ligar = mGrupo[2] === "iniciar";
      const todas = grupo.ofertas ?? [];
      if (ligar && !todas.length) return json({ erro: "Crie pelo menos uma oferta neste grupo antes de ativar." }, 409);
      for (const o of todas) await repo.atualizarOferta(o.id, { ativa: ligar, publica: ligar });
      const estado = estadoPelasOfertas(todas.map((o) => ({ ...o, ativa: ligar, publica: ligar })));
      await repo.atualizarGrupo(chatId, { estado });
      return json({ ok: true, estado });
    }
    if (metodo === "PUT" && !mGrupo[2]) {
      const v = validarGrupo(await corpoJson(), { intervaloMinimo: lim.intervaloMinimo, intervaloMaximo: lim.intervaloMaximo });
      if (!v.ok) return json({ erro: "dados inv\xE1lidos", detalhes: v.erros }, 400);
      if (v.valor.filtros) v.valor.filtros = { ..."diasSemRepetir" in v.valor.filtros ? { diasSemRepetir: v.valor.filtros.diasSemRepetir } : {}, ...env.SEM_PLANOS === "1" && v.valor.filtros.linkGrupo ? { linkGrupo: v.valor.filtros.linkGrupo } : {} };
      await repo.atualizarGrupo(chatId, v.valor);
      const g = (await repo.gruposDoDono(dono)).find((x) => x.chatId === chatId);
      return json({ ok: true, grupo: resumoDoGrupo(g, await repo.contarEstoque(chatId), !temShopee) });
    }
    if (metodo === "DELETE" && !mGrupo[2]) {
      await repo.removerGrupo(chatId);
      return json({ ok: true });
    }
  }
  if (metodo === "DELETE" && caminho === "/api/conta") {
    for (const b of await dados.botsDoDono(dono)) {
      const token = await tokenDoBot(env, b);
      if (token && !ehGerenteDoServidor(env, b)) await tgChamar(buscar, token, "deleteWebhook", {});
    }
    for (const g of await repo.gruposDoDono(dono)) await repo.removerGrupo(g.chatId);
    await dados.apagarUsuario(dono);
    return json({ ok: true });
  }
  return json({ erro: "Rota desconhecida." }, 404);
}
__name(rotearApi, "rotearApi");

// src/index.js
var resposta = /* @__PURE__ */ __name((texto3, status = 200) => new Response(texto3, { status }), "resposta");
async function executarCiclo(env, { agora = Date.now(), fetchImpl = fetch, esperar } = {}) {
  try {
    const repoBase = criarRepoD1(env.DB, { multi: true });
    const dados = criarDados(env.DB);
    await renovarAssinaturas({ env, dados, buscar: fetchImpl, agora }).catch((e) => console.log(JSON.stringify({ erroRenovacao: e?.message || String(e) })));
    const prontos = new Map((await dados.botsProntos()).map((b) => [b.id, b]));
    const lojasPorDono = await dados.lojasPorDono();
    const admins = new Set(await dados.administradores());
    const padrao = env.SHOPEE_APP_ID && env.SHOPEE_SECRET ? criarShopee({ appId: env.SHOPEE_APP_ID, secret: env.SHOPEE_SECRET, buscar: fetchImpl }) : null;
    const clientes = /* @__PURE__ */ new Map();
    const clienteDe = /* @__PURE__ */ __name(async (dono, loja = "shopee") => {
      const chave = `${dono}|${loja}`;
      if (clientes.has(chave)) return clientes.get(chave);
      let c = null;
      if (lojasPorDono.get(dono)?.has(loja)) {
        const linha = await dados.apiCompleta(dono, loja);
        c = criarClienteDaLoja(loja, JSON.parse(await decifrar(linha.dados_cifrados, env.CHAVE_CIFRA)), fetchImpl);
      } else if (loja === "shopee" && admins.has(dono)) c = padrao;
      clientes.set(chave, c);
      return c;
    }, "clienteDe");
    const temApi = /* @__PURE__ */ __name((dono) => lojasPorDono.has(dono) || admins.has(dono) && padrao !== null, "temApi");
    const planosDosDonos = await dados.planosDosDonos();
    const acessoDe_ = /* @__PURE__ */ __name((dono) => acessoDe(planosDosDonos.get(dono) ?? {}, agora), "acessoDe_");
    const ofertasPorDiaDe = /* @__PURE__ */ __name((dono) => limitesDoPlano(env, acessoDe_(dono).plano).ofertasPorDia ?? null, "ofertasPorDiaDe");
    const repo = {
      ...repoBase,
      grupos: /* @__PURE__ */ __name(async () => {
        const todos = await repoBase.grupos();
        const quantos = /* @__PURE__ */ new Map();
        for (const g of todos) quantos.set(g.dono, (quantos.get(g.dono) ?? 0) + 1);
        return todos.filter((g) => g.botId && prontos.has(g.botId) && temApi(g.dono) && acessoDe_(g.dono).estado !== "expirado").map((g) => {
          const limite = ofertasPorDiaDe(g.dono);
          return { ...g, ofertasPorDia: limite, cotaDia: limite == null ? null : Math.ceil(limite / quantos.get(g.dono)) };
        });
      }, "grupos")
    };
    const tokens2 = /* @__PURE__ */ new Map();
    const tokenDe = /* @__PURE__ */ __name(async (botId) => {
      if (!tokens2.has(botId)) tokens2.set(botId, await tokenDoBot(env, prontos.get(botId)));
      return tokens2.get(botId);
    }, "tokenDe");
    const semApi = { ok: false, erro: "sem API vinculada" };
    const shopee = {
      buscarLote: /* @__PURE__ */ __name(async (p, g) => (await clienteDe(g.dono, p.loja))?.buscarLote(p) ?? semApi, "buscarLote"),
      lerOferta: /* @__PURE__ */ __name(async (p, g) => (await clienteDe(g.dono, p.loja))?.lerOferta(p) ?? semApi, "lerOferta")
    };
    const enviar = /* @__PURE__ */ __name(async (chatId, oferta, aviso, grupo) => {
      const token = await tokenDe(grupo.botId);
      if (!token) return { ok: false, erro: "bot sem token" };
      const r2 = await criarEnviador({ tg: /* @__PURE__ */ __name((metodo, corpo) => tgChamar(fetchImpl, token, metodo, corpo), "tg"), compacto: env.SEM_PLANOS === "1" })(chatId, oferta, aviso, grupo?.filtros?.linkGrupo ?? "");
      if (r2.ok && env.SEM_PLANOS === "1") {
        await dados.registrarAnuncio({ dono: grupo.dono, chatId, titulo: oferta.titulo, preco: oferta.preco, link: oferta.urlAfiliado || oferta.url, imagem: oferta.imagem, loja: oferta.loja, em: agora }).catch((e) => console.log(JSON.stringify({ erroHistorico: e?.message || String(e) })));
      }
      return r2;
    }, "enviar");
    const r = await rodarCiclo({ agora, repo, shopee, enviar, aviso: env.AVISO ?? "", maxPosts: 10, reabastecerTambem: true, ...esperar ? { esperar } : {} });
    if (r.acao !== "nada") console.log(JSON.stringify({ ciclo: { acao: r.acao, resultados: (r.resultados ?? [r]).map((x) => ({ acao: x.acao, chatId: x.chatId, erro: x.erro })) } }));
    return r;
  } catch (e) {
    console.log(JSON.stringify({ erroNoCiclo: e?.message || String(e) }));
    return { acao: "erro", erro: e?.message || String(e) };
  }
}
__name(executarCiclo, "executarCiclo");
async function rotear(request, env, { fetchImpl = fetch, agora = Date.now() } = {}) {
  const url = new URL(request.url);
  const dados = criarDados(env.DB);
  const repo = criarRepoD1(env.DB, { multi: true });
  if (url.pathname.startsWith("/api/")) return rotearApi(request, { env, dados, repo, buscar: fetchImpl, agora });
  if (request.method === "POST" && url.pathname.startsWith("/telegram/")) {
    const cab = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    const ehGerente = url.pathname === "/telegram/gerente";
    const mBot = url.pathname.match(/^\/telegram\/bot\/([0-9a-f-]{36})$/);
    if (!ehGerente && !mBot) return resposta("n\xE3o encontrado", 404);
    const esperado = ehGerente ? await segredoDoGerente(env) : await segredoDoBot(env, mBot[1]);
    if (cab !== esperado) return resposta("negado", 403);
    const update = await request.json().catch(() => null);
    if (!update) return resposta("ok");
    try {
      const ctx = { env, dados, repo, buscar: fetchImpl };
      const r = ehGerente ? await tratarGerente(update, ctx) : await tratarBot(mBot[1], update, ctx);
      console.log(JSON.stringify({ telegram: r }));
    } catch (e) {
      console.log(JSON.stringify({ erroTelegram: e?.message || String(e) }));
    }
    return resposta("ok");
  }
  return resposta("ok");
}
__name(rotear, "rotear");
var index_default = {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(executarCiclo(env));
  },
  async fetch(request, env) {
    return rotear(request, env);
  }
};
export {
  index_default as default,
  executarCiclo,
  rotear
};
//# sourceMappingURL=index.js.map
