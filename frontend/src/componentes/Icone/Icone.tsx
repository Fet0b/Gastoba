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
  | "filtro"
  | "entrada"
  | "saida"
  | "alerta"
  | "ok"
  | "info"
  | "repetir"
  | "verificado"
  | "sino"
  | "dividir"
  | "chevron"
  | "calendario"
  | "chave"
  | "banco"
  | "moeda"
  | "cofre"
  | "folha"
  | "grafico"
  | "aviao"
  | "casa"
  | "carro"
  | "computador"
  | "exclamacao";

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
  filtro: ["M4 6h16", "M7 12h10", "M10 18h4"],
  entrada: ["M12 4v14", "M6 12l6 6 6-6"],
  saida: ["M12 20V6", "M6 12l6-6 6 6"],
  alerta: ["M12 3 2.5 20h19z", "M12 10v4", "M12 17h.01"],
  ok: ["M5 12.5l4.5 4.5L19 7.5"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 8h.01"],
  repetir: ["M4 12a6 6 0 0 1 6-6h9", "M16 3l3 3-3 3", "M20 12a6 6 0 0 1-6 6H5", "M8 21l-3-3 3-3"],
  verificado: ["M5 12.5l4.5 4.5L19 7.5"],
  dividir: ["M5 12h14", "M12 6h.01", "M12 18h.01"],
  chevron: ["M6 9l6 6 6-6"],
  calendario: ["M4 5h16v16H4z", "M8 3v4", "M16 3v4", "M4 10h16"],
  chave: ["M10 14a5 5 0 1 1 4-4", "M10 14l-6 6", "M4 17l3 3"],
  banco: ["M3 8l9-5 9 5z", "M5 10v8", "M12 10v8", "M19 10v8", "M3 21h18"],
  sino: ["M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z", "M10 21h4"],
  moeda: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2-.5-2.5-1.5", "M12 6.5V8", "M12 16v1.5"],
  cofre: ["M4 5h16v14H4z", "M7 19v2", "M17 19v2", "M12 14a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M12 9V7", "M12 16v-2"],
  folha: ["M5 19C5 10 10 5 20 4c0 9-4 15-13 15", "M5 19c3-5 6-8 10-10"],
  grafico: ["M4 4v16h16", "M8 16v-4", "M12 16V8", "M16 16v-6"],
  aviao: ["M12 3c1 0 1.5 1.5 1.5 3v4l7 4v2l-7-2v4l2 1.5V21L12 20l-2.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4V6c0-1.5.5-3 1.5-3z"],
  casa: ["M3 12l9-8 9 8", "M5 10.5V20h14v-9.5", "M10 20v-6h4v6", "M17 7V4h2v5"],
  carro: ["M3 16v-4l2-5a2 2 0 0 1 2-1.5h10a2 2 0 0 1 2 1.5l2 5v4z", "M3 12h18", "M7 16v2", "M17 16v2", "M7 14h.01", "M17 14h.01"],
  computador: ["M5 5h14v10H5z", "M2.5 19h19", "M10 15v4", "M14 15v4"],
  exclamacao: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7.5v5.5", "M12 16.5h.01"],
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
