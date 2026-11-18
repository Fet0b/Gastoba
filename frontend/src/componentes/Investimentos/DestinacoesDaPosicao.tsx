import { Tabela } from "../Tabela/Tabela";
import type { Investimento } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { corDaDestinacao } from "../../cores/mapaDeCores";
import { rotuloDaRentabilidade } from "../../investimentos/destinacoes";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { useConsultaDeMidia } from "../Navegacao/useLayoutLargo";
import { CorDaDestinacao } from "./CorDaDestinacao";
import estilos from "./Investimentos.module.css";

/** Abaixo disso a tabela de quatro colunas não cabe: cada destinação vira um bloco. */
const CONSULTA_DA_TABELA = "(min-width: 37.5rem)";

/** A parte do saldo que cabe à destinação, de 0 a 100 (só para a largura da barra). */
function larguraDaParte(valorAtual: string, saldo: string): number {
  const total = paraCentavos(saldo);
  if (total <= 0n) return 0;
  return Number((paraCentavos(valorAtual) * 100n) / total);
}

export function comSinal(valor: string): string {
  return paraCentavos(valor) > 0n ? `+${formatar(valor)}` : formatar(valor);
}

type Propriedades = { investimento: Investimento };
type Destinacao = Investimento["destinacoes"][number];

function Nome({ d, saldo, porFracao }: { d: Destinacao; saldo: string; porFracao?: boolean }) {
  return (
    <>
      <span className={estilos.nomeEBotao}>
        <span>{d.tag === null ? (porFracao ? "Sem caixinha" : "Sem destinação") : rotuloDeExibicao(d.tag)}</span>
        {d.tag !== null && <CorDaDestinacao tag={d.tag} cor={d.cor} />}
      </span>
      <span className={estilos.trilho} aria-hidden="true">
        <span
          className={estilos.preenchimento}
          data-neutra={d.tag === null || undefined}
          style={{
            width: `${larguraDaParte(d.valor_atual, saldo)}%`,
            backgroundColor: corDaDestinacao(d.tag ?? "", d.cor) ?? undefined,
          }}
        />
      </span>
    </>
  );
}

const principalDe = (d: Destinacao) => (d.tag === null ? "—" : formatar(d.principal));
const rendimentoDe = (d: Destinacao) =>
  d.tag === null ? "—" : `${comSinal(d.rendimento)} (${rotuloDaRentabilidade(d.rentabilidade)})`;

/**
 * O que cabe a cada destinação de uma posição: tabela (semântica, com cabeçalhos) quando cabe e,
 * em tela estreita, uma lista de blocos: o nome com a barra em cima e Principal, Valor atual e
 * Rendimento em pares rótulo-valor embaixo, sem rolagem de lado.
 */
export function DestinacoesDaPosicao({ investimento }: Propriedades) {
  const tabela = useConsultaDeMidia(CONSULTA_DA_TABELA);
  const rotulo = `Destinações de ${investimento.nome}`;

  if (!tabela) {
    return (
      <ul className={estilos.destinacoesEmLista} aria-label={rotulo}>
        {investimento.destinacoes.map((d) => (
          <li key={d.tag ?? "sem"} className={estilos.destinacaoEmLista}>
            <div className={estilos.nomeDaDestinacao}>
              <Nome d={d} saldo={investimento.saldo} porFracao={investimento.alocacao_por_fracao} />
            </div>
            <dl className={estilos.paresDaDestinacao}>
              <div>
                <dt>Principal</dt>
                <dd>{principalDe(d)}</dd>
              </div>
              <div>
                <dt>Valor atual</dt>
                <dd>{formatar(d.valor_atual)}</dd>
              </div>
              <div>
                <dt>Rendimento</dt>
                <dd>{rendimentoDe(d)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={estilos.rolagem}>
      <Tabela legenda={rotulo} className={estilos.destinacoes}>
        <colgroup>
          <col className={estilos.colunaDoNome} />
          <col />
          <col />
          <col />
        </colgroup>

        <thead>
          <tr>
            <th scope="col">Destinação</th>
            <th scope="col">Principal</th>
            <th scope="col">Valor atual</th>
            <th scope="col">Rendimento</th>
          </tr>
        </thead>
        <tbody>
          {investimento.destinacoes.map((d) => (
            <tr key={d.tag ?? "sem"}>
              <th scope="row" data-nome-da-destinacao="">
                <Nome d={d} saldo={investimento.saldo} porFracao={investimento.alocacao_por_fracao} />
              </th>
              <td data-numerica="true">{principalDe(d)}</td>
              <td data-numerica="true">{formatar(d.valor_atual)}</td>
              <td data-numerica="true">{rendimentoDe(d)}</td>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </div>
  );
}
