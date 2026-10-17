export type NomeDoIcone =
  | "inicio"
  | "transacoes"
  | "orcamento"
  | "contas"
  | "faturas"
  | "tags"
  | "outros"
  | "perfil"
  | "investimentos"
  | "lazer"
  | "conhecimento"
  | "conforto"
  | "gasto_fixo"
  | "mais"
  | "fechar"
  | "adicionar"
  | "entrada"
  | "saida"
  | "alerta"
  | "ok";

/** Caminhos SVG (viewBox 24x24, só traço), desenhados para o projeto: sem biblioteca de ícones. */
export const CAMINHOS_DOS_ICONES: Readonly<Record<NomeDoIcone, readonly string[]>> = {
  inicio: ["M4 11 12 4l8 7", "M6 10v9h12v-9", "M10 19v-5h4v5"],
  transacoes: ["M4 8h13", "M14 5l3 3-3 3", "M20 16H7", "M10 13l-3 3 3 3"],
  orcamento: ["M12 3a9 9 0 1 0 9 9h-9z", "M15 3.5A9 9 0 0 1 20.5 9H15z"],
  contas: ["M3 7h18v12H3z", "M3 10h18", "M16 15h2"],
  faturas: ["M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z", "M9 8h6", "M9 12h6"],
  tags: ["M3 12V4h8l10 10-8 8z", "M7.5 8.5h.01"],
  outros: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  perfil: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 20c0-4 4-6 8-6s8 2 8 6"],
  investimentos: ["M4 18l5-6 4 3 7-9", "M15 6h5v5"],
  lazer: ["M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"],
  conhecimento: ["M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z", "M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"],
  conforto: ["M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3", "M3 11h18v6H3z", "M5 17v2", "M19 17v2"],
  gasto_fixo: ["M4 11l8-7 8 7", "M6 10v10h12V10", "M9 20v-6h6v6"],
  mais: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  fechar: ["M6 6l12 12", "M18 6 6 18"],
  adicionar: ["M12 5v14", "M5 12h14"],
  entrada: ["M12 4v14", "M6 12l6 6 6-6"],
  saida: ["M12 20V6", "M6 12l6-6 6 6"],
  alerta: ["M12 3 2.5 20h19z", "M12 10v4", "M12 17h.01"],
  ok: ["M5 12.5l4.5 4.5L19 7.5"],
};

type Propriedades = {
  nome: NomeDoIcone;
  /** Tamanho em pixels (padrão 24). */
  tamanho?: number;
  /** Com rótulo, o ícone vira uma imagem com nome acessível; sem ele, é decorativo. */
  rotulo?: string;
  className?: string;
};

export function Icone({ nome, tamanho = 24, rotulo, className }: Propriedades) {
  const acessibilidade =
    rotulo === undefined
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": rotulo } as const);
  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...acessibilidade}
    >
      {CAMINHOS_DOS_ICONES[nome].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
