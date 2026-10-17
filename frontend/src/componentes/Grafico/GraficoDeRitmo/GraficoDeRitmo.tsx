import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { deCentavos, formatar, paraCentavos } from "../../../dinheiro/dinheiro";
import {
  diasDoMes,
  escalaDeValores,
  razaoDe,
  rotuloCompacto,
} from "../../../graficos/ritmo";
import { type Periodo, rotulo as rotuloDoMes } from "../../../periodo/periodo";
import { EstadoVazio } from "../../EstadoVazio/EstadoVazio";
import { Icone } from "../../Icone/Icone";
import { prefereMenosMovimento } from "../../movimento";
import estilos from "./GraficoDeRitmo.module.css";
import { TabelaDoRitmo } from "./TabelaDoRitmo";

type Propriedades = {
  periodo: Periodo;
  /** O gasto acumulado de cada dia, do dia 1 até o último dia desenhado. */
  acumulado: readonly string[];
  /** O ritmo ideal de cada dia do mês; `undefined` quando não há renda. */
  ideal: readonly string[] | undefined;
  /** O mês ainda não começou: não há o que desenhar. */
  mesFuturo: boolean;
  /** Ação do estado vazio de um mês sem gastos e sem ganhos. */
  aoRegistrar?: () => void;
};

const LARGURA_PADRAO = 560;
const ALTURA = 220;
const MARGEM = { topo: 16, direita: 16, baixo: 28, esquerda: 60 };
const DURACAO_DA_TRANSICAO = 400;

function maior(valores: readonly string[]): string {
  return valores.reduce((m, v) => (paraCentavos(v) > paraCentavos(m) ? v : m), "0.00");
}

function arredondar(numero: number): string {
  return (Math.round(numero * 10) / 10).toString();
}

function caminho(xs: readonly number[], ys: readonly number[]): string {
  return ys.map((y, i) => `${i === 0 ? "M" : "L"}${arredondar(xs[i])} ${arredondar(y)}`).join(" ");
}

