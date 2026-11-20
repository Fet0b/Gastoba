import { useEffect, type RefObject } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useExcluirDestinacaoCadastrada } from "../../api/consultas";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";

type Propriedades = {
  /** A caixinha a excluir; nula = diálogo fechado. */
  caixinha: { id: string; nome: string } | null;
  /** Tem parte em alguma posição: a exclusão é explicada antes e fica desabilitada. */
  emUso?: boolean;
  aoCancelar: () => void;
  /** `ja_removida`: outra aba já a tinha excluído (404); o catálogo é relido de qualquer forma. */
  aoExcluir: (motivo: "excluida" | "ja_removida") => void;
  devolverFocoPara?: RefObject<HTMLElement | null>;
};

function mensagemDoErro(erro: unknown): string {
  return erro instanceof ErroDaApiCliente ? erro.mensagem : "Não foi possível salvar. Tente novamente.";
}

const DESCRICAO_DA_EXCLUSAO =
  "Só é possível excluir uma caixinha sem saldo, referência ou histórico. A cor e o ícone dela também são apagados. Nenhum lançamento ou investimento é apagado.";
const DESCRICAO_EM_USO = "Esta caixinha tem investimentos e não pode ser excluída. Realoque-os primeiro.";

/** Confirmação de exclusão: foco em Cancelar; 409 e demais erros ficam dentro do diálogo. */
export function ExcluirCaixinha({ caixinha, emUso = false, aoCancelar, aoExcluir, devolverFocoPara }: Propriedades) {
  const exclusao = useExcluirDestinacaoCadastrada();

  async function excluir(): Promise<void> {
    if (!caixinha) return;
    const resultado = await exclusao.executar(caixinha.id);
    if (resultado) aoExcluir("excluida");
  }

  const codigoDoErro = exclusao.erro instanceof ErroDaApiCliente ? exclusao.erro.codigo : null;
  const ausente = codigoDoErro === "destinacao_cadastrada_nao_encontrada";
  const recusada = codigoDoErro === "destinacao_em_uso";
  useEffect(() => {
    if (ausente && caixinha) aoExcluir("ja_removida");
  }, [ausente]);

  return (
    <DialogoDeConfirmacao
      aberto={caixinha !== null}
      titulo={`Excluir ${rotuloDeExibicao(caixinha?.nome ?? "caixinha")}?`}
      descricao={emUso ? DESCRICAO_EM_USO : DESCRICAO_DA_EXCLUSAO}
      rotuloDaAcao={exclusao.pendente ? "Excluindo…" : "Excluir definitivamente"}
      pendente={exclusao.pendente}
      acaoDesabilitada={emUso || recusada}
      erro={exclusao.erro && !ausente ? mensagemDoErro(exclusao.erro) : undefined}
      aoCancelar={aoCancelar}
      aoConfirmar={() => void excluir()}
      devolverFocoPara={devolverFocoPara}
    />
  );
}
