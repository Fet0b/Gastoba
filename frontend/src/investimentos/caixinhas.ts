import type { CorDaDestinacao, DestinacaoCadastrada, IconeDaCaixinha, Investimento } from "../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../dinheiro/dinheiro";

export const ICONE_PADRAO_DA_CAIXINHA: IconeDaCaixinha = "cofre";

/** Os seis ícones que a pessoa pode escolher, na ordem da lista (o mesmo `Icone` desenha todos). */
export const ICONES_DA_CAIXINHA: readonly { codigo: IconeDaCaixinha; rotulo: string }[] = [
  { codigo: "aviao", rotulo: "Avião" },
  { codigo: "casa", rotulo: "Casa" },
  { codigo: "carro", rotulo: "Carro" },
  { codigo: "computador", rotulo: "Computador" },
  { codigo: "cofre", rotulo: "Cofre" },
  { codigo: "exclamacao", rotulo: "Exclamação" },
];

/** Código vindo da API (ou ausente) → ícone conhecido; qualquer outra coisa cai no padrão. */
export function iconeDaCaixinha(codigo: string | null | undefined): IconeDaCaixinha {
  return ICONES_DA_CAIXINHA.find((i) => i.codigo === codigo)?.codigo ?? ICONE_PADRAO_DA_CAIXINHA;
}

export type ParteDaCaixinha = {
  investimentoId: string;
  nomeDoInvestimento: string;
  valor: string;
  rendimento: string;
};

export type ResumoDaCaixinha = {
  id: string;
  nome: string;
  icone: IconeDaCaixinha;
  cor: CorDaDestinacao | null;
  valor: string;
  rendimento: string;
  partes: ParteDaCaixinha[];
};

/**
 * Agrupa as partes de `GET /investimentos` por caixinha, por valor, as sem investimentos no fim. Só soma números que o
 * backend já calculou por parte (rateio proporcional), em centavos inteiros (`BigInt`): a parte sem
 * caixinha (`tag` nula) e a tag fora do catálogo ficam de fora.
 */
export function resumirCaixinhas(
  catalogo: readonly DestinacaoCadastrada[],
  investimentos: readonly Investimento[],
): ResumoDaCaixinha[] {
  const resumos = catalogo.map((caixinha) => {
    const partes: ParteDaCaixinha[] = [];
    let valor = 0n;
    let rendimento = 0n;
    for (const investimento of investimentos) {
      for (const parte of investimento.destinacoes) {
        if (parte.tag !== caixinha.nome) continue;
        const valorDaParte = paraCentavos(parte.valor_atual);
        const rendimentoDaParte = paraCentavos(parte.rendimento);
        valor += valorDaParte;
        rendimento += rendimentoDaParte;
        if (valorDaParte === 0n && rendimentoDaParte === 0n) continue;
        partes.push({
          investimentoId: investimento.id,
          nomeDoInvestimento: investimento.rotulo ?? investimento.nome,
          valor: deCentavos(valorDaParte),
          rendimento: deCentavos(rendimentoDaParte),
        });
      }
    }
    return {
      id: caixinha.id,
      nome: caixinha.nome,
      icone: iconeDaCaixinha(caixinha.icone),
      cor: caixinha.cor,
      valor: deCentavos(valor),
      rendimento: deCentavos(rendimento),
      partes,
    };
  });
  return ordenarPorValor(resumos);
}

/**
 * Valor primeiro, do maior para o menor (centavos em BigInt, desempate pelo nome); as caixinhas sem
 * nenhuma parte em posição vão ao fim, por nome (XI.5.7).
 */
function ordenarPorValor(resumos: ResumoDaCaixinha[]): ResumoDaCaixinha[] {
  const porNome = (a: ResumoDaCaixinha, b: ResumoDaCaixinha) => a.nome.localeCompare(b.nome, "pt-BR");
  return [...resumos].sort((a, b) => {
    const semA = a.partes.length === 0;
    const semB = b.partes.length === 0;
    if (semA !== semB) return semA ? 1 : -1;
    if (semA) return porNome(a, b);
    const va = paraCentavos(a.valor);
    const vb = paraCentavos(b.valor);
    return va === vb ? porNome(a, b) : va > vb ? -1 : 1;
  });
}

export type TomDoRendimento = "positivo" | "negativo" | "neutro";

/** O rendimento escrito para a tela, sempre com sinal ("+R$ 1,00", "−R$ 1,00") e o tom (zero é neutro). */
export function rotuloDoRendimento(texto: string): { texto: string; tom: TomDoRendimento } {
  const centavos = paraCentavos(texto);
  if (centavos === 0n) return { texto: formatar(texto), tom: "neutro" };
  return centavos > 0n ? { texto: `+${formatar(texto)}`, tom: "positivo" } : { texto: formatar(texto), tom: "negativo" };
}
