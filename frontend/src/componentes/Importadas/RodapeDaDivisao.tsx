import { corDaCategoria } from "../../categorias/cores";
import { formatar } from "../../dinheiro/dinheiro";
import {
  ehAporte,
  type LinhaDaDivisao,
  type RestanteDaDivisao,
  somaDosPercentuaisDaDivisao,
} from "../../transacoes/divisao";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { Icone } from "../Icone/Icone";
import estilos from "./EditorDeDivisao.module.css";

type Propriedades = {
  linhas: readonly LinhaDaDivisao[];
  saida: boolean;
  /** O valor da transação inteira, em reais. */
  total: string;
  restante: RestanteDaDivisao;
  /** Os valores de cada parte; nulo para a de percentual inválido. */
  valores: readonly (string | null)[];
  podeAdicionar: boolean;
  aoAdicionar: () => void;
  aoDividirIgualmente: () => void;
  aoCompletar: () => void;
};

/** Na entrada (sem categoria) e no aporte sem categoria, cores de apoio da paleta. */
const CORES_DE_APOIO = ["#B7A8E8", "#60A5FA", "#FBBF24", "#E879F9", "#5BD6B0"];

/** A cor do segmento de uma parte: a da categoria; sem categoria, a da Liberdade financeira ou a de apoio. */
export function corDaParte(linha: LinhaDaDivisao, posicao: number, saida: boolean): string {
  if (linha.categoria !== "") return corDaCategoria(linha.categoria);
  if (ehAporte(linha, saida)) return corDaCategoria("liberdade_financeira");
  return CORES_DE_APOIO[posicao % CORES_DE_APOIO.length];
}

/**
 * O fim do editor da divisão: uma barra com um segmento por parte, quanto já foi distribuído, a
 * situação em texto e ícone (falta, passou ou tudo distribuído) e os atalhos. Mesmo desenho da
 * "Divisão da renda-base" do Orçamento.
 */
export function RodapeDaDivisao({
  linhas,
  saida,
  total,
  restante,
  valores,
  podeAdicionar,
  aoAdicionar,
  aoDividirIgualmente,
  aoCompletar,
}: Propriedades) {
  const soma = somaDosPercentuaisDaDivisao(linhas);
  const base = Math.max(100, soma);
  const largura = (percentual: number) => `${Math.round((percentual / base) * 1e6) / 1e4}%`;
  const itens = linhas.flatMap((linha, posicao) => {
    const percentual = Number(linha.percentual);
    if (!Number.isInteger(percentual) || percentual < 1 || percentual > 100) return [];
    const valor = valores[posicao];
    return [
      {
        posicao,
        percentual,
        cor: corDaParte(linha, posicao, saida),
        texto: `Parte ${posicao + 1} ${percentual}%${valor == null ? "" : `, ${formatar(valor)}`}`,
      },
    ];
  });
  const rotuloDaBarra =
    itens.length === 0 ? "Nada distribuído ainda" : `Distribuição: ${itens.map((item) => item.texto).join(", ")}`;

  return (
    <div className={estilos.rodapeDaDivisao}>
      <div className={estilos.faixa} role="img" aria-label={rotuloDaBarra} data-faixa="">
        {itens.map((item) => (
          <span
            key={item.posicao}
            className={estilos.segmento}
            aria-hidden="true"
            data-segmento={item.posicao + 1}
            style={{ width: largura(item.percentual), backgroundColor: item.cor }}
          />
        ))}
      </div>
      <div className={estilos.situacao}>
        <span className={estilos.distribuido}>
          Distribuído <span className="valor">{formatar(restante.distribuido)}</span> de{" "}
          <span className="valor">{formatar(total)}</span>
        </span>
        {restante.situacao === "completa" && (
          <Badge tom="positivo" icone={<Icone nome="verificado" tamanho={14} />}>
            Tudo distribuído
          </Badge>
        )}
        {restante.situacao === "falta" && (
          <Badge tom="atencao" icone={<Icone nome="alerta" tamanho={14} />}>
            Falta {formatar(restante.diferenca)}
          </Badge>
        )}
        {restante.situacao === "passou" && (
          <Badge tom="negativo" icone={<Icone nome="alerta" tamanho={14} />}>
            Passou {formatar(restante.diferenca)}
          </Badge>
        )}
      </div>
      <div className={estilos.atalhos}>
        <Botao variante="secundario" icone="adicionar" disabled={!podeAdicionar} onClick={aoAdicionar}>
          Adicionar parte
        </Botao>
        <Botao variante="terciario" onClick={aoDividirIgualmente}>
          Dividir igualmente
        </Botao>
        <Botao variante="terciario" disabled={restante.situacao === "completa"} onClick={aoCompletar}>
          Completar com o restante
        </Botao>
      </div>
    </div>
  );
}