/** Mede a largura do próprio elemento; onde não há `ResizeObserver` (jsdom), vale o padrão. */
function useLarguraMedida() {
  const referencia = useRef<HTMLDivElement>(null);
  const [largura, definirLargura] = useState(LARGURA_PADRAO);
  useLayoutEffect(() => {
    const elemento = referencia.current;
    if (!elemento || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const medida = Math.floor(elemento.getBoundingClientRect().width);
      if (medida > 0) definirLargura(medida);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return { referencia, largura };
}

/**
 * Ao trocar de mês (`chave`), leva a curva da forma anterior para a nova em vez de
 * trocá-la de uma vez. Só geometria em pixels; nenhum valor monetário passa por aqui.
 */
function useCurvaEmTransicao(alvo: readonly number[], chave: string, animar: boolean) {
  const [intermediaria, definirIntermediaria] = useState<readonly number[] | null>(null);
  const exibida = useRef<readonly number[]>(alvo);
  const chaveAnterior = useRef(chave);
  const alvoAtual = useRef(alvo);
  alvoAtual.current = alvo;

  useLayoutEffect(() => {
    const mudou = chaveAnterior.current !== chave;
    chaveAnterior.current = chave;
    const de = exibida.current;
    if (!mudou || !animar || de.length === 0 || typeof requestAnimationFrame !== "function") {
      definirIntermediaria(null);
      return;
    }
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_DA_TRANSICAO);
      if (t >= 1) {
        definirIntermediaria(null);
        return;
      }
      const suave = 1 - (1 - t) ** 3;
      const para = alvoAtual.current;
      definirIntermediaria(
        para.map((y, i) => {
          const origem = de[Math.min(i, de.length - 1)];
          return origem + (y - origem) * suave;
        }),
      );
      quadro = requestAnimationFrame(passo);
    };
    definirIntermediaria(alvo.map((_, i) => de[Math.min(i, de.length - 1)]));
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
    // Só a troca de mês dispara a transição; o `alvo` mais novo vem pela referência.
  }, [chave]);

  const resultado = intermediaria ?? alvo;
  useEffect(() => {
    exibida.current = resultado;
  });
  return resultado;
}

function textoDoDia(dia: number, acumulado: string, ideal: string | undefined): string {
  const base = `dia ${dia}, gasto acumulado ${formatar(acumulado)}`;
  return ideal === undefined ? base : `${base}, ritmo ideal ${formatar(ideal)}`;
}

/**
 * Gasto acumulado do mês contra o ritmo ideal (a renda do mês em partes iguais pelos
 * dias). Componente de apresentação: recebe os pontos já calculados. SVG em pixels,
 * com cursor que segue o ponteiro, o toque e o teclado; a tabela em `<details>` traz os
 * mesmos números, então o cursor nunca é o único caminho.
 */
export function GraficoDeRitmo({ periodo, acumulado, ideal, mesFuturo, aoRegistrar }: Propriedades) {
  const { referencia, largura } = useLarguraMedida();
  const [dia, definirDia] = useState<number | null>(null);
  // O leitor de tela só ouve o dia quando ele vem do teclado ou do foco; seguir o
  // ponteiro a cada pixel seria tagarelice (o tooltip continua aparecendo).
  const [viaTeclado, definirViaTeclado] = useState(false);
  const menosMovimento = prefereMenosMovimento();

  const dias = diasDoMes(periodo);
  const desenhados = acumulado.length;
  const semNada = ideal === undefined && paraCentavos(maior(acumulado)) === 0n;

  const maximo = maior([...acumulado, ...(ideal ?? [])]);
  const { teto, marcas } = escalaDeValores(maximo);
  const larguraUtil = Math.max(1, largura - MARGEM.esquerda - MARGEM.direita);
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  const xDoDia = (d: number) =>
    MARGEM.esquerda + (dias === 1 ? 0 : ((d - 1) / (dias - 1)) * larguraUtil);
  const yDoValor = (valor: string) => MARGEM.topo + alturaUtil * (1 - razaoDe(valor, teto));

  const xsAcumulado = acumulado.map((_, i) => xDoDia(i + 1));
  const ysAlvo = acumulado.map(yDoValor);
  const ysAcumulado = useCurvaEmTransicao(ysAlvo, `${periodo.ano}-${periodo.mes}`, !menosMovimento);

  if (mesFuturo) {
    return (
      <EstadoVazio
        icone="inicio"
        titulo="Este mês ainda não começou"
        texto="O ritmo aparece a partir do primeiro dia do mês."
      />
    );
  }
  if (desenhados === 0 || semNada) {
    return (
      <EstadoVazio
        icone="transacoes"
        titulo="Nenhum gasto neste mês"
        texto="Sem gastos nem ganhos, ainda não há ritmo para mostrar."
        acao={aoRegistrar && { rotulo: "Registrar um gasto", aoClicar: aoRegistrar }}
      />
    );
  }

  const ultimoDia = desenhados;
  const gastoFinal = acumulado[ultimoDia - 1];
  const idealFinal = ideal?.[ultimoDia - 1];
  const periodoDoTexto = ultimoDia < dias ? "até hoje" : "no mês";

  let estado: { tipo: "acima" | "dentro" | "sem_ideal"; texto: string };
  if (idealFinal === undefined) {
    estado = {
      tipo: "sem_ideal",
      texto: "Sem ganhos neste mês, não há ritmo ideal para comparar.",
    };
  } else {
    const diferenca = paraCentavos(gastoFinal) - paraCentavos(idealFinal);
    estado =
      diferenca > 0n
        ? {
            tipo: "acima",
            texto: `Acima do ritmo: ${formatar(deCentavos(diferenca))} a mais que o ideal ${periodoDoTexto}`,
          }
        : {
            tipo: "dentro",
            texto: `Dentro do ritmo: ${formatar(deCentavos(-diferenca))} abaixo do ideal ${periodoDoTexto}`,
          };
  }

  const nome = `Gasto acumulado em ${rotuloDoMes(periodo)}: ${formatar(gastoFinal)} até o dia ${ultimoDia}. ${estado.texto}.`;

  const diasDoEixo = largura < 400 ? [1, 15, dias] : [1, 8, 15, 22, dias];
  const marcasDeDia = [...new Set(diasDoEixo)];

  const caminhoDaLinha = caminho(xsAcumulado, ysAcumulado);
  const base = MARGEM.topo + alturaUtil;
  const caminhoDaArea =
    desenhados > 1
      ? `${caminhoDaLinha} L${arredondar(xsAcumulado[desenhados - 1])} ${base} L${arredondar(xsAcumulado[0])} ${base} Z`
      : "";
  const caminhoIdeal = ideal
    ? caminho(
        ideal.map((_, i) => xDoDia(i + 1)),
        ideal.map(yDoValor),
      )
    : "";

  const xFinal = xsAcumulado[desenhados - 1];
  const yFinal = ysAcumulado[desenhados - 1];
  const rotuloAbaixo = yFinal < MARGEM.topo + 14;

  const diaAtivo = dia === null ? null : Math.min(Math.max(dia, 1), ultimoDia);
  const textoAtivo =
    diaAtivo === null ? "" : textoDoDia(diaAtivo, acumulado[diaAtivo - 1], ideal?.[diaAtivo - 1]);
  const xAtivo = diaAtivo === null ? 0 : xDoDia(diaAtivo);

  function diaDoPonteiro(evento: PointerEvent<SVGElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caixa.left;
    const bruto = dias === 1 ? 1 : Math.round(((x - MARGEM.esquerda) / larguraUtil) * (dias - 1)) + 1;
    definirViaTeclado(false);
    definirDia(Math.min(Math.max(bruto, 1), ultimoDia));
  }

  function aoTeclar(evento: KeyboardEvent<SVGSVGElement>) {
    const atual = diaAtivo ?? ultimoDia;
    let proximo: number | null | undefined;
    if (evento.key === "ArrowRight") proximo = diaAtivo === null ? ultimoDia : Math.min(atual + 1, ultimoDia);
    else if (evento.key === "ArrowLeft") proximo = diaAtivo === null ? ultimoDia : Math.max(atual - 1, 1);
    else if (evento.key === "Home") proximo = 1;
    else if (evento.key === "End") proximo = ultimoDia;
    else if (evento.key === "Escape") proximo = null;
    if (proximo === undefined) return;
    evento.preventDefault();
    definirViaTeclado(true);
    definirDia(proximo);
  }

  const posicaoDoTooltip = Math.min(Math.max(xAtivo, 80), Math.max(80, largura - 80));

  return (
    <div className={estilos.grafico}>
      <div ref={referencia} className={estilos.area}>
        <svg
          role="img"
          aria-label={nome}
          tabIndex={0}
          width={largura}
          height={ALTURA}
          viewBox={`0 0 ${largura} ${ALTURA}`}
          className={estilos.svg}
          onKeyDown={aoTeclar}
          onFocus={() => {
            definirViaTeclado((atual) => atual || dia === null);
            definirDia((atual) => atual ?? ultimoDia);
          }}
          onBlur={() => {
            definirViaTeclado(false);
            definirDia(null);
          }}
        >
          {marcas.map((marca) => (
            <g key={marca}>
              <line
                className={estilos.grade}
                x1={MARGEM.esquerda}
                x2={largura - MARGEM.direita}
                y1={yDoValor(marca)}
                y2={yDoValor(marca)}
              />
              <text className={estilos.marca} x={MARGEM.esquerda - 8} y={yDoValor(marca)} textAnchor="end" dominantBaseline="middle">
                {rotuloCompacto(marca)}
              </text>
            </g>
          ))}
          {marcasDeDia.map((d) => (
            <text key={d} className={estilos.marca} x={xDoDia(d)} y={ALTURA - 8} textAnchor={d === 1 ? "start" : d === dias ? "end" : "middle"}>
              {d}
            </text>
          ))}

          {ideal && (
            <path className={estilos.linhaIdeal} data-serie="ideal" d={caminhoIdeal} />
          )}
          {caminhoDaArea && <path className={estilos.areaDoGasto} d={caminhoDaArea} data-animando={menosMovimento ? undefined : "true"} />}
          <path
            className={estilos.linhaDoGasto}
            data-serie="acumulado"
            data-animando={menosMovimento ? undefined : "true"}
            d={caminhoDaLinha}
            pathLength={1}
          />

          <g data-marca="final" className={estilos.final} data-animando={menosMovimento ? undefined : "true"}>
            <circle cx={xFinal} cy={yFinal} r={4} />
          </g>
          <text
            className={estilos.rotuloFinal}
            data-rotulo="final"
            x={xFinal}
            y={rotuloAbaixo ? yFinal + 20 : yFinal - 12}
            textAnchor="end"
          >
            {formatar(gastoFinal)}
          </text>

          {diaAtivo !== null && (
            <g className={estilos.cursor} style={{ transform: `translateX(${xAtivo}px)` }} aria-hidden="true">
              <line x1={0} x2={0} y1={MARGEM.topo} y2={base} />
              {ideal && (
                <circle className={estilos.pontoIdeal} cx={0} cy={0} r={4} style={{ transform: `translateY(${yDoValor(ideal[diaAtivo - 1])}px)` }} />
              )}
              <circle className={estilos.pontoDoGasto} cx={0} cy={0} r={4} style={{ transform: `translateY(${yDoValor(acumulado[diaAtivo - 1])}px)` }} />
            </g>
          )}

          <rect
            data-area-sensivel=""
            x={MARGEM.esquerda}
            y={MARGEM.topo}
            width={larguraUtil}
            height={alturaUtil}
            fill="transparent"
            onPointerMove={diaDoPonteiro}
            onPointerDown={diaDoPonteiro}
            onPointerLeave={(evento) => {
              // No toque, o dedo sai logo depois do toque: o dia fica até o foco sair.
              if (evento.pointerType !== "touch") definirDia(null);
            }}
          />
        </svg>

        {diaAtivo !== null && (
          <div role="tooltip" className={estilos.tooltip} style={{ left: posicaoDoTooltip }}>
            <strong>Dia {diaAtivo}</strong>
            <span>Gasto acumulado: {formatar(acumulado[diaAtivo - 1])}</span>
            {ideal && <span>Ritmo ideal: {formatar(ideal[diaAtivo - 1])}</span>}
          </div>
        )}
      </div>

      <p className={estilos.somenteLeitor} aria-live="polite">
        {viaTeclado ? textoAtivo : ""}
      </p>

      <ul className={estilos.legenda}>
        <li>
          <svg width="24" height="8" aria-hidden="true">
            <line className={estilos.chaveDoGasto} x1="0" x2="24" y1="4" y2="4" />
          </svg>
          <span>Gasto acumulado</span>
        </li>
        {ideal && (
          <li>
            <svg width="24" height="8" aria-hidden="true">
              <line className={estilos.chaveIdeal} x1="0" x2="24" y1="4" y2="4" />
            </svg>
            <span>Ritmo ideal</span>
          </li>
        )}
      </ul>

      <p className={estilos.estado} data-estado={estado.tipo}>
        {estado.tipo !== "sem_ideal" && (
          <Icone nome={estado.tipo === "acima" ? "alerta" : "ok"} tamanho={18} />
        )}
        <span>{estado.texto}</span>
      </p>

      <details className={estilos.detalhes}>
        <summary>Ver como tabela</summary>
        <TabelaDoRitmo acumulado={acumulado} ideal={ideal} />
      </details>
    </div>
  );
}
