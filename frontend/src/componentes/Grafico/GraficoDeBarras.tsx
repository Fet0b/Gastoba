import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import type { Gasto, ResumoPorTags } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { type Barra, type Membro, prepararBarras } from "../../graficos/barras";
import { fracaoDe, rotuloDoPercentual } from "../../graficos/fatias";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { prefereMenosMovimento } from "../movimento";
import estilos from "./GraficoDeBarras.module.css";

type Propriedades = {
  /** O resumo do período; `undefined` enquanto a primeira resposta não chega. */
  resumo: ResumoPorTags | undefined;
  carregando: boolean;
  /** Os gastos do mesmo período: dão a quantidade de gastos de cada barra (opcional). */
  gastos?: readonly Gasto[];
  /** A chave da barra fixada (a tag, ou a marca de "Sem tag"), ou `null`. */
  selecionada: string | null;
  aoSelecionar: (chave: string | null) => void;
};

function textoDaQuantidade(quantidade: number | undefined): string {
  if (quantidade === undefined) return "";
  return `, ${quantidade} ${quantidade === 1 ? "gasto" : "gastos"}`;
}

/** O nome completo da barra: tudo o que a dica diz, para o leitor de tela e para quem não passa o cursor. */
function nomeDaBarra(
  rotulo: string,
  valor: string,
  percentual: string,
  quantidade: number | undefined,
): string {
  return `${rotulo}: ${formatar(valor)}, ${percentual} do total${textoDaQuantidade(quantidade)}`;
}

type EventosDeDica = {
  aoMostrar: () => void;
  aoEsconder: () => void;
};

/** A barra de verdade: cresce de 0 até a largura ao aparecer e se move quando a largura muda. */
function Preenchimento({ fracao, tipo }: { fracao: number; tipo: Barra["tipo"] }) {
  const reduzido = prefereMenosMovimento();
  const [cresceu, definirCresceu] = useState(reduzido);

  useEffect(() => {
    if (cresceu) return;
    const quadro = requestAnimationFrame(() => definirCresceu(true));
    return () => cancelAnimationFrame(quadro);
  }, [cresceu]);

  const animando = !cresceu;
  return (
    <span
      className={estilos.preenchimento}
      data-fracao={String(fracao)}
      data-tipo={tipo}
      data-animando={animando ? "true" : undefined}
      style={{
        inlineSize: animando ? "0%" : `${fracao * 100}%`,
        ...(reduzido ? { transition: "none" } : {}),
      }}
    />
  );
}

function Dica({ valor, percentual, quantidade }: Pick<Barra, "valor" | "percentual" | "quantidade">) {
  return (
    <span className={estilos.dica} data-dica aria-hidden="true">
      <strong className="valor">{formatar(valor)}</strong> · {percentual} do total
      {textoDaQuantidade(quantidade)}
    </span>
  );
}

function LinhaDaBarra({
  barra,
  selecionada,
  haSelecao,
  expandida,
  aoClicar,
  referenciaDoBotao,
  aoMostrar,
  aoEsconder,
  dicaVisivel,
  idDosMembros,
  filhos,
}: {
  barra: Barra;
  selecionada: boolean;
  haSelecao: boolean;
  expandida: boolean;
  aoClicar: () => void;
  referenciaDoBotao?: React.Ref<HTMLButtonElement>;
  dicaVisivel: boolean;
  idDosMembros?: string;
  filhos?: React.ReactNode;
} & EventosDeDica) {
  const ehOutras = barra.tipo === "outras";
  return (
    <li
      className={estilos.linha}
      data-selecionada={selecionada}
      data-esmaecida={haSelecao && !selecionada}
      data-tipo={barra.tipo}
    >
      <button
        ref={referenciaDoBotao}
        type="button"
        className={estilos.botao}
        aria-label={nomeDaBarra(barra.rotulo, barra.valor, barra.percentual, barra.quantidade)}
        {...(ehOutras
          ? { "aria-expanded": expandida, "aria-controls": idDosMembros }
          : { "aria-pressed": selecionada })}
        onClick={aoClicar}
        onPointerEnter={aoMostrar}
        onPointerLeave={aoEsconder}
        onFocus={aoMostrar}
        onBlur={aoEsconder}
      >
        <span className={estilos.rotulo}>
          {barra.tipo === "sem_tag" ? <em>(sem tag)</em> : barra.rotulo}
        </span>
        <span className={estilos.trilha} aria-hidden="true">
          <Preenchimento fracao={barra.fracaoDaMaior} tipo={barra.tipo} />
        </span>
        <span className={estilos.numeros} aria-hidden="true">
          <span className="valor">{formatar(barra.valor)}</span>
          <span className={estilos.percentual}>{barra.percentual}</span>
        </span>
      </button>
      {dicaVisivel && (
        <Dica valor={barra.valor} percentual={barra.percentual} quantidade={barra.quantidade} />
      )}
      {filhos}
    </li>
  );
}

