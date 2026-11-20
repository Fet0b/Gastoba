import { useEffect, useId, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useDefinirCorDaDestinacao, useDefinirIconeDaCaixinha, useRemoverCorDaDestinacao } from "../../api/consultas";
import type { CorDaDestinacao, IconeDaCaixinha } from "../../api/tipos";
import { ICONE_PADRAO_DA_CAIXINHA, type ResumoDaCaixinha } from "../../investimentos/caixinhas";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { EscolhaDaCorDaCaixinha, EscolhaDoIcone } from "./EscolhaDeAparencia";
import estilos from "./Caixinhas.module.css";

type Propriedades = {
  /** A caixinha a editar; nula = diálogo fechado. */
  caixinha: ResumoDaCaixinha | null;
  aoFechar: () => void;
};

function mensagemDoErro(erro: unknown): string {
  return erro instanceof ErroDaApiCliente ? erro.mensagem : "Não foi possível salvar. Tente novamente.";
}

/**
 * Mudar o ícone e a cor de uma caixinha. Grava o ícone e, depois, a cor (duas chamadas idempotentes):
 * se a segunda falha, a primeira continua salva e o erro aparece junto ao grupo que falhou.
 */
export function AparenciaDaCaixinha({ caixinha, aoFechar }: Propriedades) {
  const definirIcone = useDefinirIconeDaCaixinha();
  const definirCor = useDefinirCorDaDestinacao();
  const removerCor = useRemoverCorDaDestinacao();
  const [icone, mudarIcone] = useState<IconeDaCaixinha>(ICONE_PADRAO_DA_CAIXINHA);
  const [cor, mudarCor] = useState<CorDaDestinacao | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const idDoMotivo = useId();

  useEffect(() => {
    if (!caixinha) return;
    mudarIcone(caixinha.icone);
    mudarCor(caixinha.cor);
  }, [caixinha?.id]);

  // Cada mutação guarda o próprio erro e o limpa na próxima tentativa.
  const erroDoIcone = definirIcone.erro ? mensagemDoErro(definirIcone.erro) : null;
  const erroDaCor = definirCor.erro || removerCor.erro ? mensagemDoErro(definirCor.erro ?? removerCor.erro) : null;
  const mudouIcone = caixinha !== null && icone !== caixinha.icone;
  const mudouCor = caixinha !== null && cor !== caixinha.cor;

  async function salvar(): Promise<void> {
    if (!caixinha || salvando) return;
    definirSalvando(true);
    try {
      if (mudouIcone) {
        const gravado = await definirIcone.executar({ id: caixinha.id, icone: icone === ICONE_PADRAO_DA_CAIXINHA ? null : icone });
        if (gravado === undefined) return;
      }
      if (mudouCor) {
        const gravado = cor === null ? await removerCor.executar(caixinha.nome) : await definirCor.executar({ tag: caixinha.nome, cor });
        if (gravado === undefined) return;
      }
      aoFechar();
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <Dialogo
      aberto={caixinha !== null}
      aoFechar={aoFechar}
      titulo={`Mudar ícone e cor de ${rotuloDeExibicao(caixinha?.nome ?? "")}`}
      className={estilos.dialogo}
      bloqueado={salvando}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" onClick={() => void salvar()} disabled={salvando || (!mudouIcone && !mudouCor)} aria-describedby={!mudouIcone && !mudouCor ? idDoMotivo : undefined}>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
        </>
      }
    >
      <div className={estilos.formulario}>
        <div>
          <EscolhaDoIcone valor={icone} aoMudar={mudarIcone} desabilitado={salvando} />
          {erroDoIcone && <p role="alert" className={estilos.erro}>{erroDoIcone}</p>}
        </div>
        <div>
          <EscolhaDaCorDaCaixinha valor={cor} aoMudar={mudarCor} desabilitado={salvando} />
          {erroDaCor && <p role="alert" className={estilos.erro}>{erroDaCor}</p>}
        </div>
        {!mudouIcone && !mudouCor && <p id={idDoMotivo} className={estilos.explicacao}>Escolha outro ícone ou outra cor para salvar.</p>}
      </div>
    </Dialogo>
  );
}
