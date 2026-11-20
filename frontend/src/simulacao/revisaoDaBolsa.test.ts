import { beforeEach, expect, it } from "vitest";
import { chamar, ErroDaApiCliente } from "../api/cliente";
import type { LigacaoConfirmada, MovimentoDeInvestimento, RevisaoDaBolsa } from "../api/tipos";
import { entrarNaSimulacao } from "./fetchSimulado";

beforeEach(() => entrarNaSimulacao());

const ler = () => chamar<RevisaoDaBolsa>("/revisao-da-bolsa");
const movimentos = () => chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros: { inicio: "2000-01-01", fim: "2999-12-31" } });
const confirmar = (itens: unknown[]) => chamar<{ confirmados: LigacaoConfirmada[] }>("/revisao-da-bolsa/confirmar", { metodo: "POST", corpo: { itens } });

it("traz pregão 1:1 com taxas, pregão 1:2, escolha, sem par e já ligado", async () => {
  const r = await ler();
  const exatas = r.propostas.filter(p => p.confianca === "exata");
  expect(exatas).toHaveLength(2);
  expect(exatas.some(p => p.operacoes.length === 1 && p.taxas.length === 3)).toBe(true);
  expect(exatas.some(p => p.operacoes.length === 2)).toBe(true);
  expect(r.propostas.filter(p => p.confianca === "precisa_escolher")).toHaveLength(1);
  expect(r.sem_par).toHaveLength(1);
  expect(r.confirmados).toHaveLength(1);
  expect(r.confirmados[0].sem_aporte).toBe(true);
});

it("confirmar cria um aporte por operação ligado ao casamento e desfazer devolve tudo", async () => {
  const antes = await ler();
  const exatas = antes.propostas.filter(p => p.confianca === "exata");
  const operacoes = exatas.reduce((n, p) => n + p.operacoes.length, 0);
  const { confirmados } = await confirmar(exatas.map(p => ({ chave: p.chave, versao: p.versao })));
  expect(confirmados).toHaveLength(2);
  const depois = await ler();
  expect(depois.propostas).toHaveLength(1);
  expect(depois.confirmados).toHaveLength(3);
  const aportes = (await movimentos()).filter(m => m.casamento_id);
  expect(aportes).toHaveLength(operacoes);
  expect(aportes.every(m => m.tipo === "aporte" && m.natureza === "liquidacao_de_bolsa")).toBe(true);
  await chamar(`/casamentos/${confirmados[0].casamento_id}`, { metodo: "DELETE" });
  const final = await ler();
  expect(final.propostas).toHaveLength(2);
  expect((await movimentos()).filter(m => m.casamento_id).length).toBeLessThan(operacoes);
});

it("versão diferente dá 409 e proposta que precisa de escolha exige a escolha", async () => {
  const r = await ler();
  const p = r.propostas.find(x => x.confianca === "exata")!;
  const erro = await confirmar([{ chave: p.chave, versao: "outra" }]).catch(e => e);
  expect(erro).toBeInstanceOf(ErroDaApiCliente);
  expect((erro as ErroDaApiCliente).codigo).toBe("revisao_desatualizada");
  const escolha = r.propostas.find(x => x.confianca === "precisa_escolher")!;
  const sem = await confirmar([{ chave: escolha.chave, versao: escolha.versao }]).catch(e => e);
  expect((sem as ErroDaApiCliente).codigo).toBe("casamento_ambiguo");
  const ok = await confirmar([{ chave: escolha.chave, versao: escolha.versao, operacao_ids: [escolha.operacoes[0].id] }]);
  expect(ok.confirmados).toHaveLength(1);
});

it("refazer uma ligação antiga cria o aporte", async () => {
  const antigo = (await ler()).confirmados[0];
  const novo = await chamar<LigacaoConfirmada>(`/casamentos/${antigo.id}/refazer`, { metodo: "POST" });
  expect(novo.casamento_id).not.toBe(antigo.id);
  const depois = await ler();
  expect(depois.confirmados.find(c => c.id === novo.casamento_id)?.sem_aporte).toBe(false);
  expect((await movimentos()).some(m => m.casamento_id === novo.casamento_id)).toBe(true);
  const de = await chamar<LigacaoConfirmada>(`/casamentos/${novo.casamento_id}/refazer`, { metodo: "POST" }).catch(e => e);
  expect((de as ErroDaApiCliente).codigo).toBe("movimento_nao_desfazivel");
});