function LinhaDeMembro({
  membro,
  selecionada,
  aoClicar,
}: {
  membro: Membro;
  selecionada: boolean;
  aoClicar: () => void;
}) {
  return (
    <li className={estilos.membro}>
      <button
        type="button"
        className={estilos.botaoDoMembro}
        aria-pressed={selecionada}
        aria-label={nomeDaBarra(membro.tag, membro.valor, membro.percentual, membro.quantidade)}
        onClick={aoClicar}
      >
        <span className={estilos.rotulo}>{membro.tag}</span>
        <span className={estilos.numeros} aria-hidden="true">
          <span className="valor">{formatar(membro.valor)}</span>
          <span className={estilos.percentual}>{membro.percentual}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * "Gastos por tag": barras horizontais ordenadas por valor (uma só matiz; cinza para "Outras"
 * e "Sem tag"). Cada barra é um botão: passar o cursor ou focar mostra uma dica, e clicar fixa
 * a tag (quem usa o gráfico mostra o detalhe). As barras crescem ao aparecer e se movem ao
 * trocar de mês. O valor de um gasto com várias tags se divide em partes iguais entre elas.
 * Nome do botão, legenda de valores e a tabela equivalente (em `<details>`) trazem os mesmos
 * números, então a dica nunca é o único caminho.
 */
export function GraficoDeBarras({ resumo, carregando, gastos, selecionada, aoSelecionar }: Propriedades) {
  const idTitulo = useId();
  const idDosMembros = useId();
  const [dicaDe, definirDicaDe] = useState<string | null>(null);
  const [expandida, definirExpandida] = useState(false);
  const botaoDeOutras = useRef<HTMLButtonElement>(null);
  // Ao trocar o mês, o desenho anterior fica (esmaecido) até chegar o novo.
  const ultimo = useRef<ResumoPorTags | undefined>(undefined);
  if (resumo) ultimo.current = resumo;
  const exibido = resumo ?? ultimo.current;
  const atualizando = carregando && exibido !== undefined;

  const barras = exibido ? prepararBarras(exibido, undefined, gastos) : [];

  function fixar(chave: string) {
    aoSelecionar(selecionada === chave ? null : chave);
  }

  function aoTeclar(evento: KeyboardEvent) {
    if (evento.key !== "Escape") return;
    definirDicaDe(null);
    if (selecionada !== null) aoSelecionar(null);
  }

  return (
    <section
      className={estilos.cartao}
      aria-labelledby={idTitulo}
      data-atualizando={atualizando}
      onKeyDown={aoTeclar}
    >
      <h3 id={idTitulo} className={estilos.titulo}>
        Distribuição por tags
      </h3>
      <p className={estilos.apoio}>
        O valor de um gasto com várias tags se divide em partes iguais entre elas. Toque numa tag
        para ver os gastos dela.
      </p>

      {exibido === undefined ? (
        <p className={estilos.estado}>{carregando ? "Carregando…" : "Sem dados para mostrar."}</p>
      ) : barras.length === 0 ? (
        <EstadoVazio icone="tags" titulo="Sem gastos neste período" />
      ) : (
        <>
          <ul className={estilos.lista} aria-label="Gastos por tag">
            {barras.map((barra) => {
              const ehOutras = barra.tipo === "outras";
              return (
                <LinhaDaBarra
                  key={barra.chave}
                  barra={barra}
                  selecionada={selecionada === barra.chave}
                  haSelecao={selecionada !== null}
                  expandida={ehOutras && expandida}
                  referenciaDoBotao={ehOutras ? botaoDeOutras : undefined}
                  idDosMembros={ehOutras ? idDosMembros : undefined}
                  dicaVisivel={dicaDe === barra.chave}
                  aoMostrar={() => definirDicaDe(barra.chave)}
                  aoEsconder={() => definirDicaDe((atual) => (atual === barra.chave ? null : atual))}
                  aoClicar={() => {
                    if (!ehOutras) return fixar(barra.chave);
                    definirExpandida(!expandida);
                    if (expandida) botaoDeOutras.current?.focus();
                  }}
                  filhos={
                    ehOutras && expandida && barra.membros ? (
                      <ul
                        id={idDosMembros}
                        className={estilos.membros}
                        aria-label="Tags agrupadas em Outras"
                      >
                        {barra.membros.map((membro) => (
                          <LinhaDeMembro
                            key={membro.tag}
                            membro={membro}
                            selecionada={selecionada === membro.tag}
                            aoClicar={() => fixar(membro.tag)}
                          />
                        ))}
                      </ul>
                    ) : undefined
                  }
                />
              );
            })}
          </ul>

          <details className={estilos.tabela}>
            <summary>Ver como tabela</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Tag</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Percentual</th>
                </tr>
              </thead>
              <tbody>
                {exibido.fatias.map((fatia) => (
                  <tr key={fatia.tag ?? "\u{0}sem_tag"}>
                    <th scope="row">{fatia.tag ?? <em>(sem tag)</em>}</th>
                    <td className="valor">{formatar(fatia.valor)}</td>
                    <td>{rotuloDoPercentual(fracaoDe(fatia.valor, exibido.total))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="valor">{formatar(exibido.total)}</td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
