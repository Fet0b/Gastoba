// Cálculos do gráfico de ritmo: gasto acumulado do mês contra o ritmo ideal.
// Dinheiro só em BigInt de centavos (Art. III); `razaoDe` é o único ponto que sai
// para `number`, e só devolve uma razão (0 a 1), nunca um valor.

import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";
import type { Periodo } from "../periodo/periodo";

const ESPACO_NAO_SEPARAVEL = "\u{a0}";

/** Quantidade de dias do mês (28 a 31). */
export function diasDoMes(periodo: Periodo): number {
  return new Date(periodo.ano, periodo.mes, 0).getDate();
}

type GastoDoRitmo = { data: string; valor: string };

/**
 * O gasto acumulado dia a dia: o item `i` é o total gasto do dia 1 ao dia `i + 1`.
 * Vai até `ateODia` (limitado aos dias do mês); gastos fora do mês são ignorados.
 */
export function gastoAcumuladoPorDia(
  gastos: readonly GastoDoRitmo[],
  periodo: Periodo,
  ateODia: number,
): string[] {
  const dias = Math.max(0, Math.min(ateODia, diasDoMes(periodo)));
  const prefixo = `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-`;
  const porDia = new Array<bigint>(dias).fill(0n);
  for (const gasto of gastos) {
    if (!gasto.data.startsWith(prefixo)) continue;
    const dia = Number(gasto.data.slice(prefixo.length));
    if (dia >= 1 && dia <= dias) porDia[dia - 1] += paraCentavos(gasto.valor);
  }
  let acumulado = 0n;
  return porDia.map((valor) => {
    acumulado += valor;
    return deCentavos(acumulado);
  });
}

/**
 * O ritmo ideal: a renda do mês em partes iguais pelos dias (`renda * dia / dias`,
 * para baixo). `undefined` quando não há renda.
 */
export function ritmoIdealPorDia(renda: string, periodo: Periodo): string[] | undefined {
  const centavos = paraCentavos(renda);
  if (centavos <= 0n) return undefined;
  const dias = diasDoMes(periodo);
  return Array.from({ length: dias }, (_, i) => deCentavos((centavos * BigInt(i + 1)) / BigInt(dias)));
}

const PASSOS = [1n, 2n, 5n];
const MINIMO_EM_REAIS = 100n;
const DIVISOES = 4n;

/** Um teto "bonito" (1, 2 ou 5 vezes uma potência de dez, mínimo R$ 100) e as marcas do eixo. */
export function escalaDeValores(maximo: string): { teto: string; marcas: string[] } {
  const alvo = paraCentavos(maximo);
  let teto = 0n;
  for (let potencia = 1n; teto === 0n; potencia *= 10n) {
    for (const passo of PASSOS) {
      const candidato = passo * potencia * 100n;
      if (candidato >= MINIMO_EM_REAIS * 100n && candidato >= alvo) {
        teto = candidato;
        break;
      }
    }
  }
  // O teto é sempre múltiplo de R$ 100, então a divisão em quatro é exata em centavos.
  const marcas = Array.from({ length: Number(DIVISOES) + 1 }, (_, i) =>
    deCentavos((teto * BigInt(i)) / DIVISOES),
  );
  return { teto: deCentavos(teto), marcas };
}

function umaCasa(valor: bigint, unidade: bigint): string {
  const decimos = (valor * 10n) / unidade;
  const inteiro = decimos / 10n;
  const resto = decimos % 10n;
  return resto === 0n ? `${inteiro}` : `${inteiro},${resto}`;
}

/** Rótulo curto de eixo: "R$ 500", "R$ 1,5 mil", "R$ 12 mil", "R$ 1 mi". */
export function rotuloCompacto(valor: string): string {
  const reais = paraCentavos(valor) / 100n;
  const modulo = reais < 0n ? -reais : reais;
  const sinal = reais < 0n ? "-" : "";
  let corpo: string;
  if (modulo >= 1_000_000n) corpo = `${umaCasa(modulo, 1_000_000n)}${ESPACO_NAO_SEPARAVEL}mi`;
  else if (modulo >= 1_000n) corpo = `${umaCasa(modulo, 1_000n)}${ESPACO_NAO_SEPARAVEL}mil`;
  else corpo = `${modulo}`;
  return `${sinal}R$${ESPACO_NAO_SEPARAVEL}${corpo}`;
}

/** A razão `valor / total` (0 a 1) calculada em milionésimos com BigInt; 0 se o total é zero. */
export function razaoDe(valor: string, total: string): number {
  const divisor = paraCentavos(total);
  if (divisor === 0n) return 0;
  return Number((paraCentavos(valor) * 1_000_000n) / divisor) / 1_000_000;
}
