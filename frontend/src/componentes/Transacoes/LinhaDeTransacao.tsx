import { type ReactNode, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useDesassociarCompra } from "../../api/consultas";
import { corDaCategoria } from "../../categorias/cores";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import type { TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import { Badge } from "../Badge/Badge";
import { Chip } from "../Chip/Chip";
import { type ItemDoMenu, MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { useAcaoDeDesfazerClassificacao } from "./AcaoDeDesfazerClassificacao";
import { useAcaoDeReclassificar } from "./AcaoDeReclassificar";
import { TextoDeConta } from "../Contas/TextoDeConta";
import { CoberturaDaCompra } from "./CoberturaDaCompra";
import { IconeDeCategoria } from "./IconeDeCategoria";
import estilos from "./Transacoes.module.css";

type Propriedades = {
  transacao: TransacaoDaLinha;
  comReservas?: boolean;
  podeDesfazerClassificacao?: boolean;
  aoDesfazerClassificacao?: () => void;
  /** Nome da conta (vazio ou ausente se a conta não está na lista). */
  nomeDaConta?: string;
  /** Nome da categoria do gasto; o próprio código quando ela é desconhecida. */
  nomeDaCategoria?: string;
  /** Ações próprias da linha no menu "Mais ações" (por exemplo, excluir um ganho). */
  itensDoMenu?: readonly ItemDoMenu[];
  /** Diálogos abertos por esses itens (ficam dentro da linha, fora do fluxo visual). */
  dialogos?: ReactNode;
  /**
   * Filtros opcionais (só as Transações os passam): clicar na categoria ou numa tag da linha
   * filtra por ela; clicar na ativa limpa. Sem o callback, são só selos (como no Início).
   */
  aoAlternarCategoria?: (codigo: string) => void;
  aoAlternarTag?: (tag: string) => void;
  categoriasAtivas?: readonly string[];
  tagsAtivas?: readonly string[];
  /**
   * A categoria está em GET /categorias. Só então ela vira filtro: o backend recusa um código
   * desconhecido no filtro com 422.
   */
  categoriaConhecida?: boolean;
};

/**
 * Uma transação em dois níveis. Nível 1: ícone, descrição e valor com sinal (saída com menos em
 * Brasa, entrada com mais em verde). Nível 2: conta, categoria, tags, "Recorrente", aporte e
 * coberturas, tudo em selos; categoria e tags filtram quando a página passa os callbacks. As
 * ações ficam no menu "Mais ações". O sinal e o ícone dizem o sentido; a cor nunca está sozinha.
 */
export function LinhaDeTransacao({
  transacao,
  comReservas = false,
  podeDesfazerClassificacao = false,
  aoDesfazerClassificacao,
  nomeDaConta,
  nomeDaCategoria,
  itensDoMenu = [],
  dialogos,
  aoAlternarCategoria,
  aoAlternarTag,
  categoriasAtivas = [],
  tagsAtivas = [],
  categoriaConhecida = false,
}: Propriedades) {
  const reabrir = useAcaoDeDesfazerClassificacao(
    podeDesfazerClassificacao ? transacao.transacao_importada_id : null, transacao.descricao, aoDesfazerClassificacao,
  );
  const [cobrindo, definirCobrindo] = useState(false);
  const desfazer = useDesassociarCompra();
  const saida = transacao.tipo !== "ganho";
  const reclassificar = useAcaoDeReclassificar(
    podeDesfazerClassificacao ? transacao.transacao_importada_id : null, transacao.descricao, saida ? "saida" : "entrada", aoDesfazerClassificacao,
  );
  const valor = saida
    ? formatar(deCentavos(-paraCentavos(transacao.valor)))
    : `+${formatar(transacao.valor)}`;
  const descricaoExibida = normalizarNomeDaInstituicao(transacao.descricao);
  const categoria = saida ? (nomeDaCategoria ?? transacao.categoria) : undefined;
  const nome = [
    `${saida ? "Saída" : "Entrada"} de ${formatar(transacao.valor)}`,
    transacao.descricao,
    categoria,
    nomeDaConta,
  ]
    .filter((parte) => parte)
    .join(", ");

  const coberturas = transacao.tipo === "gasto" ? transacao.coberturas : [];
  const itens: ItemDoMenu[] = [];
  if (comReservas && transacao.tipo === "gasto" && transacao.categoria !== "investimentos") {
    itens.push({ rotulo: "Usar reserva de uma destinação", aoEscolher: () => definirCobrindo(true) });
  }
  if (comReservas && transacao.tipo === "gasto") {
    for (const cobertura of coberturas) {
      itens.push({
        rotulo: `Desfazer cobertura de ${cobertura.tag}`,
        aoEscolher: () => void desfazer.executar({ gastoId: transacao.id, coberturaId: cobertura.id }),
      });
    }
  }
  if (reclassificar.item) itens.push(reclassificar.item);
  if (reabrir.item) itens.push(reabrir.item);
  itens.push(...itensDoMenu);

  const categoriaFiltra =
    transacao.tipo !== "ganho" &&
    transacao.categoria !== "investimentos" &&
    aoAlternarCategoria !== undefined &&
    categoriaConhecida;
  const pontoDaCategoria =
    transacao.tipo !== "ganho" ? corDaCategoria(transacao.categoria) : undefined;

  return (
    <li className={estilos.linha} data-sentido={saida ? "saida" : "entrada"} aria-label={nome}>
      <IconeDeCategoria categoria={saida ? transacao.categoria : null} />
      <div className={estilos.principal}>
        <p className={estilos.descricao} data-descricao="" title={descricaoExibida}>
          {descricaoExibida}
        </p>
        <div className={estilos.nivel2} data-nivel-2="">
          {nomeDaConta && (
            <Badge>
              <TextoDeConta texto={nomeDaConta} />
            </Badge>
          )}
          {categoria !== undefined &&
            (categoriaFiltra ? (
              <Chip
                tamanho="pequeno"
                cor={pontoDaCategoria}
                selecionado={categoriasAtivas.includes(transacao.categoria)}
                aria-label={`Filtrar por ${categoria}`}
                aoAlternar={() => aoAlternarCategoria?.(transacao.categoria)}
              >
                {categoria}
              </Chip>
            ) : (
              <Badge
                icone={
                  <span
                    className={estilos.pontoDaCategoria}
                    style={{ backgroundColor: pontoDaCategoria }}
                    aria-hidden="true"
                  />
                }
              >
                {categoria}
              </Badge>
            ))}
          {transacao.recorrencia_id !== null && <Badge>Recorrente</Badge>}
          {transacao.tipo === "aporte" && <Badge>Aporte em investimento</Badge>}
          {coberturas.map((cobertura) => (
            <Badge key={cobertura.id} tom="positivo">{`Reserva «${cobertura.tag}» ${formatar(cobertura.valor)}`}</Badge>
          ))}
          {transacao.tags.length > 0 && (
            <ul className={estilos.tags} aria-label="Tags">
              {transacao.tags.map((tag) => (
                <li key={tag}>
                  {aoAlternarTag ? (
                    <Chip
                      tamanho="pequeno"
                      selecionado={tagsAtivas.includes(tag)}
                      aria-label={`Filtrar pela tag ${tag}`}
                      aoAlternar={() => aoAlternarTag(tag)}
                    >
                      {tag}
                    </Chip>
                  ) : (
                    <Badge>{tag}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {desfazer.erro instanceof ErroDaApiCliente && <p role="alert">{desfazer.erro.mensagem}</p>}
      </div>
      <p className={estilos.valor} data-valor="">
        {valor}
      </p>
      <div className={estilos.acoes} data-acoes="">
        <MenuDeAcoes rotulo={`Mais ações de ${transacao.descricao}`} itens={itens} />
      </div>
      {cobrindo && transacao.tipo === "gasto" && (
        <CoberturaDaCompra gasto={transacao} aoFechar={() => definirCobrindo(false)} />
      )}
      {reabrir.dialogo}{reclassificar.dialogo}
      {dialogos}
    </li>
  );
}
