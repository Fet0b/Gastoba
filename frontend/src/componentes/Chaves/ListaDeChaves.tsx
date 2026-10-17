import { useEffect, useId, useRef, useState } from "react";

import type { ChaveDeApi } from "../../api/tipos";
import { Cartao } from "../Cartao/Cartao";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import estilos from "./Chaves.module.css";
import { ESCOPOS } from "./FormularioDeChave";

/** Instantes no fuso local, ex.: "12/10/2026, 14:30". */
const FORMATO_DO_INSTANTE = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Um instante ISO 8601 com fuso (ex.: "2026-10-12T17:30:00+00:00") no fuso de
 * quem vê. Não é uma data "AAAA-MM-DD": o `Date` interpreta o fuso do texto.
 * Um texto fora do formato aparece como veio.
 */
export function formatarInstante(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : FORMATO_DO_INSTANTE.format(instante);
}

function nomeDoEscopo(chave: ChaveDeApi): string {
  return ESCOPOS.find((opcao) => opcao.escopo === chave.escopo)?.nome ?? chave.escopo;
}

function Instante({ iso, vazio }: { iso: string | null; vazio: string }) {
  if (iso === null) return <>{vazio}</>;
  return <time dateTime={iso}>{formatarInstante(iso)}</time>;
}

type PropriedadesDoItem = {
  chave: ChaveDeApi;
  /** Revoga; devolve `true` se deu certo. */
  aoRevogar: (chave: ChaveDeApi) => Promise<boolean>;
};

/** Uma chave: dados e o botão "Revogar", que pede confirmação na própria linha. */
function ItemDeChave({ chave, aoRevogar }: PropriedadesDoItem) {
  const [confirmando, definirConfirmando] = useState(false);
  const [revogando, definirRevogando] = useState(false);
  const id = useId();
  const botaoRevogar = useRef<HTMLButtonElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  // Só depois de um Cancelar o foco volta ao "Revogar" (não ao montar).
  const devolverFoco = useRef(false);

  useEffect(() => {
    if (confirmando) {
      botaoCancelar.current?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      botaoRevogar.current?.focus();
    }
  }, [confirmando]);

  function cancelar(): void {
    devolverFoco.current = true;
    definirConfirmando(false);
  }

  async function confirmar(): Promise<void> {
    definirRevogando(true);
    const revogada = await aoRevogar(chave);
    // Revogada, a linha sai da lista; senão a confirmação fecha e a lista recarrega.
    if (!revogada) {
      definirRevogando(false);
      devolverFoco.current = true;
      definirConfirmando(false);
    }
  }

  const idTitulo = `${id}-titulo`;
  const idPergunta = `${id}-pergunta`;
  const expirada = chave.expira_em !== null && new Date(chave.expira_em).getTime() <= Date.now();

  return (
    <Cartao como="li" variante="elevado" className={estilos.item} aria-label={chave.nome}>
      <div className={estilos.topoDoItem}>
        <h3 id={idTitulo} className={estilos.nomeDaChave}>
          {chave.nome}
        </h3>
        <span className={estilos.escopo} data-escopo={chave.escopo}>
          {nomeDoEscopo(chave)}
        </span>
        {expirada && <span className={estilos.expirada}>Expirada</span>}
      </div>

      <dl className={estilos.dados}>
        <div>
          <dt>Prefixo</dt>
          <dd>
            <code className={estilos.prefixo}>{chave.prefixo}</code>
          </dd>
        </div>
        <div>
          <dt>Criada em</dt>
          <dd>
            <Instante iso={chave.criada_em} vazio="-" />
          </dd>
        </div>
        <div>
          <dt>Último uso</dt>
          <dd>
            <Instante iso={chave.ultimo_uso} vazio="Nunca" />
          </dd>
        </div>
        <div>
          <dt>Expira em</dt>
          <dd>
            <Instante iso={chave.expira_em} vazio="Não expira" />
          </dd>
        </div>
      </dl>

      {confirmando ? (
        <div className={estilos.confirmacao} role="group" aria-labelledby={idPergunta}>
          <p id={idPergunta}>
            Revogar a chave {chave.nome}? Quem a usa perde o acesso na hora, e isso não pode ser
            desfeito.
          </p>
          <div className={estilos.acoes}>
            <button
              type="button"
              className={estilos.perigo}
              onClick={() => void confirmar()}
              disabled={revogando}
            >
              Confirmar revogação
            </button>
            <button
              ref={botaoCancelar}
              type="button"
              className={estilos.secundario}
              onClick={cancelar}
              disabled={revogando}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={botaoRevogar}
          type="button"
          className={estilos.revogar}
          aria-label={`Revogar a chave ${chave.nome}`}
          onClick={() => definirConfirmando(true)}
        >
          Revogar
        </button>
      )}
    </Cartao>
  );
}

type Propriedades = {
  chaves: ChaveDeApi[] | undefined;
  carregando: boolean;
  aoRevogar: (chave: ChaveDeApi) => Promise<boolean>;
};

/** As chaves ativas, das mais novas para as mais antigas (a ordem da API). */
export function ListaDeChaves({ chaves, carregando, aoRevogar }: Propriedades) {
  if (chaves === undefined) {
    return <p className={estilos.estado}>{carregando ? "Carregando as chaves…" : "Não foi possível carregar as chaves."}</p>;
  }
  if (chaves.length === 0) {
    return (
      <EstadoVazio
        icone="perfil"
        titulo="Nenhuma chave ainda."
        texto="Crie uma chave para um script ou outro programa usar o Gastoba sem a sua senha."
      />
    );
  }
  return (
    <ul className={estilos.lista} aria-label="Chaves de API ativas">
      {chaves.map((chave) => (
        <ItemDeChave key={chave.id} chave={chave} aoRevogar={aoRevogar} />
      ))}
    </ul>
  );
}
