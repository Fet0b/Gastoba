type Propriedades = { tamanho?: number };

function Traco({ tamanho = 16, caminhos }: Propriedades & { caminhos: readonly string[] }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {caminhos.map((caminho) => (
        <path key={caminho} d={caminho} />
      ))}
    </svg>
  );
}

/** Seta para baixo: o saldo está no negativo. */
export function IconeDeSaldoNegativo({ tamanho }: Propriedades) {
  return <Traco tamanho={tamanho} caminhos={["M12 4v14", "M6 12l6 6 6-6"]} />;
}

/** Prédio de banco: a conta vem de um banco conectado. */
export function IconeDeBanco({ tamanho }: Propriedades) {
  return <Traco tamanho={tamanho} caminhos={["M3 9l9-5 9 5", "M5 9v9", "M9.5 9v9", "M14.5 9v9", "M19 9v9", "M3 20h18"]} />;
}

/** Cartão de crédito. */
export function IconeDeCartao({ tamanho }: Propriedades) {
  return <Traco tamanho={tamanho} caminhos={["M3 6h18v12H3z", "M3 10h18", "M7 15h3"]} />;
}
