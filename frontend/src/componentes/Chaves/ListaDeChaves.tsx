import { useId, useState } from "react";

import type { ChaveDeApi } from "../../api/tipos";
import { Badge } from "../Badge/Badge";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Titulo } from "../Titulo/Titulo";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
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

/** Uma chave: dados e o menu "Mais ações", cujo item "Revogar" abre a confirmação num diálogo. */
function ItemDeChave({ chave, aoRevogar }: PropriedadesDoItem) {
  const [confirmando, definirConfirmando] = useState(false);
  const [revogando, definirRevogando] = useState(false);
  const id = useId();

  async function confirmar(): Promise<void> {
    definirRevogando(true);
    await aoRevogar(chave);
    // Revogada, a linha sai da lista; senão o diálogo fecha e a lista recarrega.
    definirRevogando(false);
    definirConfirmando(false);
  }

  const idTitulo = `${id}-titulo`;
  const expirada = chave.expira_em !== null && new Date(chave.expira_em).getTime() <= Date.now();

  return (
    <li className={estilos.item} aria-label={chave.nome}>
      <div className={estilos.topoDoItem}>
        <Titulo nivel="cartao" como="h3" id={idTitulo} className={estilos.nomeDaChave}>
          {chave.nome}
        </Titulo>
        <span className={estilos.escopo} data-escopo={chave.escopo}>
          {nomeDoEscopo(chave)}
        </span>
        {expirada && <Badge tom="atencao">Expirada</Badge>}
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

      <MenuDeAcoes
        rotulo={`Mais ações da chave ${chave.nome}`}
        itens={[
          {
            rotulo: "Revogar",
            nomeAcessivel: `Revogar a chave ${chave.nome}`,
            destrutivo: true,
            aoEscolher: () => definirConfirmando(true),
          },
        ]}
      />
      <DialogoDeConfirmacao
        aberto={confirmando}
        titulo={`Revogar a chave ${chave.nome}?`}
        descricao="Quem a usa perde o acesso na hora, e isso não pode ser desfeito."
        rotuloDaAcao="Confirmar revogação"
        pendente={revogando}
        aoConfirmar={() => void confirmar()}
        aoCancelar={() => definirConfirmando(false)}
      />
    </li>
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
    return carregando ? <Esqueleto rotulo="Carregando as chaves…" /> : <EstadoDeErro mensagem="Não foi possível carregar as chaves." />;
  }
  if (chaves.length === 0) {
    return (
      <EstadoVazio
        icone="chave"
        titulo="Nenhuma chave de API ainda"
        descricao="As chaves criadas aparecem aqui, com o escopo, a data de criação e o último uso."
      />
    );
  }
  return (
    <>
      <div className={estilos.cabecalhoDaLista} data-cabecalho-da-lista="" aria-hidden="true">
        <span>Chave</span>
        <span>Prefixo</span>
        <span>Criada em</span>
        <span>Último uso</span>
        <span>Expira em</span>
        <span />
      </div>
      <ul className={estilos.lista} aria-label="Chaves de API ativas">
        {chaves.map((chave) => (
          <ItemDeChave key={chave.id} chave={chave} aoRevogar={aoRevogar} />
        ))}
      </ul>
    </>
  );
}
