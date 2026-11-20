import { useEffect, useRef, type ReactNode } from "react";

import { formatar } from "../../dinheiro/dinheiro";
import { rotuloDoRendimento, type ResumoDaCaixinha } from "../../investimentos/caixinhas";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { Botao } from "../Botao/Botao";
import { Cartao } from "../Cartao/Cartao";
import { prefereMenosMovimento } from "../movimento";
import { useConsultaDeMidia } from "../Navegacao/useLayoutLargo";
import { Tabela } from "../Tabela/Tabela";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./PainelDaCaixinha.module.css";

/** Abaixo disso a tabela de três colunas não cabe: cada investimento vira um bloco. */
const CONSULTA_DA_TABELA = "(min-width: 37.5rem)";

type Propriedades = {
  resumo: ResumoDaCaixinha;
  id: string;
  /** Leva a Investimentos, onde se aloca uma posição na caixinha. */
  aoAlocar: () => void;
};

function Rendimento({ texto }: { texto: string }) {
  const { texto: escrito, tom } = rotuloDoRendimento(texto);
  return <span className={estilos.rendimento} data-tom={tom}>{escrito}</span>;
}

type Linha = { chave: string; nome: ReactNode; valor: string; rendimento: string; total?: boolean };

/**
 * O detalhe da caixinha aberta: as posições que a compõem, com o total igual ao do cartão. Ao abrir,
 * rola até o painel e leva o foco ao título (no celular ele nasce abaixo da tela). Em tela estreita é
 * uma lista de blocos: o nome em cima, Valor e Rendimento embaixo, à direita.
 */
export function PainelDaCaixinha({ resumo, id, aoAlocar }: Propriedades) {
  const tabela = useConsultaDeMidia(CONSULTA_DA_TABELA);
  const painel = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const textoDoTitulo = `Investimentos em ${rotuloDeExibicao(resumo.nome)}`;
  const idDoTitulo = `${id}-titulo`;

  useEffect(() => {
    titulo.current?.focus({ preventScroll: true });
    painel.current?.scrollIntoView?.({ behavior: prefereMenosMovimento() ? "auto" : "smooth", block: "start" });
  }, []);

  const linhas: Linha[] = [
    ...resumo.partes.map((parte) => ({
      chave: parte.investimentoId,
      nome: <span className={estilos.nome} title={parte.nomeDoInvestimento}>{parte.nomeDoInvestimento}</span>,
      valor: parte.valor,
      rendimento: parte.rendimento,
    })),
    { chave: "total", nome: <strong>Total</strong>, valor: resumo.valor, rendimento: resumo.rendimento, total: true },
  ];

  return (
    <Cartao className={estilos.painel} aria-labelledby={idDoTitulo}>
      <div id={id} ref={painel} className={estilos.conteudo}>
        <Titulo nivel="secao" id={idDoTitulo} ref={titulo} tabIndex={-1}>{textoDoTitulo}</Titulo>
        {resumo.partes.length === 0 ? (
          <>
            <p className={estilos.vazio}>Ainda não há investimentos nesta caixinha.</p>
            <Botao variante="terciario" seta onClick={aoAlocar}>Alocar em Investimentos</Botao>
          </>
        ) : tabela ? (
          <Tabela
            legenda={textoDoTitulo}
            colunas={[
              { chave: "investimento", titulo: "Investimento" },
              { chave: "valor", titulo: "Valor", numerica: true },
              { chave: "rendimento", titulo: "Rendimento", numerica: true },
            ]}
            linhas={linhas.map((l) => ({
              investimento: l.nome,
              valor: l.total ? <strong>{formatar(l.valor)}</strong> : formatar(l.valor),
              rendimento: <Rendimento texto={l.rendimento} />,
            }))}
          />
        ) : (
          <ul className={estilos.blocos} aria-label={textoDoTitulo}>
            {linhas.map((l) => (
              <li key={l.chave} className={estilos.bloco} data-total={l.total || undefined}>
                <div className={estilos.nomeDoBloco}>{l.nome}</div>
                <dl className={estilos.pares}>
                  <div>
                    <dt>Valor</dt>
                    <dd>{l.total ? <strong>{formatar(l.valor)}</strong> : formatar(l.valor)}</dd>
                  </div>
                  <div>
                    <dt>Rendimento</dt>
                    <dd><Rendimento texto={l.rendimento} /></dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Cartao>
  );
}
