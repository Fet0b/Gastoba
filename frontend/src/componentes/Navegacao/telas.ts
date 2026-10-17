import type { NomeDoIcone } from "../Icone/Icone";

/** As telas do app; a navegação é por estado, sem roteador. */
export type Tela =
  | "inicio"
  | "transacoes"
  | "orcamento"
  | "contas"
  | "faturas"
  | "tags"
  | "outros"
  | "perfil";

/** Opções de uma ida a outra tela. */
export type OpcoesDaIda = {
  /** Contas abre já com o formulário de nova conta (vindo de Transações sem contas). */
  abrirFormulario?: boolean;
};

/** O que o App entrega à navegação: quem está conectado e para onde ir. */
export type Navegacao = {
  nomeDaPessoa: string;
  /** A pessoa é a dona da importação bancária: Transações ganha a caixa de entrada. */
  importacaoBancaria?: boolean;
  tela: Tela;
  aoIrPara: (tela: Tela, opcoes?: OpcoesDaIda) => void;
  aoSair: () => void;
};

export type DadosDaTela = {
  tela: Tela;
  nome: string;
  icone: NomeDoIcone;
  /** As principais ficam na barra de abas do celular; as outras vão para "Mais". */
  principal: boolean;
};

/** A lista única das telas, na ordem em que a navegação as mostra. */
export const TELAS: readonly DadosDaTela[] = [
  { tela: "inicio", nome: "Início", icone: "inicio", principal: true },
  { tela: "transacoes", nome: "Transações", icone: "transacoes", principal: true },
  { tela: "orcamento", nome: "Orçamento", icone: "orcamento", principal: true },
  { tela: "contas", nome: "Contas", icone: "contas", principal: true },
  { tela: "faturas", nome: "Faturas", icone: "faturas", principal: false },
  { tela: "tags", nome: "Tags", icone: "tags", principal: false },
  { tela: "outros", nome: "Outros", icone: "outros", principal: false },
  { tela: "perfil", nome: "Perfil", icone: "perfil", principal: false },
];

/** Separa as telas da barra de abas das que ficam na folha "Mais". */
export function dividirTelas(): { principais: DadosDaTela[]; emMais: DadosDaTela[] } {
  return {
    principais: TELAS.filter((t) => t.principal),
    emMais: TELAS.filter((t) => !t.principal),
  };
}
