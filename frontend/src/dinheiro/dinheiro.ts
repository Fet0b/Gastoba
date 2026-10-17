// Dinheiro é exato (Art. III): valores trafegam como string decimal ("25.90")
// e toda aritmética usa centavos inteiros em BigInt, nunca ponto flutuante.

/** Mesmo limite do backend: R$ 1 trilhão, em centavos. */
export const LIMITE_CENTAVOS = 10n ** 14n;

const ESPACO_NAO_SEPARAVEL = "\u{a0}";
const SINAL_DE_MENOS = "−";

// Decimal com ponto: sinal opcional, parte inteira obrigatória e fração opcional
// (com pelo menos um dígito depois do ponto). Mesmo formato que o backend aceita.
const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Converte uma string decimal ("25.90", "-10.00", "974.1", "1.500") em centavos. */
export function paraCentavos(texto: string): bigint {
  const partes = DECIMAL.exec(texto);
  if (!partes) throw new Error(`Valor monetário inválido: ${JSON.stringify(texto)}.`);
  const [, sinal, inteiro, fracao = ""] = partes;
  // Casas além da segunda só são aceitas se forem zeros ("1.500"); "1.555" tem
  // fração de centavo.
  if (/[^0]/.test(fracao.slice(2))) {
    throw new Error(`Valor monetário com fração de centavo: ${JSON.stringify(texto)}.`);
  }
  const centavos = BigInt(inteiro) * 100n + BigInt(fracao.slice(0, 2).padEnd(2, "0"));
  return sinal === "-" ? -centavos : centavos;
}

/** Converte centavos em string decimal com duas casas ("25.90", "-0.50"). */
export function deCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const absoluto = negativo ? -centavos : centavos;
  const texto = `${absoluto / 100n}.${(absoluto % 100n).toString().padStart(2, "0")}`;
  return negativo ? `-${texto}` : texto;
}

function separarMilhares(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Texto da máscara ("1.234,56") para centavos não negativos. */
function mascaraDeCentavos(centavos: bigint): string {
  const inteiro = (centavos / 100n).toString();
  const resto = (centavos % 100n).toString().padStart(2, "0");
  return `${separarMilhares(inteiro)},${resto}`;
}

/** Formata para exibição: "R$ 1.234,56" (U+00A0) e "−R$ 10,00" (U+2212). */
export function formatar(texto: string): string {
  const centavos = paraCentavos(texto);
  const negativo = centavos < 0n;
  const numero = mascaraDeCentavos(negativo ? -centavos : centavos);
  return `${negativo ? SINAL_DE_MENOS : ""}R$${ESPACO_NAO_SEPARAVEL}${numero}`;
}

/** Soma exata de valores em string decimal. */
/**
 * `percentual`% do valor ("5000.00", 30 → "1500.00"), arredondado para baixo, em
 * centavos inteiros (BigInt): a mesma conta do backend (`Dinheiro.percentual`).
 */
export function percentualDe(texto: string, percentual: number): string {
  return deCentavos((paraCentavos(texto) * BigInt(percentual)) / 100n);
}

export function somar(textos: readonly string[]): string {
  return deCentavos(textos.reduce((total, texto) => total + paraCentavos(texto), 0n));
}

/**
 * Valor intermediário entre `inicio` e `fim` para a contagem animada, com
 * `t` de 0 a 1 em milésimos; a conta é toda em BigInt.
 */
export function interpolar(inicio: string, fim: string, t: number): string {
  const de = paraCentavos(inicio);
  const ate = paraCentavos(fim);
  // `t` fora de [0, 1] é limitado; NaN (ex.: duração zero) vale o fim, porque
  // `BigInt(NaN)` lançaria RangeError no meio da animação.
  const progresso = Number.isNaN(t) ? 1 : Math.min(Math.max(t, 0), 1);
  const milesimos = BigInt(Math.round(progresso * 1000));
  return deCentavos(de + ((ate - de) * milesimos) / 1000n);
}

/**
 * Máscara de digitação: os dígitos são lidos como centavos ("2590" → "25,90",
 * "5" → "0,05"); o que não é dígito é ignorado (colar "R$ 25,90" funciona).
 * Dígitos que passariam do limite são recusados: fica o valor anterior a eles.
 */
export function interpretarDigitacao(digitos: string): string {
  let somenteDigitos = digitos.replace(/\D/g, "").replace(/^0+/, "");
  while (somenteDigitos !== "" && BigInt(somenteDigitos) > LIMITE_CENTAVOS) {
    somenteDigitos = somenteDigitos.slice(0, -1);
  }
  return mascaraDeCentavos(BigInt(somenteDigitos || "0"));
}

/** Texto da máscara ("1.234,56") para a string decimal da API ("1234.56"). */
export function deMascara(mascara: string): string {
  return deCentavos(paraCentavos(mascara.replaceAll(".", "").replace(",", ".")));
}
