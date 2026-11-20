import type { Pendencia } from "../comparar";
import * as inicio from "./inicio";
import * as transacoes from "./transacoes";
import * as orcamento from "./orcamento";
import * as contas from "./contas";
import * as investimentos from "./investimentos";
import * as caixinhas from "./caixinhas";
import * as faturas from "./faturas";
import * as tags from "./tags";
import * as recorrencias from "./recorrencias";
import * as perfil from "./perfil";
import * as transacoesCaixa from "./transacoes-caixa";
import * as transacoesCaixaRendimento from "./transacoes-caixa-rendimento";
import * as transacoesAportes from "./transacoes-aportes";
import * as novoGasto from "./novo-gasto";
import * as sininho from "./sininho";
import * as folhaMais from "./folha-mais";
import * as menuDeLinha from "./menu-de-linha";

/** Uma entrada por vista; cada faixa da 070 só edita o arquivo da sua tela. A fase final apaga tudo. */
export const PENDENCIAS: Record<string, { simulacao: Pendencia[]; teste: Pendencia[] }> = {
  "inicio": inicio,
  "transacoes": transacoes,
  "orcamento": orcamento,
  "contas": contas,
  "investimentos": investimentos,
  "caixinhas": caixinhas,
  "caixinhas-detalhe": caixinhas,
  "caixinhas-aparencia": caixinhas,
  "caixinhas-criar": caixinhas,
  "faturas": faturas,
  "tags": tags,
  "recorrencias": recorrencias,
  "perfil": perfil,
  "transacoes-caixa": transacoesCaixa,
  "transacoes-caixa-rendimento": transacoesCaixaRendimento,
  "transacoes-aportes": transacoesAportes,
  "novo-gasto": novoGasto,
  "sininho": sininho,
  "folha-mais": folhaMais,
  "menu-de-linha": menuDeLinha,
};
