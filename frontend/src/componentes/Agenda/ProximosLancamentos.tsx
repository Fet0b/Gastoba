import {
  DIAS_DA_AGENDA,
  proximosLancamentos,
  type Lancamento,
} from "../../agenda/agenda";
import type { Recorrencia } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { Icone } from "../Icone/Icone";
import estilos from "./Agenda.module.css";

type Propriedades = {
  recorrencias: readonly Recorrencia[] | undefined;
  /** "AAAA-MM-DD"; a página passa `hojeLocal()`. */
  hoje: string;
  carregando?: boolean;
};

/** "sexta-feira, 20 de novembro", sem passar pelo fuso (componentes numéricos). */
function dataPorExtenso(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function distancia(diasAte: number): string {
  return diasAte === 1 ? "amanhã" : `daqui a ${diasAte} dias`;
}

function Item({ lancamento, posicao }: { lancamento: Lancamento; posicao: number }) {
  const { recorrencia, data, diasAte } = lancamento;
  const ganho = recorrencia.tipo === "ganho";
  const centavos = paraCentavos(recorrencia.valor);
  const valor = ganho ? `+${formatar(recorrencia.valor)}` : formatar(deCentavos(-centavos));
  return (
    <li
      className={estilos.item}
      data-tipo={recorrencia.tipo}
      style={{ ["--atraso" as string]: `${Math.min(posicao, 8) * 40}ms` }}
    >
      <span className={estilos.marca}>
        <Icone nome={ganho ? "entrada" : "saida"} tamanho={16} />
      </span>
      <span className={estilos.descricao}>
        <span className={estilos.nomeDoItem}>{recorrencia.descricao}</span>
        <span className={estilos.detalhe}>
          {ganho ? "Ganho" : "Gasto"} ·{" "}
          <time dateTime={data}>{dataPorExtenso(data)}</time> · {distancia(diasAte)}
        </span>
      </span>
      <span className={estilos.valorDoItem}>{valor}</span>
    </li>
  );
}

/** A próxima data de cada recorrência vigente, nos próximos 30 dias, em ordem de data. */
export function ProximosLancamentos({ recorrencias, hoje, carregando }: Propriedades) {
  const proximos = recorrencias === undefined ? [] : proximosLancamentos(recorrencias, hoje);
  const algumVigente =
    recorrencias !== undefined &&
    proximosLancamentos(recorrencias, hoje, Number.POSITIVE_INFINITY).length > 0;

  let corpo;
  if (recorrencias === undefined) {
    corpo = <p className={estilos.nota}>{carregando ? "Carregando…" : "Não foi possível carregar"}</p>;
  } else if (proximos.length > 0) {
    corpo = (
      <ol className={estilos.lista} aria-label="Próximos lançamentos">
        {proximos.map((lancamento, posicao) => (
          <Item key={lancamento.recorrencia.id} lancamento={lancamento} posicao={posicao} />
        ))}
      </ol>
    );
  } else if (algumVigente) {
    corpo = <p className={estilos.nota}>Nada nos próximos {DIAS_DA_AGENDA} dias</p>;
  } else {
    corpo = (
      <EstadoVazio
        icone="outros"
        titulo="Nada agendado"
        texto="Crie uma recorrência e as próximas datas aparecem aqui."
      />
    );
  }

  return (
    <div className={estilos.proximos}>
      <h3 className={estilos.titulo}>Próximos lançamentos</h3>
      {corpo}
    </div>
  );
}
