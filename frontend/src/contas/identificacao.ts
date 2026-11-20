import type { CartaoComFaturas, Conta } from "../api/tipos";

export type IdentificacaoDaConta = {
  /** O apelido, senão o nome no banco, senão o nome (o `rotulo` que a API calcula). */
  rotulo: string;
  tipo: string;
  /** "final 0412", ou nulo quando o banco não informa o número. */
  final: string | null;
};

const TIPOS: Record<Conta["tipo"], string> = {
  corrente: "Conta corrente",
  cartao: "Cartão de crédito",
  remunerada: "Conta investimentos",
};

type ContaIdentificavel = Pick<Conta, "tipo" | "rotulo" | "final_do_numero"> & Partial<Pick<Conta, "papel">>;

/** A única regra de como uma conta se identifica na tela: rótulo, tipo e final, sempre juntos. */
export function identificacaoDaConta(conta: ContaIdentificavel): IdentificacaoDaConta {
  return {
    rotulo: conta.rotulo,
    tipo: conta.papel === "investimento" ? TIPOS.remunerada : TIPOS[conta.tipo],
    final: conta.final_do_numero ? `final ${conta.final_do_numero}` : null,
  };
}

function semAcentoNemCaixa(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

/**
 * O rótulo de OUTRA conta da pessoa igual ao apelido que ela está digitando (sem maiúsculas, acentos nem
 * espaços das pontas), para avisar que as duas apareceriam iguais. Nulo quando não há.
 */
export function rotuloDeOutraConta(
  contas: Pick<Conta, "id" | "rotulo">[],
  idDaConta: string,
  apelido: string,
): string | null {
  const procurado = semAcentoNemCaixa(apelido);
  if (procurado === "") return null;
  return contas.find((c) => c.id !== idDaConta && semAcentoNemCaixa(c.rotulo) === procurado)?.rotulo ?? null;
}

/**
 * A identificação em uma linha de texto: "rótulo, final 0412, tipo". O final, que diferencia, vem antes
 * do tipo, que é o que mais se corta; o tipo some quando o rótulo já é igual a ele.
 */
export function textoDaConta(conta: ContaIdentificavel): string {
  const { rotulo, tipo, final } = identificacaoDaConta(conta);
  const tipoRepetido = semAcentoNemCaixa(rotulo) === semAcentoNemCaixa(tipo);
  return [rotulo, final, tipoRepetido ? null : tipo].filter((parte): parte is string => parte !== null).join(", ");
}

/**
 * Contas que a pessoa não consegue distinguir: mesmo rótulo e tipo, e sem um final que só ela
 * tenha. Para a sugestão "Dê um apelido para diferenciar".
 */
export function contasParecidas(contas: (ContaIdentificavel & Pick<Conta, "id">)[]): Set<string> {
  const grupos = new Map<string, (ContaIdentificavel & Pick<Conta, "id">)[]>();
  for (const conta of contas) {
    const { rotulo, tipo } = identificacaoDaConta(conta);
    const chave = `${rotulo.toLocaleLowerCase("pt-BR")}\u0000${tipo}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), conta]);
  }
  const parecidas = new Set<string>();
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    for (const conta of grupo) {
      const final = conta.final_do_numero;
      const distinta = final && grupo.every((outra) => outra === conta || outra.final_do_numero !== final);
      if (!distinta) parecidas.add(conta.id);
    }
  }
  return parecidas;
}

/** O rótulo de um cartão da lista de faturas: a API já o entrega calculado (apelido, senão nome no banco). */
export function rotuloDoCartao(cartao: Pick<CartaoComFaturas, "conta_nome">): string {
  return cartao.conta_nome;
}
