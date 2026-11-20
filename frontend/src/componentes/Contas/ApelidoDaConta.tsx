import { type FormEvent, type RefObject, useId, useRef, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useContas, useDefinirApelido, useRemoverApelido } from "../../api/consultas";
import type { Conta } from "../../api/tipos";
import { rotuloDeOutraConta } from "../../contas/identificacao";
import { Botao } from "../Botao/Botao";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { Dialogo } from "../Dialogo/Dialogo";
import { IdentificacaoDaConta } from "./IdentificacaoDaConta";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import estilos from "./Contas.module.css";

const TAMANHO_MAXIMO = 40;
const MENSAGEM_APELIDO_REPETIDO = "Você já tem uma conta com esse apelido.";

type Propriedades = {
  conta: Conta;
  aberto: boolean;
  aoFechar: () => void;
  /** Texto de confirmação ("Apelido salvo.") para o aviso da página. */
  aoAvisar: (texto: string) => void;
  devolverFocoPara?: RefObject<HTMLElement | null>;
};

/** O que falta para salvar, em texto; `null` quando já dá. */
function faltaParaSalvar(texto: string, atual: string | null): string | null {
  const apelido = texto.trim();
  if (apelido === "") return "Escreva um apelido.";
  if (Array.from(apelido).length > TAMANHO_MAXIMO) return `Use no máximo ${TAMANHO_MAXIMO} caracteres.`;
  if (apelido === atual) return "Mude o apelido para salvar.";
  return null;
}

function mensagemDoErro(erro: unknown): string | undefined {
  if (!(erro instanceof ErroDaApiCliente)) return undefined;
  return erro.codigo === "apelido_ja_existe" ? MENSAGEM_APELIDO_REPETIDO : erro.mensagem;
}

/**
 * Diálogo de apelido da conta (Art. XI.9.2): um campo de texto, a frase que diz para que serve e, quando
 * já há apelido, "Remover apelido" com confirmação. O erro da API aparece junto ao campo; o foco volta
 * a quem abriu o diálogo.
 */
export function ApelidoDaConta({ conta, aberto, aoFechar, aoAvisar, devolverFocoPara }: Propriedades) {
  const id = useId();
  const [texto, definirTexto] = useState(conta.apelido ?? "");
  const [confirmando, definirConfirmando] = useState(false);
  const definir = useDefinirApelido();
  const remover = useRemoverApelido();
  const contas = useContas();
  const botaoRemover = useRef<HTMLButtonElement>(null);

  const falta = faltaParaSalvar(texto, conta.apelido);
  const erro = mensagemDoErro(definir.erro);
  const erroAoRemover = mensagemDoErro(remover.erro);
  const parecido = rotuloDeOutraConta(contas.dados ?? [], conta.id, texto);
  const titulo = conta.apelido === null ? "Dar apelido" : "Mudar apelido";

  async function salvar(evento?: FormEvent): Promise<void> {
    evento?.preventDefault();
    if (falta !== null || definir.pendente) return;
    const gravada = await definir.executar({ id: conta.id, apelido: texto.trim() });
    if (gravada === undefined) return;
    aoAvisar("Apelido salvo.");
    aoFechar();
  }

  async function confirmarRemocao(): Promise<void> {
    const removido = await remover.executar(conta.id);
    if (removido === undefined) return;
    definirConfirmando(false);
    aoAvisar("Apelido removido.");
    aoFechar();
  }

  const rodape = (
    <div className={estilos.acoesDoApelido}>
      {conta.apelido !== null && (
        <Botao ref={botaoRemover} variante="terciario" disabled={definir.pendente} onClick={() => definirConfirmando(true)}>
          Remover apelido
        </Botao>
      )}
      <Botao variante="secundario" onClick={aoFechar}>
        Cancelar
      </Botao>
      <Botao
        variante="primario"
        type="submit"
        form={`${id}-formulario`}
        disabled={falta !== null || definir.pendente}
        aria-describedby={falta !== null ? `${id}-falta` : undefined}
      >
        Salvar apelido
      </Botao>
    </div>
  );

  return (
    <>
      <Dialogo titulo={titulo} aberto={aberto} aoFechar={aoFechar} rodape={rodape} devolverFocoPara={devolverFocoPara}>
        <form id={`${id}-formulario`} className={estilos.formulario} onSubmit={(evento) => void salvar(evento)} noValidate>
          <IdentificacaoDaConta conta={conta} />
          <p className={estilos.apoio}>O apelido aparece no lugar do nome da conta.</p>
          <CampoDeTexto
            rotulo="Apelido"
            valor={texto}
            aoMudar={definirTexto}
            autoComplete="off"
            autoFocus
            erro={erro}
            ajuda={
              erro === undefined && parecido !== null
                ? `Outra conta já aparece como ${parecido}. Escolha um nome diferente para não confundir.`
                : undefined
            }
          />
          {falta !== null && (
            <p id={`${id}-falta`} className={estilos.apoio}>
              {falta}
            </p>
          )}
        </form>
      </Dialogo>
      <DialogoDeConfirmacao
        aberto={confirmando}
        titulo={`Remover o apelido ${conta.apelido ?? ""}?`}
        descricao="A conta volta a aparecer com o nome original."
        rotuloDaAcao="Confirmar remoção"
        pendente={remover.pendente}
        erro={erroAoRemover}
        aoConfirmar={() => void confirmarRemocao()}
        aoCancelar={() => definirConfirmando(false)}
        devolverFocoPara={botaoRemover}
      />
    </>
  );
}
