import type { Locator } from "@playwright/test";

type Cor = readonly [number, number, number];

/** WCAG: os canais sRGB são linearizados antes da luminância relativa. */
export function contrasteWcag(frente: Cor, fundo: Cor): number {
  const luminancia = (cor: Cor): number => {
    const linear = cor.map((canal) => {
      const srgb = canal / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const a = luminancia(frente);
  const b = luminancia(fundo);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Usa as cores renderizadas; compõe cada fundo translúcido até o ancestral opaco. */
export async function contrasteDoTexto(elemento: Locator): Promise<number> {
  const cores = await elemento.evaluate((el) => {
    type Rgba = [number, number, number, number];
    const ler = (texto: string): Rgba => {
      const canais = texto.match(/[\d.]+/g)?.map(Number);
      if (!texto.startsWith("rgb") || !canais || canais.length < 3) {
        throw new Error(`Cor CSS não suportada pelo medidor: ${texto}`);
      }
      return [canais[0]!, canais[1]!, canais[2]!, canais[3] ?? 1];
    };
    const compor = (frente: Rgba, fundo: Rgba): Rgba => [
      frente[0] * frente[3] + fundo[0] * (1 - frente[3]),
      frente[1] * frente[3] + fundo[1] * (1 - frente[3]),
      frente[2] * frente[3] + fundo[2] * (1 - frente[3]),
      1,
    ];
    const camadas: Rgba[] = [];
    let ancestral: Element | null = el;
    while (ancestral) {
      const cor = ler(getComputedStyle(ancestral).backgroundColor);
      camadas.push(cor);
      if (cor[3] === 1) break;
      ancestral = ancestral.parentElement;
    }
    let fundo = camadas.pop();
    if (!fundo || fundo[3] !== 1) throw new Error("Fundo opaco não encontrado.");
    for (const camada of camadas.reverse()) fundo = compor(camada, fundo);
    const frente = compor(ler(getComputedStyle(el).color), fundo);
    return { frente: frente.slice(0, 3) as [number, number, number], fundo: fundo.slice(0, 3) as [number, number, number] };
  });
  return contrasteWcag(cores.frente, cores.fundo);
}
